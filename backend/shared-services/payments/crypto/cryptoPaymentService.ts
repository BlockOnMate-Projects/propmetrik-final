/**
 * Crypto Payment Service
 * Orchestrates multi-token ERC20 payment preparation and on-chain verification.
 *
 * Responsibilities:
 *   1. initializeCryptoPayment() — pre-flight: convert GHS→token, compute fee,
 *      return all values the frontend needs for wallet signing.
 *   2. verifyOnChainPayment() — post-confirmation: read tx receipt + event,
 *      validate amounts match, update payment_transactions ledger.
 *   3. registerRecipientWallet() — admin: register a PM entity on-chain.
 *   4. getRecipientWallet() — view: look up a registered wallet.
 *
 * Supports v2 multi-token contract: USDT, USDC, WETH (any ERC20 on allowlist).
 *
 * @module shared-services/payments/crypto/cryptoPaymentService
 */

import { ethers } from 'ethers';
import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import {
  CryptoPaymentInitParams,
  CryptoPaymentInitResult,
  CryptoVerifyResult,
  CryptoConfig,
  CryptoPaymentType,
  PAYMENT_TYPE_TO_CONTRACT,
  loadCryptoConfig,
} from './types';
import { exchangeRateService } from './exchangeRateService';
import contractArtifact from './abi/PROPMETRIKPayments.json';
const contractAbi = contractArtifact.abi;

// Network name map for ethers provider
const CHAIN_NAMES: Record<number, string> = {
  1: 'mainnet',
  137: 'polygon',
  80002: 'amoy',
  11155111: 'sepolia',
};

// =====================================================
// Service Class
// =====================================================

class CryptoPaymentService {
  private config: CryptoConfig | null;
  private provider: ethers.JsonRpcProvider | null = null;
  private contract: ethers.Contract | null = null;
  private adminSigner: ethers.Wallet | null = null;

  constructor() {
    this.config = loadCryptoConfig();
    if (this.config) {
      this.initProvider();
    }
  }

  /** Lazy-initialise JSON-RPC provider and contract instance */
  private initProvider(): void {
    if (!this.config) return;

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl, {
      chainId: this.config.chainId,
      name: CHAIN_NAMES[this.config.chainId] || `chain-${this.config.chainId}`,
    });

    // Read-only contract (for view functions + event parsing)
    this.contract = new ethers.Contract(
      this.config.contractAddress,
      contractAbi,
      this.provider,
    );

