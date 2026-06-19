/**
 * Shared crypto payout-wallet logic for every service (property management, projects,
 * deals/CRM, valuation). All four expose `GET/POST /payments/crypto-wallet`; this
 * centralizes the storage model so they behave identically.
 *
 * Storage model (see /blockchain/DEPLOYMENT_GUIDE.md):
 *  - `crypto_wallet_address` VARCHAR(42) — EVM on-chain wallet ONLY (Polygon direct
 *    settlement via the smart contract). A non-EVM address (e.g. Solana ~44 chars)
 *    overflows it → 500, so it must NOT be written there.
 *  - `crypto_settlement_wallet_address` VARCHAR(200) — the real payout destination for
 *    ANY chain. Non-EVM coins (SOL/BTC/…) are paid out via NOWPayments.
 *  - `crypto_preferred_settlement_coin` / `_chain` + `crypto_use_nowpayments_settlement`.
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';

const EVM_CHAINS = ['polygon', 'ethereum', 'bsc'];

export interface SaveCryptoPayoutInput {
  entityId: string;
  serviceType: string; // property_management | project_management | deals | valuation
  walletAddress: string;
  payoutCoin?: string;
  payoutChain?: string;
  entityType?: string; // default 'organization'
}

export interface CryptoPayoutResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Validate a wallet address against the SELECTED chain. Returns an error string or null. */
export function validateWalletForChain(addr: string, chain: string): string | null {
  const a = (addr || '').trim();
  if (!a) return 'Wallet address is required';
  if (EVM_CHAINS.includes(chain)) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)) return 'Invalid address — expected an EVM address (0x + 40 hex chars).';
    if (/^0x0{40}$/i.test(a)) return 'The zero address (0x000…000) cannot receive funds. Enter your real wallet.';
    return null;
  }
  switch (chain) {
    case 'solana':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) ? null : 'Invalid Solana address (expected a base58 address).';
    case 'bitcoin':
      return /^(bc1[a-z0-9]{20,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a) ? null : 'Invalid Bitcoin address.';
    case 'litecoin':
      return /^(ltc1[a-z0-9]{20,71}|[LM][a-km-zA-HJ-NP-Z1-9]{26,33})$/.test(a) ? null : 'Invalid Litecoin address.';
    case 'tron':
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) ? null : 'Invalid Tron address (expected T…).';
    default:
      // Unknown chain — light sanity check; NOWPayments validates at payout time.
      return /^[A-Za-z0-9]{20,100}$/.test(a) ? null : 'Invalid wallet address for the selected currency.';
  }
}

class CryptoPayoutService {
  /**
   * Save/update a service's crypto payout wallet. Returns an HTTP-shaped
   * { status, body } so each route is a thin wrapper.
   */
  async save(input: SaveCryptoPayoutInput): Promise<CryptoPayoutResponse> {
    const entityType = input.entityType || 'organization';
    const chain = String(input.payoutChain || 'polygon').toLowerCase();
    const coin = String(input.payoutCoin || 'usdt').toLowerCase();
    const isPolygonDirect = chain === 'polygon';
    const isEvm = EVM_CHAINS.includes(chain);
    const wallet = String(input.walletAddress || '').trim();

    const validationError = validateWalletForChain(wallet, chain);
    if (validationError) return { status: 400, body: { error: validationError } };

    // Only EVM wallets fit the narrow on-chain column; everything goes in the wide one.
    const evmWallet = isEvm ? wallet : null;
    const useNowPayments = !isPolygonDirect;

    const upsert = await pool.query(
      `INSERT INTO payment_accounts (
          id, entity_type, entity_id, service_type,
          crypto_wallet_address, crypto_settlement_wallet_address,
          crypto_preferred_settlement_coin, crypto_preferred_settlement_chain,
          crypto_use_nowpayments_settlement, crypto_wallet_registered_at,
          crypto_settlement_configured_at, updated_at, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW(), TRUE)
       ON CONFLICT (entity_id, entity_type, service_type) DO UPDATE SET
          crypto_wallet_address = $4,
          crypto_settlement_wallet_address = $5,
          crypto_preferred_settlement_coin = $6,
          crypto_preferred_settlement_chain = $7,
          crypto_use_nowpayments_settlement = $8,
          crypto_wallet_registered_at = NOW(),
          crypto_settlement_configured_at = NOW(),
          updated_at = NOW()
       RETURNING id, crypto_settlement_wallet_address, crypto_wallet_registered_at`,
      [entityType, input.entityId, input.serviceType, evmWallet, wallet, coin, chain, useNowPayments]
    );
    const row = upsert.rows[0];

    // Polygon direct → register the recipient on our smart contract, then verified.
    // NOWPayments chains → no on-chain step; a format-valid address is "verified"
    // (NOWPayments rejects a bad destination at payout time).
    let isVerified = false;
    if (isPolygonDirect) {
      try {
        const { cryptoPaymentService } = await import('../../../shared-services/payments/crypto');
        if (cryptoPaymentService.isConfigured()) {
          await cryptoPaymentService.registerRecipientWallet(entityType, input.entityId, wallet, input.serviceType);
          isVerified = true;
        }
      } catch (err) {
        logger.warn('cryptoPayoutService: on-chain registration failed', {
          serviceType: input.serviceType,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    } else {
      isVerified = true;
    }
    if (isVerified) {
      await pool.query(`UPDATE payment_accounts SET crypto_wallet_verified = true WHERE id = $1`, [row.id]);
    }

    return {
      status: 200,
      body: {
        success: true,
        walletAddress: row.crypto_settlement_wallet_address,
        payoutCoin: coin,
        payoutChain: chain,
        useNowPayments,
        isVerified,
        registeredAt: row.crypto_wallet_registered_at,
      },
    };
  }

  /** Read a service's crypto payout config. */
  async get(entityId: string, serviceType: string, entityType = 'organization'): Promise<Record<string, unknown>> {
    const result = await pool.query(
      `SELECT crypto_wallet_address, crypto_settlement_wallet_address,
              crypto_wallet_verified, crypto_wallet_registered_at,
              crypto_preferred_settlement_coin, crypto_preferred_settlement_chain,
              crypto_use_nowpayments_settlement
       FROM payment_accounts
       WHERE entity_id = $1 AND entity_type = $2 AND service_type = $3 AND is_active = TRUE
       LIMIT 1`,
      [entityId, entityType, serviceType]
    );

    const row = result.rows[0];
    const walletAddress = row?.crypto_settlement_wallet_address || row?.crypto_wallet_address;
    if (!row || !walletAddress) return { configured: false };

    const chain = row.crypto_preferred_settlement_chain || 'polygon';
    return {
      configured: true,
      walletAddress,
      payoutCoin: row.crypto_preferred_settlement_coin || 'usdt',
      payoutChain: chain,
      useNowPayments: row.crypto_use_nowpayments_settlement ?? (chain !== 'polygon'),
      isVerified: row.crypto_wallet_verified || false,
      registeredAt: row.crypto_wallet_registered_at,
    };
  }
}

export const cryptoPayoutService = new CryptoPayoutService();
export default cryptoPayoutService;
