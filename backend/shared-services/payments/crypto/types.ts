/**
 * Crypto Payment Types
 * Type definitions for the multi-token, multi-chain crypto payment rail.
 * Maps to PROPMETRIKPayments.sol v2 contract types and the payment_transactions ledger.
 *
 * @module shared-services/payments/crypto/types
 */

// =====================================================
// ENUMS (Mirror Solidity PaymentType enum)
// =====================================================

/** Maps to Solidity enum PaymentType { RENT=0, DEAL=1, PROJECT=2 } */
export enum CryptoPaymentType {
  RENT = 0,
  DEAL = 1,
  PROJECT = 2,
}

/** Maps backend PaymentType string to contract enum index */
export const PAYMENT_TYPE_TO_CONTRACT: Record<string, CryptoPaymentType> = {
  rent: CryptoPaymentType.RENT,
  deal: CryptoPaymentType.DEAL,
  project: CryptoPaymentType.PROJECT,
};

// =====================================================
// SERVICE PARAMS
// =====================================================

export interface CryptoPaymentInitParams {
  /** 'rent' | 'deal' | 'project' */
  paymentType: string;
  /** tenancy_id, deal_id, or project_id */
  entityId: string;
  /** 'organization' | 'deal_manager' | 'project_manager' */
  entityType: string;
  /** Original GHS amount (backend converts to token equivalent) */
  principalAmountGHS: number;
  /** Connected wallet address (0x...) */
  payerWalletAddress: string;
  /** PROPMETRIK-generated reference (e.g. PM-RENT-2025-001) */
  paymentReference: string;
  /** ERC20 token address to pay with (e.g. USDT, USDC on deployed chain) */
  tokenAddress: string;
  /** Additional context: tenancy_id, org_id, schedule_ids, etc. */
  metadata: Record<string, any>;
}

export interface CryptoPaymentInitResult {
  /** Deployed contract address */
  contractAddress: string;
  /** keccak256(entity_type + entity_id) — bytes32 for contract call */
  recipientEntityId: string;
  /** Recipient's wallet */
  recipientWallet: string;
  /** ERC20 token address used for this payment */
  tokenAddress: string;
  /** Token symbol (e.g. 'USDT', 'USDC', 'WETH') */
  tokenSymbol: string;
  /** Token decimals (6 for USDT/USDC, 18 for WETH, 8 for WBTC) */
  tokenDecimals: number;
  /** Principal in token (human-readable) */
  principalAmount: number;
  /** Service fee in token (human-readable) */
  feeAmount: number;
  /** Total: principal + fee in token (human-readable) */
  totalAmount: number;
  /** Principal in token subunits (for contract) */
  principalSubunits: string;
  /** Fee in token subunits (for contract) */
  feeSubunits: string;
  /** Total in token subunits (for token.approve) */
  totalSubunits: string;
  /** GHS per USD rate used */
  exchangeRate: number;
  /** keccak256 of paymentReference — bytes32 for contract call */
  referenceHash: string;
  /** Original reference string */
  paymentReference: string;
  /** ABI-encoded metadata for contract call */
  abiEncodedMetadata: string;
  /** Contract PaymentType enum index */
  contractPaymentType: number;
  /** Rate source (e.g. 'open_exchange_rates') */
  rateSource: string;
  /** When the rate was fetched */
  rateTimestamp: Date;
  /** Chain ID the contract is deployed on */
  chainId: number;
  /** Swap info — populated when recipient prefers a different token than payment token */
  swapInfo: {
    /** Recipient's preferred ERC20 token address */
    preferredToken: string;
    /** Symbol of the preferred token */
    preferredTokenSymbol: string;
    /** Decimals of the preferred token */
    preferredTokenDecimals: number;
    /** Frontend should call processPaymentWithSwap() instead of processPayment() */
    useSwapFunction: boolean;
  } | null;
}

export interface CryptoVerifyResult {
  success: boolean;
  /** Matched payment_transactions reference */
  paymentReference?: string;
  /** On-chain tx hash */
  txHash?: string;
  /** Block number */
  blockNumber?: number;
  /** Payer wallet from event */
  payerWallet?: string;
  /** Recipient wallet from event */
  recipientWallet?: string;
  /** Token address used */
  tokenAddress?: string;
  /** Token symbol */
  tokenSymbol?: string;
  /** Principal in token (human-readable) */
  principalAmount?: number;
  /** Fee in token (human-readable) */
  feeAmount?: number;
  /** Error message if failed */
  error?: string;
}

export interface CryptoPaymentEvent {
  /** keccak256 of reference */
  paymentReference: string;
  /** Payer wallet address */
  payer: string;
  /** Recipient wallet address */
  recipientWallet: string;
  /** Token address used for payment */
  token: string;
  /** Principal amount in token subunits (bigint) */
  principalAmount: bigint;
  /** Fee in token subunits (bigint) */
  fee: bigint;
  /** Contract PaymentType enum value */
  paymentType: number;
  /** Transaction hash */
  txHash: string;
  /** Block number */
  blockNumber: number;
  // ── Swap-specific (present when PaymentProcessedWithSwap) ──
  /** Whether this came from a swap event */
  isSwap?: boolean;
  /** Token the payer sent (swap input) */
  tokenIn?: string;
  /** Token the recipient received (swap output) */
  tokenOut?: string;
  /** Amount payer sent in token subunits */
  amountIn?: bigint;
  /** Amount recipient received in token subunits */
  amountOut?: bigint;
}

// =====================================================
// EXCHANGE RATE
// =====================================================

export interface ExchangeRateResult {
  /** Token amount (human-readable, e.g. 100.50 USDT) */
  tokenAmount: number;
  /** Token subunits for contract (scaled to token decimals) */
  tokenSubunits: bigint;
  /** GHS per USD rate */
  rate: number;
  /** When rate was fetched */
  rateTimestamp: Date;
  /** Rate provider */
  source: string;
}

// =====================================================
// CONFIG
// =====================================================

export interface CryptoConfig {
  /** JSON-RPC URL (HTTPS) */
  rpcUrl: string;
  /** WebSocket URL (for event subscription) */
  wsUrl: string;
  /** Deployed PROPMETRIKPayments contract address */
  contractAddress: string;
  /** Chain ID (1=Ethereum, 137=Polygon, 80002=Amoy, 11155111=Sepolia) */
  chainId: number;
  /** Admin signer private key (for registerRecipient, etc.) */
  adminPrivateKey: string;
  /** Exchange rate cache TTL (ms) — rate itself comes from data-hub FX feed */
  exchangeRateCacheTtlMs: number;
}

/**
 * Load crypto config from environment variables.
 * Returns null if crypto rail is not configured (all vars optional).
 */
export function loadCryptoConfig(): CryptoConfig | null {
  const rpcUrl = process.env.POLYGON_RPC_URL;
  const contractAddress = process.env.PROPMETRIK_CONTRACT_ADDRESS;

  // If no RPC URL or contract address, crypto rail is not configured
  if (!rpcUrl || !contractAddress) {
    return null;
  }

  return {
    rpcUrl,
    wsUrl: process.env.POLYGON_WS_URL || rpcUrl.replace('https', 'wss'),
    contractAddress,
    chainId: parseInt(process.env.PROPMETRIK_CONTRACT_CHAIN_ID || '137', 10),
    adminPrivateKey: process.env.CRYPTO_ADMIN_PRIVATE_KEY || '',
    exchangeRateCacheTtlMs: parseInt(process.env.EXCHANGE_RATE_CACHE_TTL_MS || '300000', 10),
  };
}
