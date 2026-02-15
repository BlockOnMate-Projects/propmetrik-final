/**
 * Off-Chain Payment Attestation Service
 *
 * Records off-chain (NOWPayments) payment attestations on the PROPMETRIKPayments
 * smart contract, creating an immutable on-chain audit trail for every payment —
 * even when the settlement itself happened off-chain (BTC, SOL, LTC, etc.).
 *
 * Flow:
 *   1. NOWPayments IPN webhook fires with status === 'finished'
 *   2. processIpnCallback() updates DB, returns action
 *   3. Webhook handler calls attestationService.attestOffChainPayment(reference)
 *   4. This service queries DB for full payment details, computes attestation hash,
 *      and calls contract.recordOffChainPayment() via the registrar signer.
 *
 * The attestation hash is keccak256(abi.encode(13 payment fields)), allowing
 * any auditor to reconstruct the hash from off-chain data and verify it matches
 * what's stored on-chain via contract.verifyAttestation().
 *
 * @module shared-services/payments/crypto/attestationService
 */

import { ethers } from 'ethers';
import { pool } from '../../../src/database';
import { logger } from '../../../src/utils/logger';
import { CryptoConfig, CryptoPaymentType, PAYMENT_TYPE_TO_CONTRACT, loadCryptoConfig } from './types';
import contractArtifact from './abi/PROPMETRIKPayments.json';

const contractAbi = contractArtifact.abi;

// Network names for ethers provider
const CHAIN_NAMES: Record<number, string> = {
  1: 'mainnet',
  137: 'polygon',
  80002: 'amoy',
  11155111: 'sepolia',
};

// ─── Constants ───────────────────────────────────────────────

/** Gas limit budget for recordOffChainPayment (< 120k in tests) */
const ATTESTATION_GAS_LIMIT = 200_000n;

/** Max retries for transient RPC failures */
const MAX_RETRIES = 3;

/** Delay between retries (ms) */
const RETRY_DELAY_MS = 2000;

// ─── Types ───────────────────────────────────────────────────

interface AttestationData {
  paymentReference: string;
  recipientEntityId: string;
  paymentType: CryptoPaymentType;
  payCurrency: string;
  payChain: string;
  amountUsd6: bigint;
  payerAmountRaw: bigint;
  payerDecimals: number;
  outcomeCurrency: string;
  outcomeAmountRaw: bigint;
  outcomeDecimals: number;
  externalPaymentId: string;
  timestamp: number;
}

interface AttestationResult {
  success: boolean;
  txHash?: string;
  attestationHash?: string;
  gasUsed?: bigint;
  error?: string;
}

// ─── Service ─────────────────────────────────────────────────

class AttestationService {
  private config: CryptoConfig | null;
  private provider: ethers.JsonRpcProvider | null = null;
  private contract: ethers.Contract | null = null;
  private signer: ethers.Wallet | null = null;

  constructor() {
    this.config = loadCryptoConfig();
    if (this.config) {
      this.initProvider();
    }
  }

  private initProvider(): void {
    if (!this.config) return;

    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl, {
      chainId: this.config.chainId,
      name: CHAIN_NAMES[this.config.chainId] || `chain-${this.config.chainId}`,
    });

    this.contract = new ethers.Contract(
      this.config.contractAddress,
      contractAbi,
      this.provider,
    );

