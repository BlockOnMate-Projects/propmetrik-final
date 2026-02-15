/**
 * Crypto Payment Module — Barrel Exports
 *
 * USDT/Polygon payment rail for PROPMETRIK.
 *
 * @module shared-services/payments/crypto
 */

// Types
export * from './types';

// Exchange Rate Service (GHS → USDT conversion)
export { exchangeRateService } from './exchangeRateService';

// Crypto Payment Service (init, verify, admin)
export { cryptoPaymentService } from './cryptoPaymentService';

// Blockchain Listener (WebSocket event subscription + crash recovery)
export { blockchainListenerService } from './blockchainListener';

// NOWPayments Service (off-chain crypto payment processor)
export { nowPaymentsService } from './nowPaymentsService';

// Payment Routing Service (on-chain vs off-chain decision engine)
export { paymentRoutingService } from './paymentRoutingService';

// Escrow Payout Service (cross-chain escrow → NOWPayments payout)
export { escrowPayoutService } from './escrowPayoutService';

// On-Chain Attestation Service (off-chain payment audit trail)
export { attestationService } from './attestationService';

// Config loader
export { loadCryptoConfig } from './types';