    // Admin signer (for registerRecipient, etc.)
    if (this.config.adminPrivateKey) {
      this.adminSigner = new ethers.Wallet(this.config.adminPrivateKey, this.provider);
    }
  }

  /** Check if crypto rail is configured and ready */
  isConfigured(): boolean {
    return this.config !== null && this.contract !== null;
  }

  // =======================================================
  // 1. INITIALIZE — Pre-flight for frontend wallet flow
  // =======================================================

  /**
   * Prepare all values the frontend needs to call `processPayment()` on-chain.
   * v2: requires tokenAddress — the ERC20 token the user wants to pay with.
   * Does NOT touch the blockchain — pure read + calculation.
   */
  async initializeCryptoPayment(
    params: CryptoPaymentInitParams,
  ): Promise<CryptoPaymentInitResult> {
    this.ensureConfigured();

    const {
      paymentType,
      entityId,
      entityType,
      principalAmountGHS,
      payerWalletAddress,
      paymentReference,
      tokenAddress,
      metadata,
    } = params;

    // --- Validate payment type ---
    const contractPaymentType = PAYMENT_TYPE_TO_CONTRACT[paymentType];
    if (contractPaymentType === undefined) {
      throw new Error(`Unsupported crypto payment type: ${paymentType}`);
    }

    // --- Validate token is on the on-chain allowlist ---
    const tokenInfo = await this.contract!.isTokenAccepted(tokenAddress);
    if (!tokenInfo.enabled) {
      throw new Error(`Token ${tokenAddress} is not accepted by the contract`);
    }
    const tokenDecimals = Number(tokenInfo.decimals);
    const tokenSymbol: string = tokenInfo.symbol;

    // --- Convert GHS → token amount (scaled to token decimals) ---
    const rateResult = await exchangeRateService.convertGHStoToken(principalAmountGHS, tokenDecimals);
    const principalAmount = rateResult.tokenAmount;
    const principalSubunits = rateResult.tokenSubunits;

    // --- Calculate fee via on-chain view function (v2: token, paymentType, amount) ---
    const feeSubunits = await this.contract!.calculateFee(
      tokenAddress,
      contractPaymentType,
      principalSubunits,
    ) as bigint;

    const feeAmount = Number(feeSubunits) / 10 ** tokenDecimals;
    const totalSubunits = principalSubunits + feeSubunits;
    const totalAmount = principalAmount + feeAmount;

    // --- Build entity ID (matches contract's keccak256(entityType, entityId)) ---
    const recipientEntityId = ethers.solidityPackedKeccak256(
      ['string', 'string'],
      [entityType, entityId],
    );

    // --- Get recipient wallet from contract ---
    const recipientWallet: string = await this.contract!.getRecipientWallet(recipientEntityId);
    if (recipientWallet === ethers.ZeroAddress) {
      throw new Error(
        `Recipient entity ${entityType}:${entityId} not registered on-chain. ` +
        `Admin must call registerRecipientWallet() first.`,
      );
    }

    // --- Build reference hash ---
    const referenceHash = ethers.solidityPackedKeccak256(['string'], [paymentReference]);

    // --- Check for duplicate ---
    const alreadyProcessed: boolean = await this.contract!.isReferenceProcessed(referenceHash);
    if (alreadyProcessed) {
      throw new Error(`Payment reference ${paymentReference} already processed on-chain`);
    }

    // --- ABI-encode metadata (stored on-chain) ---
    const abiEncodedMetadata = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string'],
      [JSON.stringify(metadata)],
    );

    // --- Check if swap is needed (recipient's preferred token) ---
    const recipientPreferredTokenRaw: string = await this.contract!.recipientPreferredTokens(recipientEntityId);
    const recipientPreferredToken = recipientPreferredTokenRaw === ethers.ZeroAddress ? null : recipientPreferredTokenRaw;

    const needsSwap = recipientPreferredToken !== null
      && recipientPreferredToken.toLowerCase() !== tokenAddress.toLowerCase();

    // If swap is needed, get the preferred token info
    let swapInfo: {
      preferredToken: string;
      preferredTokenSymbol: string;
      preferredTokenDecimals: number;
      useSwapFunction: boolean;
    } | null = null;

    if (needsSwap) {
      const prefTokenInfo = await this.contract!.isTokenAccepted(recipientPreferredToken);
      swapInfo = {
        preferredToken: recipientPreferredToken!,
        preferredTokenSymbol: prefTokenInfo.symbol as string,
        preferredTokenDecimals: Number(prefTokenInfo.decimals),
        useSwapFunction: true,
      };
    }

    // --- Record pending transaction in DB ---
    await this.recordPendingCryptoTransaction(params, {
      principalAmount,
      feeAmount,
      totalAmount,
      tokenSymbol,
      tokenDecimals,
      exchangeRate: rateResult.rate,
      rateSource: rateResult.source,
      referenceHash,
    });

    return {
      contractAddress: this.config!.contractAddress,
      recipientEntityId,
      recipientWallet,
      tokenAddress,
      tokenSymbol,
      tokenDecimals,
      principalAmount,
      feeAmount,
      totalAmount,
      principalSubunits: principalSubunits.toString(),
      feeSubunits: feeSubunits.toString(),
      totalSubunits: totalSubunits.toString(),
      exchangeRate: rateResult.rate,
      referenceHash,
      paymentReference,
      abiEncodedMetadata,
      contractPaymentType,
      rateSource: rateResult.source,
      rateTimestamp: rateResult.rateTimestamp,
      chainId: this.config!.chainId,
      swapInfo,
    };
  }

  // =======================================================
  // 2. VERIFY — After user submits on-chain tx
  // =======================================================

  /**
   * Verify an on-chain payment by transaction hash.
   * Parses the PaymentProcessed event and updates the payment_transactions record.
   */
  async verifyOnChainPayment(txHash: string): Promise<CryptoVerifyResult> {
    this.ensureConfigured();

    try {
      // Wait for tx confirmation (up to 2 minutes)
      const receipt = await this.provider!.waitForTransaction(txHash, 1, 120_000);
      if (!receipt) {
        return { success: false, error: 'Transaction not found or timed out' };
      }

      if (receipt.status !== 1) {
        // Update DB: mark as failed
        await this.updateCryptoTransactionStatus(txHash, 'failed', receipt.blockNumber);
        return { success: false, error: 'Transaction reverted on-chain' };
      }

      // Parse PaymentProcessed event from logs
      const event = this.parsePaymentProcessedEvent(receipt);
      if (!event) {
        return { success: false, error: 'PaymentProcessed event not found in tx logs' };
      }

      // Look up token info for decimals
      let tokenDecimals = 6; // default fallback
      let tokenSymbol = 'UNKNOWN';
      try {
        const tokenInfo = await this.contract!.isTokenAccepted(event.token);
        tokenDecimals = Number(tokenInfo.decimals);
        tokenSymbol = tokenInfo.symbol;
      } catch {
        logger.warn({ token: event.token }, 'Could not look up token info for verify result');
      }

      // Update DB: mark as completed
      await this.updateCryptoTransactionFromEvent(txHash, receipt.blockNumber, event);

      return {
        success: true,
        paymentReference: event.paymentReference,
        txHash,
        blockNumber: receipt.blockNumber,
        payerWallet: event.payer,
        recipientWallet: event.recipientWallet,
        tokenAddress: event.token,
        tokenSymbol,
        principalAmount: Number(event.principalAmount) / 10 ** tokenDecimals,
        feeAmount: Number(event.fee) / 10 ** tokenDecimals,
      };
    } catch (err: any) {
      logger.error({ err, txHash }, 'Failed to verify crypto payment');
      return { success: false, error: err.message || 'Verification failed' };
    }
  }

  // =======================================================
  // 3. ADMIN — Register / manage recipients on-chain
  // =======================================================

  /**
   * Register a PROPMETRIK entity (org, deal manager, etc.) on-chain.
   * Only callable by contract owner (admin signer).
   */
  async registerRecipientWallet(
    entityType: string,
    entityId: string,
    walletAddress: string,
  ): Promise<{ txHash: string; entityIdHash: string }> {
    this.ensureConfigured();
    if (!this.adminSigner) {
      throw new Error('Admin signer not configured (CRYPTO_ADMIN_PRIVATE_KEY missing)');
    }

    const entityIdHash = ethers.solidityPackedKeccak256(
      ['string', 'string'],
      [entityType, entityId],
    );

    const contractWithSigner = this.contract!.connect(this.adminSigner) as ethers.Contract;
    const tx = await contractWithSigner.registerRecipient(entityIdHash, walletAddress);
    const receipt = await tx.wait(1);

    logger.info(
      { entityType, entityId, walletAddress, txHash: receipt.hash },
      'Recipient registered on-chain',
    );

    // Update payment_accounts in DB
    await pool.query(
      `UPDATE payment_accounts
       SET crypto_wallet_address = $1,
           crypto_wallet_verified = true,
           crypto_wallet_registered_at = NOW()
       WHERE entity_type = $2 AND entity_id = $3`,
      [walletAddress, entityType, entityId],
    );

    return { txHash: receipt.hash, entityIdHash };
  }

  /**
   * Look up a recipient wallet from the on-chain registry.
   */
  async getRecipientWallet(entityType: string, entityId: string): Promise<string | null> {
    this.ensureConfigured();

    const entityIdHash = ethers.solidityPackedKeccak256(
      ['string', 'string'],
      [entityType, entityId],
    );

    const wallet: string = await this.contract!.getRecipientWallet(entityIdHash);
    return wallet === ethers.ZeroAddress ? null : wallet;
  }

  // =======================================================
  // 3b. ADMIN — Recipient preferred token (auto-conversion)
  // =======================================================

  /**
   * Set a recipient's preferred token for auto-conversion.
   * When a tenant pays in a different token, the contract swaps via DEX.
   *
   * @param entityType  e.g. "organization", "deal_manager"
   * @param entityId    UUID of the entity
   * @param preferredTokenAddress  ERC20 address (or zero address to clear preference)
   */
  async setRecipientPreferredToken(
    entityType: string,
    entityId: string,
    preferredTokenAddress: string,
  ): Promise<{ txHash: string; entityIdHash: string }> {
    this.ensureConfigured();
    if (!this.adminSigner) {
      throw new Error('Admin signer not configured (CRYPTO_ADMIN_PRIVATE_KEY missing)');
    }

    const entityIdHash = ethers.solidityPackedKeccak256(
      ['string', 'string'],
      [entityType, entityId],
    );

    const contractWithSigner = this.contract!.connect(this.adminSigner) as ethers.Contract;
    const tx = await contractWithSigner.setRecipientPreferredToken(entityIdHash, preferredTokenAddress);
    const receipt = await tx.wait(1);

    logger.info(
      { entityType, entityId, preferredTokenAddress, txHash: receipt.hash },
      'Recipient preferred token set on-chain',
    );

    // Persist preference in DB
    await pool.query(
      `UPDATE payment_accounts
       SET crypto_preferred_token = $1,
           crypto_preferred_token_set_at = NOW()
       WHERE entity_type = $2 AND entity_id = $3`,
      [preferredTokenAddress === ethers.ZeroAddress ? null : preferredTokenAddress, entityType, entityId],
    );

    return { txHash: receipt.hash, entityIdHash };
  }

  /**
   * Look up a recipient's preferred token from the on-chain registry.
   */
  async getRecipientPreferredToken(entityType: string, entityId: string): Promise<string | null> {
    this.ensureConfigured();

    const entityIdHash = ethers.solidityPackedKeccak256(
      ['string', 'string'],
      [entityType, entityId],
    );

    const preferredToken: string = await this.contract!.recipientPreferredTokens(entityIdHash);
    return preferredToken === ethers.ZeroAddress ? null : preferredToken;
  }

  /**
   * Get contract-level fee config for a payment type.
   */
  async getOnChainFeeConfig(paymentType: string): Promise<{
    basisPoints: number;
    minimumFeeUSD6: number;
    enabled: boolean;
  }> {
    this.ensureConfigured();

    const contractType = PAYMENT_TYPE_TO_CONTRACT[paymentType];
    if (contractType === undefined) {
      throw new Error(`Unknown payment type: ${paymentType}`);
    }

    const config = await this.contract!.feeConfigs(contractType);
    return {
      basisPoints: Number(config.percentageBasisPoints),
      minimumFeeUSD6: Number(config.minimumFeeUSD6),
      enabled: config.enabled,
    };
  }

  /**
   * Check if a payment reference has been processed on-chain.
   */
  async isReferenceProcessed(paymentReference: string): Promise<boolean> {
    this.ensureConfigured();
    const hash = ethers.solidityPackedKeccak256(['string'], [paymentReference]);
    return this.contract!.isReferenceProcessed(hash);
  }

  // =======================================================
  // 4. PLATFORM CONFIG — Read/manage on-chain platform state
  // =======================================================

  /**
   * Get the current platform wallet address from the contract.
   */
  async getPlatformWallet(): Promise<string> {
    this.ensureConfigured();
    return this.contract!.propmetrikWallet();
  }

  /**
   * Update the platform wallet address on-chain.
   * Only callable by contract owner (admin signer via Safe multisig).
   */
  async updatePlatformWallet(newWallet: string): Promise<{ txHash: string }> {
    this.ensureConfigured();
    if (!this.adminSigner) {
      throw new Error('Admin signer not configured (CRYPTO_ADMIN_PRIVATE_KEY missing)');
    }

    const contractWithSigner = this.contract!.connect(this.adminSigner) as ethers.Contract;
    const tx = await contractWithSigner.updatePropmetrikWallet(newWallet);
    const receipt = await tx.wait(1);

    logger.info(
      { newWallet, txHash: receipt.hash },
      'Platform wallet updated on-chain',
    );

    return { txHash: receipt.hash };
  }

  /**
   * Get all accepted tokens from the contract's tokenList.
   * Returns empty array for v1 contracts that don't support multi-token.
   */
  async getAcceptedTokens(): Promise<Array<{
    address: string;
    symbol: string;
    decimals: number;
    enabled: boolean;
  }>> {
    this.ensureConfigured();

    try {
      const count: bigint = await this.contract!.getTokenCount();
      const tokens: Array<{ address: string; symbol: string; decimals: number; enabled: boolean }> = [];

      for (let i = 0; i < Number(count); i++) {
        const addr: string = await this.contract!.tokenList(i);
        const config = await this.contract!.acceptedTokens(addr);
        tokens.push({
          address: addr,
          symbol: config.symbol,
          decimals: Number(config.decimals),
          enabled: config.enabled,
        });
      }

      return tokens;
    } catch (err: any) {
      // v1 contract doesn't have getTokenCount/tokenList — return empty
      logger.warn({ err: err.message }, 'getAcceptedTokens failed (likely v1 contract), returning empty');
      return [];
    }
  }

  /**
   * Check if the contract supports multi-token functions (v2+).
   */
  async isMultiTokenContract(): Promise<boolean> {
    this.ensureConfigured();
    try {
      await this.contract!.getTokenCount();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Add a new token to the on-chain allowlist.
   */
  async addToken(tokenAddress: string, symbol: string, decimals: number): Promise<{ txHash: string }> {
    this.ensureConfigured();
    if (!this.adminSigner) {
      throw new Error('Admin signer not configured (CRYPTO_ADMIN_PRIVATE_KEY missing)');
    }

    const contractWithSigner = this.contract!.connect(this.adminSigner) as ethers.Contract;
    const tx = await contractWithSigner.addToken(tokenAddress, symbol, decimals);
    const receipt = await tx.wait(1);

    logger.info({ tokenAddress, symbol, decimals, txHash: receipt.hash }, 'Token added on-chain');
    return { txHash: receipt.hash };
  }

  /**
   * Enable or disable a token on the contract.
   */
  async setTokenEnabled(tokenAddress: string, enabled: boolean): Promise<{ txHash: string }> {
    this.ensureConfigured();
    if (!this.adminSigner) {
      throw new Error('Admin signer not configured (CRYPTO_ADMIN_PRIVATE_KEY missing)');
    }

    const contractWithSigner = this.contract!.connect(this.adminSigner) as ethers.Contract;
    const tx = await contractWithSigner.setTokenEnabled(tokenAddress, enabled);
    const receipt = await tx.wait(1);

    logger.info({ tokenAddress, enabled, txHash: receipt.hash }, 'Token toggled on-chain');
    return { txHash: receipt.hash };
  }

  /**
   * Remove a token from the on-chain allowlist.
   */
  async removeToken(tokenAddress: string): Promise<{ txHash: string }> {
    this.ensureConfigured();
    if (!this.adminSigner) {
      throw new Error('Admin signer not configured (CRYPTO_ADMIN_PRIVATE_KEY missing)');
    }

    const contractWithSigner = this.contract!.connect(this.adminSigner) as ethers.Contract;
    const tx = await contractWithSigner.removeToken(tokenAddress);
    const receipt = await tx.wait(1);

    logger.info({ tokenAddress, txHash: receipt.hash }, 'Token removed on-chain');
    return { txHash: receipt.hash };
  }

  // =======================================================
  // Private Helpers
  // =======================================================

  private ensureConfigured(): void {
    if (!this.config || !this.contract) {
      throw new Error(
        'Crypto payment rail not configured. Set POLYGON_RPC_URL and PROPMETRIK_CONTRACT_ADDRESS env vars.',
      );
    }
  }

  /**
   * Parse PaymentProcessed event from a transaction receipt.
   * v2 event includes `token` field.
   */
  private parsePaymentProcessedEvent(receipt: ethers.TransactionReceipt): {
    paymentReference: string;
    payer: string;
    recipientWallet: string;
    token: string;
    principalAmount: bigint;
    fee: bigint;
    paymentType: number;
  } | null {
    const iface = new ethers.Interface(contractAbi);

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed && parsed.name === 'PaymentProcessed') {
          return {
            paymentReference: parsed.args.paymentReference,
            payer: parsed.args.payer,
            recipientWallet: parsed.args.recipientWallet,
            token: parsed.args.token,
            principalAmount: parsed.args.principalAmount,
            fee: parsed.args.fee,
            paymentType: Number(parsed.args.paymentType),
          };
        }
      } catch {
        // Not our event — skip
      }
    }
    return null;
  }

  /**
   * Insert a pending crypto transaction into payment_transactions.
   * Called during initializeCryptoPayment, before the user signs on-chain.
   */
  private async recordPendingCryptoTransaction(
    params: CryptoPaymentInitParams,
    calc: {
      principalAmount: number;
      feeAmount: number;
      totalAmount: number;
      tokenSymbol: string;
      tokenDecimals: number;
      exchangeRate: number;
      rateSource: string;
      referenceHash: string;
    },
  ): Promise<void> {
    const { paymentType, entityId, paymentReference, payerWalletAddress, tokenAddress, metadata } = params;

    await pool.query(
      `INSERT INTO payment_transactions (
        reference, entity_type, entity_id, payment_type,
        amount, service_fee, total_amount, currency,
        payment_channel, status,
        payer_wallet, crypto_currency, crypto_token_address, exchange_rate,
        principal_crypto, fee_crypto,
        metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, 'GHS',
        'crypto', 'pending',
        $8, $9, $10, $11,
        $12, $13,
        $14, NOW(), NOW()
      )
      ON CONFLICT (reference) DO NOTHING`,
      [
        paymentReference,
        params.entityType,
        entityId,
        paymentType,
        Math.round(params.principalAmountGHS * 100), // pesewas
        Math.round(calc.feeAmount * 10 ** calc.tokenDecimals),
        Math.round(params.principalAmountGHS * 100),  // total GHS pesewas
        payerWalletAddress,
        calc.tokenSymbol,
        tokenAddress,
        calc.exchangeRate,
        Math.round(calc.principalAmount * 10 ** calc.tokenDecimals),
        Math.round(calc.feeAmount * 10 ** calc.tokenDecimals),
        JSON.stringify({ ...metadata, rate_source: calc.rateSource, token_decimals: calc.tokenDecimals, reference_hash: calc.referenceHash }),
      ],
    );
  }

  /**
   * Update transaction status after on-chain verification.
   */
  private async updateCryptoTransactionStatus(
    txHash: string,
    status: 'completed' | 'failed',
    blockNumber: number,
  ): Promise<void> {
    await pool.query(
      `UPDATE payment_transactions
       SET status = $1, tx_hash = $2, block_number = $3, updated_at = NOW()
       WHERE tx_hash = $2 OR (payment_channel = 'crypto' AND status = 'pending' AND payer_wallet IS NOT NULL)`,
      [status, txHash, blockNumber],
    );
  }

  /**
   * Full update from PaymentProcessed event.
   */
  private async updateCryptoTransactionFromEvent(
    txHash: string,
    blockNumber: number,
    event: {
      paymentReference: string;
      payer: string;
      recipientWallet: string;
      token: string;
      principalAmount: bigint;
      fee: bigint;
      paymentType: number;
    },
  ): Promise<void> {
    // Primary match: by reference_hash stored in metadata (precise, no race condition)
    const result = await pool.query(
      `UPDATE payment_transactions
       SET status = 'completed',
           tx_hash = $1,
           block_number = $2,
           payer_wallet = $3,
           recipient_wallet = $4,
           principal_crypto = $5,
           fee_crypto = $6,
           crypto_token_address = $7,
           updated_at = NOW()
       WHERE payment_channel = 'crypto'
         AND status = 'pending'
         AND metadata->>'reference_hash' = $8
       RETURNING reference`,
      [
        txHash,
        blockNumber,
        event.payer.toLowerCase(),
        event.recipientWallet.toLowerCase(),
        Number(event.principalAmount),
        Number(event.fee),
        event.token.toLowerCase(),
        event.paymentReference, // keccak256 hash
      ],
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info(
        { reference: result.rows[0].reference, txHash, blockNumber, payer: event.payer, token: event.token },
        'Crypto payment matched by reference_hash and updated to completed',
      );
      return;
    }

    // Fallback: match by payer + recipient (for legacy records without reference_hash)
    await pool.query(
      `UPDATE payment_transactions
       SET status = 'completed',
           tx_hash = $1,
           block_number = $2,
           payer_wallet = $3,
           recipient_wallet = $4,
           principal_crypto = $5,
           fee_crypto = $6,
           crypto_token_address = $7,
           updated_at = NOW()
       WHERE payment_channel = 'crypto'
         AND status = 'pending'
         AND payer_wallet = $3
         AND recipient_wallet = $4
       ORDER BY created_at ASC
       LIMIT 1`,
      [
        txHash,
        blockNumber,
        event.payer.toLowerCase(),
        event.recipientWallet.toLowerCase(),
        Number(event.principalAmount),
        Number(event.fee),
        event.token.toLowerCase(),
      ],
    );

    logger.info(
      { txHash, blockNumber, payer: event.payer, token: event.token },
      'Crypto payment transaction updated to completed (fallback match)',
    );
  }
}

// Singleton export
export const cryptoPaymentService = new CryptoPaymentService();