    // Use admin key as registrar signer (same key that registers recipients)
    if (this.config.adminPrivateKey) {
      this.signer = new ethers.Wallet(this.config.adminPrivateKey, this.provider);
    }
  }

  /** Check if attestation rail is configured and ready */
  isConfigured(): boolean {
    return !!(this.config && this.contract && this.signer);
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Attest an off-chain (NOWPayments) payment on the smart contract.
   *
   * Queries the DB for full payment details, computes the attestation hash,
   * and submits a transaction to recordOffChainPayment().
   *
   * @param paymentReference  The PM-RENT-... style reference (= order_id in NOWPayments)
   */
  async attestOffChainPayment(paymentReference: string): Promise<AttestationResult> {
    if (!this.isConfigured()) {
      logger.warn('Attestation service not configured, skipping attestation', { paymentReference });
      return { success: false, error: 'Attestation service not configured' };
    }

    try {
      // 1. Gather all payment data from DB
      const data = await this.gatherAttestationData(paymentReference);
      if (!data) {
        return { success: false, error: `Payment data not found for reference: ${paymentReference}` };
      }

      // 2. Compute attestation hash
      const attestationHash = this.computeAttestationHash(data);

      // 3. Compute bytes32 values for contract call
      const referenceHash = ethers.keccak256(ethers.toUtf8Bytes(data.paymentReference));
      const entityIdHash = ethers.keccak256(ethers.toUtf8Bytes(data.recipientEntityId));

      // 4. Submit on-chain with retries
      const result = await this.submitAttestation(
        referenceHash,
        entityIdHash,
        data.paymentType,
        data.payCurrency,
        data.outcomeCurrency,
        data.amountUsd6,
        data.externalPaymentId,
        attestationHash,
        data.timestamp,
      );

      // 5. Record the attestation result in DB
      await this.recordAttestationResult(paymentReference, result, attestationHash);

      if (result.success) {
        logger.info('Off-chain payment attested on-chain', {
          paymentReference,
          txHash: result.txHash,
          attestationHash,
          gasUsed: result.gasUsed?.toString(),
        });
      }

      return result;
    } catch (error: any) {
      logger.error('Attestation failed', {
        paymentReference,
        error: error.message,
        stack: error.stack,
      });
      return { success: false, error: error.message };
    }
  }

  // ─── Data Gathering ────────────────────────────────────────

  /**
   * Pull all fields needed for the attestation hash from our DB.
   */
  private async gatherAttestationData(paymentReference: string): Promise<AttestationData | null> {
    // Join nowpayments_payments with payment_transactions for the full picture
    const result = await pool.query(`
      SELECT
        np.payment_reference,
        np.nowpayments_id,
        np.pay_currency,
        np.pay_amount,
        np.actually_paid,
        np.price_amount,
        np.price_currency,
        np.outcome_currency,
        np.outcome_amount,
        np.settlement_mode,
        np.recipient_entity_type,
        np.recipient_entity_id,
        np.finished_at,
        pt.payment_type,
        pt.gross_amount
      FROM nowpayments_payments np
      LEFT JOIN payment_transactions pt ON pt.reference = np.payment_reference
      WHERE np.payment_reference = $1
        AND np.status = 'finished'
      LIMIT 1
    `, [paymentReference]);

    if (result.rows.length === 0) {
      logger.warn('No finished NOWPayments record found for attestation', { paymentReference });
      return null;
    }

    const row = result.rows[0];

    // Resolve payment type
    const paymentTypeStr = (row.payment_type || 'rent').toLowerCase();
    const paymentType = PAYMENT_TYPE_TO_CONTRACT[paymentTypeStr] ?? CryptoPaymentType.RENT;

    // Determine chain from pay_currency (NOWPayments ticker → chain)
    const payChain = this.resolveChain(row.pay_currency);

    // USD amount scaled to 6 decimals (contract uses uint256 with 6 decimals)
    const usdAmount = parseFloat(row.price_amount || row.gross_amount || '0');
    const amountUsd6 = BigInt(Math.round(usdAmount * 1_000_000));

    // Pay amount: use actually_paid if available, else pay_amount
    const payAmount = parseFloat(row.actually_paid || row.pay_amount || '0');
    const { rawAmount: payerAmountRaw, decimals: payerDecimals } = this.normalizeAmount(payAmount, row.pay_currency);

    // Outcome amount
    const outcomeAmount = parseFloat(row.outcome_amount || '0');
    const outcomeCurrency = row.outcome_currency || row.pay_currency || '';
    const { rawAmount: outcomeAmountRaw, decimals: outcomeDecimals } = this.normalizeAmount(outcomeAmount, outcomeCurrency);

    // Timestamp (use finished_at if available, else now)
    const finishedAt = row.finished_at ? new Date(row.finished_at) : new Date();
    const timestamp = Math.floor(finishedAt.getTime() / 1000);

    // Entity ID for contract (same format as the contract: "entity_type + entity_id")
    const recipientEntityId = `${row.recipient_entity_type || 'organization'}:${row.recipient_entity_id || ''}`;

    return {
      paymentReference,
      recipientEntityId,
      paymentType,
      payCurrency: (row.pay_currency || '').toLowerCase(),
      payChain,
      amountUsd6,
      payerAmountRaw,
      payerDecimals,
      outcomeCurrency: outcomeCurrency.toLowerCase(),
      outcomeAmountRaw,
      outcomeDecimals,
      externalPaymentId: String(row.nowpayments_id || ''),
      timestamp,
    };
  }

  // ─── Hash Computation ─────────────────────────────────────

  /**
   * Compute the attestation hash: keccak256 of ABI-encoded 13 payment fields.
   * This matches the hash that auditors will reconstruct off-chain to verify.
   */
  computeAttestationHash(data: AttestationData): string {
    const referenceHash = ethers.keccak256(ethers.toUtf8Bytes(data.paymentReference));
    const entityIdHash = ethers.keccak256(ethers.toUtf8Bytes(data.recipientEntityId));

    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'bytes32',  // paymentReference (hashed)
          'bytes32',  // recipientEntityId (hashed)
          'uint8',    // paymentType
          'string',   // payCurrency
          'string',   // payChain
          'uint256',  // amountUsd6
          'uint256',  // payerAmountRaw
          'uint8',    // payerDecimals
          'string',   // outcomeCurrency
          'uint256',  // outcomeAmountRaw
          'uint8',    // outcomeDecimals
          'string',   // externalPaymentId
          'uint256',  // timestamp
        ],
        [
          referenceHash,
          entityIdHash,
          data.paymentType,
          data.payCurrency,
          data.payChain,
          data.amountUsd6,
          data.payerAmountRaw,
          data.payerDecimals,
          data.outcomeCurrency,
          data.outcomeAmountRaw,
          data.outcomeDecimals,
          data.externalPaymentId,
          data.timestamp,
        ],
      ),
    );
  }

  // ─── On-Chain Submission ──────────────────────────────────

  /**
   * Submit the attestation transaction with retry logic.
   */
  private async submitAttestation(
    referenceHash: string,
    entityIdHash: string,
    paymentType: CryptoPaymentType,
    payCurrency: string,
    outcomeCurrency: string,
    amountUsd6: bigint,
    externalPaymentId: string,
    attestationHash: string,
    timestamp: number,
  ): Promise<AttestationResult> {
    const signedContract = this.contract!.connect(this.signer!) as ethers.Contract;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tx = await signedContract.recordOffChainPayment(
          referenceHash,
          entityIdHash,
          paymentType,
          payCurrency,
          outcomeCurrency,
          amountUsd6,
          externalPaymentId,
          attestationHash,
          timestamp,
          { gasLimit: ATTESTATION_GAS_LIMIT },
        );

        logger.info('Attestation tx submitted', {
          txHash: tx.hash,
          attempt,
          nonce: tx.nonce,
        });

        // Wait for 1 confirmation
        const receipt = await tx.wait(1);

        return {
          success: true,
          txHash: receipt.hash,
          attestationHash,
          gasUsed: receipt.gasUsed,
        };
      } catch (error: any) {
        const isDuplicate = error.message?.includes('Duplicate reference');
        if (isDuplicate) {
          // Already attested (maybe by a previous retry or manual attestation)
          logger.info('Payment already attested on-chain', { referenceHash });
          return {
            success: true,
            attestationHash,
            error: 'Already attested (duplicate reference)',
          };
        }

        logger.warn(`Attestation attempt ${attempt}/${MAX_RETRIES} failed`, {
          error: error.message,
          code: error.code,
        });

        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * attempt);
        } else {
          return {
            success: false,
            error: `All ${MAX_RETRIES} attempts failed: ${error.message}`,
          };
        }
      }
    }

    return { success: false, error: 'Unexpected: exhausted retries without result' };
  }

  // ─── DB Recording ─────────────────────────────────────────

  /**
   * Record the attestation result back to the DB for audit.
   */
  private async recordAttestationResult(
    paymentReference: string,
    result: AttestationResult,
    attestationHash: string,
  ): Promise<void> {
    try {
      await pool.query(`
        UPDATE nowpayments_payments SET
          attestation_hash = $1,
          attestation_tx_hash = $2,
          attestation_status = $3,
          attestation_error = $4,
          attested_at = CASE WHEN $3 = 'success' THEN NOW() ELSE attested_at END
        WHERE payment_reference = $5
      `, [
        attestationHash,
        result.txHash || null,
        result.success ? 'success' : 'failed',
        result.error || null,
        paymentReference,
      ]);
    } catch (err: any) {
      // Non-fatal: the on-chain attestation still succeeded
      logger.warn('Failed to record attestation result in DB', {
        paymentReference,
        error: err.message,
      });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Map a NOWPayments ticker to its chain name.
   */
  private resolveChain(ticker: string): string {
    if (!ticker) return 'unknown';
    const t = ticker.toLowerCase();

    // NOWPayments ticker → chain mapping
    const chainMap: Record<string, string> = {
      btc: 'bitcoin',
      eth: 'ethereum',
      ltc: 'litecoin',
      sol: 'solana',
      trx: 'tron',
      bnb: 'bsc',
      bnbbsc: 'bsc',
      matic: 'polygon',
      maticpolygon: 'polygon',
      usdtmatic: 'polygon',
      usdcmatic: 'polygon',
      wbtcmatic: 'polygon',
      usdterc20: 'ethereum',
      usdcerc20: 'ethereum',
      usdttrc20: 'tron',
      usdtbsc: 'bsc',
      usdcsol: 'solana',
    };

    return chainMap[t] || t;
  }

  /**
   * Normalize a human-readable amount to raw integer + decimals based on currency.
   * E.g., 0.015 BTC → { rawAmount: 1500000n, decimals: 8 }
   */
  private normalizeAmount(amount: number, currency: string): { rawAmount: bigint; decimals: number } {
    const decimalsMap: Record<string, number> = {
      btc: 8,
      wbtc: 8,
      wbtcmatic: 8,
      eth: 18,
      weth: 18,
      matic: 18,
      maticpolygon: 18,
      sol: 9,
      ltc: 8,
      trx: 6,
      bnb: 18,
      bnbbsc: 18,
      usdt: 6,
      usdterc20: 6,
      usdtmatic: 6,
      usdttrc20: 6,
      usdtbsc: 6,
      usdc: 6,
      usdcerc20: 6,
      usdcmatic: 6,
      usdcsol: 6,
    };

    const t = (currency || '').toLowerCase();
    const decimals = decimalsMap[t] ?? 8; // Default to 8 for unknown
    const rawAmount = BigInt(Math.round(amount * 10 ** decimals));

    return { rawAmount, decimals };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Singleton ──────────────────────────────────────────────

export const attestationService = new AttestationService();
