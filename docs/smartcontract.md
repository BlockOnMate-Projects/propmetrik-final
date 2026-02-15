# PROPMETRIK Crypto Payment Rail — Architecture & Phased Implementation Plan

> **Status**: DRAFT — Awaiting review & approval before implementation  
> **Last Updated**: June 2025  
> **Author**: Engineering  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Payment Architecture (Paystack Fiat Rail)](#2-current-payment-architecture)
3. [Proposed Crypto Rail — Design Principles](#3-proposed-crypto-rail)
4. [Smart Contract Specification](#4-smart-contract-specification)
5. [Backend Integration Plan](#5-backend-integration-plan)
6. [Frontend Integration Plan](#6-frontend-integration-plan)
7. [Database Schema Changes](#7-database-schema-changes)
8. [Phased Implementation Roadmap](#8-phased-implementation-roadmap)
9. [Risk Assessment & Mitigations](#9-risk-assessment)
10. [Success Criteria & Acceptance Tests](#10-success-criteria)

---

## 1. Executive Summary

PROPMETRIK processes three categories of payments — **rent**, **deal**, and **project** — through Paystack with automatic fee splitting via subaccounts. This document proposes adding an **optional, parallel USDT payment rail on Polygon** for international and crypto-native users.

**Key constraints:**
- The crypto rail reuses the **exact same fee logic** already live in `FeeEngine`
- It plugs into the **existing `payment_transactions` ledger** — no separate accounting
- It follows the **same "never custody funds" principle** as Paystack subaccounts
- It is **additive** — the Paystack flow remains the primary and default rail

---

## 2. Current Payment Architecture (Paystack Fiat Rail)

### 2.1 Service Layer

| Service | File | Responsibility |
|---------|------|----------------|
| **FeeEngine** | `shared-services/payments/feeEngine.ts` (323 lines) | Centralized fee calculation with DB-backed config, 5-min TTL cache, per-entity overrides |
| **PaymentProcessor** | `src/services/property-management/payment/paymentProcessor.ts` (641 lines) | Orchestrates init → Paystack → verify → ledger → schedule application |
| **PaystackService** | `src/services/property-management/payment/paystackService.ts` (518 lines) | Paystack API wrapper — subaccounts, split payments, bank resolve, webhooks |
| **PaystackService (shared)** | `shared-services/payments/paystack/index.ts` (518 lines) | Shared Paystack wrapper + transfers, mobile money charge, balance |

### 2.2 Fee Schedule (Production Defaults from `fee_configurations` Table)

| Payment Type | Fee Mode | Percentage | Flat Minimum | Calculation |
|-------------|----------|------------|--------------|-------------|
| **Rent** | `max_of` | 1% | GH₵ 25 | `max(1% x principal, GH₵ 25)` — payer-paid |
| **Deal** | `percentage` | 0.25% | — | `0.25% x principal` — payer-paid |
| **Project** | `percentage` | 0.25% | — | `0.25% x principal` — payer-paid |
| **Subscription** | `flat` | — | 0 | 100% goes to PROPMETRIK (no split, not applicable for crypto) |

- **Priority chain**: per-entity override (`payment_accounts.platform_fee_percentage/flat`) → global `fee_configurations` → hardcoded fallback
- **Type definitions**: `PaymentType = 'rent' | 'deal' | 'project' | 'subscription'`, `FeeMode = 'percentage' | 'flat' | 'max_of'`
- All amounts in GHS, subunits in pesewas (x 100)

### 2.3 Payment Flow (Paystack — Currently Live)

```
Tenant/Payer                    API                          PaymentProcessor                    Paystack
     |                           |                                |                                |
     | POST /calculate-fee       |                                |                                |
     |-------------------------->| feeEngine.calculate()          |                                |
     |<--------------------------|  { principal, serviceFee, total}|                                |
     |                           |                                |                                |
     | POST /payments/initiate   |                                |                                |
     |-------------------------->| initializeRentPayment()        |                                |
     |                           |  +- verify tenancy exists      |                                |
     |                           |  +- REQUIRE subaccount         |                                |
     |                           |  |  (landlord bank/MoMo acct)  |                                |
     |                           |  +- calculate fee (FeeEngine)  |                                |
     |                           |  +- auto-match arrears scheds  |                                |
     |                           |  |                              | initializeWithSubaccount()     |
     |                           |  |                              |------------------------------->|
     |                           |  |                              |  amount: totalCharge (pesewas) |
     |                           |  |                              |  subaccount: landlord code     |
     |                           |  |                              |  transaction_charge: fee       |
     |                           |  |                              |  bearer: 'subaccount'          |
     |                           |  |                              |<-------------------------------|
     |                           |  |                              |  { authorization_url, ref }    |
     |                           |  +- record PENDING in           |                                |
     |                           |  |  payment_transactions        |                                |
     |<--------------------------|  +- return authorizationUrl     |                                |
     |                           |                                |                                |
     | --- redirect to Paystack checkout ---------------------------------------------------->     |
     | <-- user pays (card/MoMo) <------------------------------------------------------------     |
     | --- redirect to callback -->|                               |                                |
     |                           |                                |                                |
     | GET /payments/verify/:ref |                                |                                |
     |-------------------------->| verifyAndRecordPayment()       |                                |
     |                           |  +- idempotency check          | verifyTransaction(ref)         |
     |                           |  |  (ledger + legacy table)    |------------------------------->|
     |                           |  |                              |<-------------------------------|
     |                           |  +- UPDATE ledger -> success   |                                |
     |                           |  +- record in rent_payments    |                                |
     |                           |  +- apply to rent_schedules    |                                |
     |<--------------------------|  +- return { success, payment }|                                |
     |                           |                                |                                |
     |                           | POST /payments/webhook (async from Paystack)                    |
     |                           |<----------------------------------------------------------------|
     |                           |  verify HMAC-SHA512 -> 200 OK immediately                       |
     |                           |  handleWebhook: charge.success -> verifyAndRecordPayment        |
     |                           |               : charge.failed  -> mark ledger 'failed'          |
     |                           |               : transfer.success -> update settled_at           |
```

### 2.4 API Endpoints (Currently Live)

#### Property Management Routes (`/api/v1/pm/...`)

| Method | Path | Handler |
|--------|------|---------|
| POST | `/payments` | Record manual rent payment (legacy) |
| GET | `/payments/account` | Get org payout account (dual-table: `payment_accounts` -> `pm_payment_accounts`) |
| GET | `/payments/banks` | List Ghana banks via Paystack |
| GET | `/payments/transactions` | Query `payment_transactions` ledger (paginated) |
| POST | `/payments/initialize` | Initialize Paystack rent payment (split to subaccount) |
| POST | `/payments/webhook` | **Canonical** Paystack webhook — HMAC-SHA512 verified |
| POST | `/payments/calculate-fee` | Preview fee breakdown |
| POST | `/payments/register-account` | Register bank/MoMo as Paystack subaccount |

#### Tenant Portal Routes (`/api/v1/tenant-portal/...`)

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| GET | `/payments/summary/:tenancyId` | Tenant JWT | Arrears + recent + upcoming |
| GET | `/payments/schedules/:tenancyId` | Tenant JWT | Rent schedule list |
| GET | `/payments/history/:tenancyId` | Tenant JWT | Paginated history |
| POST | `/payments/calculate-fee` | Tenant JWT | Fee preview |
| POST | `/payments/initiate` | Tenant JWT | **Initiate Paystack rent payment** |
| GET | `/payments/verify/:reference` | Public | Verify after redirect |

#### CRM Routes (`/api/v1/crm/...`) — Deal payments

| Method | Path | Handler |
|--------|------|---------|
| GET | `/payments/account` | Get payout account |
| GET | `/payments/banks` | List banks |
| POST | `/payments/register-account` | Register payout |
| POST | `/payments/resolve-account` | Bank name enquiry |

#### Admin Routes (`/api/v1/admin/...`)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/fee-configurations` | List all fee configs |
| PUT | `/fee-configurations/:id` | Update fee config |
| POST | `/fee-configurations` | Create fee config + clear cache |

### 2.5 Database Schema (Payment Tables — Migration 133)

#### `payment_transactions` (Central Ledger)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Auto-generated |
| `reference` | VARCHAR(100) UNIQUE | PROPMETRIK-generated |
| `paystack_reference` | VARCHAR(100) | Will be NULL for crypto |
| `payment_type` | ENUM | `rent`, `deal`, `project`, `subscription` |
| `payer_type` / `payer_id` / `payer_email` | | Polymorphic payer |
| `recipient_type` / `recipient_id` | | Polymorphic recipient |
| `subaccount_code` | VARCHAR(100) | Paystack subaccount (NULL for crypto) |
| `gross_amount` | INTEGER | Total in pesewas (principal + service fee) |
| `principal_amount` | INTEGER | Recipient's portion (pesewas) |
| `service_fee` | INTEGER | PROPMETRIK's cut (pesewas) |
| `paystack_fee` | INTEGER | Paystack processing fee (N/A for crypto) |
| `net_settlement` | INTEGER | Actual recipient payout (pesewas) |
| `currency` | VARCHAR(3) | `GHS` currently |
| `fee_mode` / `fee_percentage_applied` / `fee_flat_applied` | | Audit trail |
| `status` | ENUM | `pending`, `success`, `failed`, `refunded`, `abandoned` |
| `channel` | VARCHAR(30) | `card`, `mobile_money` — **will add `crypto_usdt`** |
| `domain_record_type` / `domain_record_id` | | Links to rent_payment, etc. |
| `metadata` | JSONB | Extensible (will hold tx_hash, block, wallets for crypto) |
| `settled_at` / `settlement_reference` | | Settlement tracking |

#### `fee_configurations`

| Column | Type | Notes |
|--------|------|-------|
| `payment_type` | ENUM | Per-type config |
| `organization_id` | UUID (nullable) | NULL = global default |
| `fee_mode` | ENUM | `percentage`, `flat`, `max_of` |
| `percentage_rate` | NUMERIC(7,4) | e.g. 0.0100 = 1% |
| `flat_amount` | NUMERIC(10,2) | e.g. 25.00 GHS |
| `min_fee` / `max_fee` | NUMERIC(10,2) | Caps |
| `is_active` | BOOLEAN | |

#### `payment_accounts` (Unified v2)

| Column | Type | Notes |
|--------|------|-------|
| `entity_type` | ENUM | `organization`, `deal_manager`, `project_manager` |
| `entity_id` | UUID | Polymorphic |
| `paystack_subaccount_code` | VARCHAR(100) | For fiat rail |
| `account_number` / `bank_code` / `bank_name` / `account_name` | | Bank details |
| `settlement_method` | ENUM | `bank`, `mobile_money` |
| `momo_provider` / `momo_number` | | MoMo details |
| `platform_fee_percentage` | NUMERIC(5,4) | Per-entity override |
| `platform_fee_flat` | NUMERIC(10,2) | Per-entity flat override |
| UNIQUE(`entity_type`, `entity_id`) | | |

### 2.6 Frontend (Current State)

**Tenant Portal** (`tenant-portal/src/app/payments/page.tsx`):
- Payment modal with method selector: Mobile Money, Bank Transfer, Card, GhQR (2x2 grid)
- Debounced fee preview via `POST /calculate-fee`
- Redirects to Paystack `authorization_url`, verifies on callback

**Admin Frontend** (`frontend/src/`):
- `PaymentSettings` component — reusable Paystack subaccount registration (PM, CRM, Projects)
- Admin fee configuration at `/dashboard/admin/platform-fees` (all 3 fee modes supported)
- State management: Zustand

**Blockchain directory** (`blockchain/`):
- `package.json` only — Hardhat scaffolded with OpenZeppelin v5, no contracts or config written

---

## 3. Proposed Crypto Rail — Design Principles

### 3.1 Non-Negotiable Constraints

1. **No custody** — PROPMETRIK never holds USDT. Atomic `transferFrom` splits in a single tx
2. **Same fees** — On-chain fee calculation mirrors `FeeEngine`'s logic exactly
3. **Same ledger** — Crypto payments write to `payment_transactions` with `channel = 'crypto_usdt'`
4. **Same verification pattern** — Backend verifies on-chain tx just like it verifies with Paystack
5. **Additive only** — Crypto is an *additional* payment method, not a replacement

### 3.2 Architecture Overview

```
+-----------------------------------------------------------------------------+
|                           PROPMETRIK Platform                                |
|                                                                              |
|  +----------------+    +--------------------+    +--------------------------+|
|  | Tenant Portal  |    | PaymentProcessor   |    |  FeeEngine               ||
|  | (Next.js)      |    | (orchestrator)     |    |  (shared-services)       ||
|  | + wagmi/viem   |    |                    |    |  unchanged — same fees   ||
|  +-------+--------+    +--------+-----------+    +--------------------------+|
|          |                      |                                            |
|  +-------v--------+    +-------v------------+    +--------------------------+|
|  | WalletConnect   |    | CryptoPayment     |    | BlockchainListener       ||
|  | (browser)       |    | Service (NEW)     |    | (NEW — event monitor)    ||
|  +-------+---------+    +-------+-----------+    +----------+---------------+|
|          |                      |                           |                |
+----------+----------------------+---------------------------+----------------+
           |                      |                           |
           v                      v                           v
    +--------------+     +--------------+         +--------------+
    |  User Wallet |     |  Polygon RPC |         |  Polygon RPC |
    |  (MetaMask)  |     |  (Alchemy)   |         |  (WebSocket) |
    +------+-------+     +--------------+         +--------------+
           |                                              ^
           |  approve() + processPayment()                | events
           v                                              |
    +-----------------------------------------------------+
    |  PROPMETRIKPayments.sol  (Polygon)
    |  +- processPayment() — atomic USDT split
    |  +- _calculateFee() — mirrors FeeEngine exactly
    |  +- recipientWallets mapping — on-chain wallet registry
    |  +- emit PaymentProcessed(ref, payer, recipient, amounts...)
    +-------------------------------------------------------------
```

### 3.3 Why Polygon + USDT

| Factor | Value |
|--------|-------|
| **Gas per tx** | ~$0.01-0.05 |
| **Finality** | ~2-3 seconds |
| **USDT contract** | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` (6 decimals) |
| **Ecosystem** | EVM-compatible, Hardhat tooling, large wallet support |
| **Target users** | Diaspora tenants, international deal investors, foreign project clients |

### 3.4 When To Use Each Rail

| Scenario | Rail | Reason |
|----------|------|--------|
| Local Ghanaian tenant, MoMo | **Paystack** | Best UX, instant, no wallet needed |
| Diaspora tenant, international card | **Paystack** | Works if card not declined |
| Diaspora tenant, card declined | **Crypto** | Avoids international card blocks |
| Foreign investor, deal > $10k | **Crypto** | Avoids FX fees, instant settlement |
| Project client, cross-border | **Crypto** | Cheaper than wire transfer |
| Small amount < $50 | **Paystack** | Gas fee is a significant % |

---

## 4. Smart Contract Specification

### 4.1 Contract: `PROPMETRIKPayments.sol`

**Solidity**: ^0.8.20  
**Dependencies**: OpenZeppelin v5 (`ReentrancyGuard`, `Pausable`, `Ownable2Step`, `SafeERC20`)  
**Network**: Polygon (Amoy testnet -> mainnet)

#### Enums

```solidity
enum PaymentType {
    RENT,           // maps to FeeEngine 'rent'  — max_of(1%, $1.65)
    DEAL,           // maps to FeeEngine 'deal'  — 0.25%
    PROJECT         // maps to FeeEngine 'project' — 0.25%
}
// No SUBSCRIPTION type — subscriptions are platform-internal (100% to PROPMETRIK),
// no split to route through the contract.
```

#### Fee Configuration (Mirrors `fee_configurations` Table)

```solidity
struct FeeConfig {
    uint128 percentageBasisPoints;  // 100 = 1%, 25 = 0.25%  (packed: 1 slot)
    uint128 minimumFeeUSDT;         // USDT 6-decimal units (e.g. 1_650000 = $1.65)
    bool enabled;                   // Circuit breaker per type
}

mapping(PaymentType => FeeConfig) public feeConfigs;
```

**Initial values (matching production `fee_configurations`):**

| Type | basisPoints | minimumFeeUSDT | Notes |
|------|-------------|----------------|-------|
| RENT | 100 (1%) | 1_650000 ($1.65 approx GHS 25 at current rate) | `max_of` mode |
| DEAL | 25 (0.25%) | 0 | `percentage` mode |
| PROJECT | 25 (0.25%) | 0 | `percentage` mode |

The `minimumFeeUSDT` for RENT is the USD equivalent of GHS 25 and must be **admin-updatable** as the exchange rate fluctuates.

#### Fee Calculation (Mirrors `FeeEngine.calculate()` Logic)

```solidity
function _calculateFee(PaymentType paymentType, uint256 principal) internal view returns (uint256) {
    FeeConfig memory config = feeConfigs[paymentType];
    uint256 percentageFee = (principal * config.percentageBasisPoints) / 10000;

    if (paymentType == PaymentType.RENT) {
        // max_of mode — identical to FeeEngine behavior
        return percentageFee > config.minimumFeeUSDT ? percentageFee : config.minimumFeeUSDT;
    }
    // percentage mode for DEAL and PROJECT
    return percentageFee;
}
```

#### Recipient Registry (Maps to `payment_accounts` Table)

```solidity
struct Recipient {
    bool isActive;
    uint96 totalReceived;    // Running total (USDT 6 decimals, fits in uint96)
    uint32 paymentCount;     // Counter (packed into same storage slot)
}

// entityId = keccak256(abi.encodePacked(entity_type, entity_id)) from payment_accounts
mapping(bytes32 => address) public recipientWallets;  // entityId -> wallet address
mapping(address => Recipient) public recipients;       // wallet -> profile

mapping(bytes32 => bool) public processedReferences;   // Prevents double-spend
```

**Registration flow:**
1. Admin registers payout account in existing `PaymentSettings` UI (adds a "Crypto Wallet" field)
2. Backend stores wallet in `payment_accounts.crypto_wallet_address` (new column)
3. Backend calls `contract.registerRecipient(entityId, walletAddress)` via admin signer
4. `entityId = keccak256(abi.encodePacked(entity_type, entity_id))` — deterministic from the DB row

#### Main Payment Function

```solidity
function processPayment(
    PaymentType paymentType,
    bytes32 recipientEntityId,         // Maps to payment_accounts entity
    uint256 principalAmount,           // USDT 6-decimal
    bytes32 paymentReference,          // keccak256 of PROPMETRIK reference string
    bytes calldata metadata            // ABI-encoded context (tenancyId, orgId, etc.)
) external nonReentrant whenNotPaused returns (bool) {
    // 1. Validate
    require(principalAmount > 0, "Amount must be > 0");
    address recipientWallet = recipientWallets[recipientEntityId];
    require(recipientWallet != address(0), "Recipient not registered");
    require(recipients[recipientWallet].isActive, "Recipient not active");
    require(feeConfigs[paymentType].enabled, "Payment type disabled");
    require(!processedReferences[paymentReference], "Duplicate reference");

    // 2. Calculate fee (mirrors FeeEngine)
    uint256 fee = _calculateFee(paymentType, principalAmount);

    // 3. Atomic USDT splits — SafeERC20
    USDT.safeTransferFrom(msg.sender, recipientWallet, principalAmount);
    USDT.safeTransferFrom(msg.sender, propMetrikWallet, fee);

    // 4. Mark reference used (prevents replay)
    processedReferences[paymentReference] = true;

    // 5. Update analytics (load to memory, modify, write once — gas efficient)
    Recipient memory profile = recipients[recipientWallet];
    profile.totalReceived += uint96(principalAmount);
    profile.paymentCount += 1;
    recipients[recipientWallet] = profile;

    // 6. Emit event for backend listener
    emit PaymentProcessed(
        paymentReference, msg.sender, recipientWallet,
        principalAmount, fee, paymentType
    );

    return true;
}
```

**Design decisions:**
- `bytes32` for reference (not `string`): cheaper storage, deterministic hashing on backend
- `bytes32` for entityId: maps 1:1 to `payment_accounts` rows via `keccak256`
- No explicit `allowance`/`balance` checks: `SafeERC20.safeTransferFrom` reverts on insufficient balance/allowance with clear error
- No `withdrawCollectedFees`: fees go directly to `propMetrikWallet` in each tx (never accumulate in contract)

#### Events

```solidity
event PaymentProcessed(
    bytes32 indexed paymentReference,
    address indexed payer,
    address indexed recipientWallet,
    uint256 principalAmount,
    uint256 fee,
    PaymentType paymentType
);

event RecipientRegistered(bytes32 indexed entityId, address wallet);
event RecipientDeactivated(bytes32 indexed entityId);
event RecipientWalletUpdated(bytes32 indexed entityId, address oldWallet, address newWallet);
event FeeConfigUpdated(PaymentType indexed paymentType, uint128 basisPoints, uint128 minimumFee);
event PROPMETRIKWalletUpdated(address indexed oldWallet, address indexed newWallet);
```

#### Admin Functions

| Function | Access | Description |
|----------|--------|-------------|
| `updateFeeConfig(type, bps, min)` | onlyOwner | Mirrors admin `/fee-configurations` endpoint |
| `registerRecipient(entityId, wallet)` | onlyOwner | Called when PM adds wallet in PaymentSettings |
| `updateRecipientWallet(entityId, newWallet)` | onlyOwner | Wallet rotation |
| `deactivateRecipient(entityId)` | onlyOwner | Disables crypto payouts for entity |
| `updatePROPMETRIKWallet(newWallet)` | onlyOwner | 2-step via Ownable2Step |
| `pause()` / `unpause()` | onlyOwner | Emergency circuit breaker |

#### Security Summary

- OpenZeppelin v5: `ReentrancyGuard`, `Pausable`, `Ownable2Step`, `SafeERC20`
- `bytes32` reference dedup prevents double-spend
- No `withdrawCollectedFees` needed — contract never holds funds
- Immutable USDT address (constructor-set)
- All admin operations emit events (audit trail)
- Struct packing: `FeeConfig` = 1 slot, `Recipient` = 1 slot
- Solidity 0.8.x built-in overflow protection

---

## 5. Backend Integration Plan

### 5.1 New Service: `CryptoPaymentService`

**Location**: `shared-services/payments/crypto/cryptoPaymentService.ts`

Mirrors `PaystackService` but for on-chain operations:

```typescript
class CryptoPaymentService {
    // Pre-flight: returns data for frontend to call contract directly
    async initializeCryptoPayment(params: {
        paymentType: PaymentType;          // 'rent' | 'deal' | 'project'
        entityId: string;                   // tenancy_id or deal_id
        entityType: string;                 // 'organization' | 'deal_manager' | 'project_manager'
        principalAmountGHS: number;         // Original GHS amount
        payerWalletAddress: string;         // Connected wallet
        paymentReference: string;           // Generated PROPMETRIK reference
        metadata: Record<string, any>;      // tenancy_id, org_id, schedule_ids, etc.
    }): Promise<CryptoPaymentInitResult>;
    // Returns: {
    //   contractAddress, recipientEntityId (bytes32), recipientWallet,
    //   principalUSDT, feeUSDT, totalUSDT, exchangeRate, referenceHash (bytes32),
    //   paymentReference, abiEncodedMetadata
    // }

    // Verify tx hash against expected reference
    async verifyOnChainPayment(
        txHash: string,
        expectedReference: string
    ): Promise<CryptoVerifyResult>;

    // Read recipient wallet from contract
    async getRecipientWallet(
        entityId: string,
        entityType: string
    ): Promise<string | null>;

    // Register wallet on-chain (admin — sends tx from admin signer)
    async registerRecipientWallet(
        entityId: string,
        entityType: string,
        wallet: string
    ): Promise<string>;
}
```

### 5.2 PaymentProcessor Extensions

Add new methods to the existing `PaymentProcessor` class in `paymentProcessor.ts`:

```typescript
// Alongside existing initializeRentPayment()
async initializeCryptoRentPayment(
    params: CryptoRentPaymentInitParams
): Promise<CryptoPaymentInitResult> {
    // 1. Verify tenancy (same as Paystack flow)
    // 2. Require recipient has a registered WALLET (instead of subaccount)
    // 3. Calculate fee via FeeEngine (same engine, same fee)
    // 4. Convert GHS -> USDT via ExchangeRateService
    // 5. Return contract call params for frontend
    // 6. Record PENDING in payment_transactions
    //    (channel: 'crypto_usdt', currency: 'USDT')
}

// Called by BlockchainListener when PaymentProcessed event detected
async handleCryptoEvent(event: CryptoPaymentEvent): Promise<void> {
    // 1. Match referenceHash to pending payment_transactions row
    // 2. Verify on-chain (read tx receipt, confirm amounts match expected)
    // 3. Update ledger -> success (same pattern as Paystack verify)
    // 4. For rent: record in rent_payments + apply to rent_schedules
    // 5. For deal/project: ledger update only (same as current)
}
```

### 5.3 New Service: `BlockchainListenerService`

**Location**: `shared-services/payments/crypto/blockchainListener.ts`

Persistent event monitor running alongside the Express server:

```typescript
class BlockchainListenerService {
    private provider: ethers.WebSocketProvider;
    private contract: ethers.Contract;

    // Subscribe to PaymentProcessed events
    async start(): Promise<void>;

    // Route event to paymentProcessor.handleCryptoEvent()
    private async onPaymentProcessed(event): Promise<void>;

    // Catch-up scan on restart from last known block
    async syncFromBlock(fromBlock: number): Promise<void>;

    // Health check
    async isConnected(): Promise<boolean>;
}
```

**Crash recovery:**
- Stores `last_processed_block` in `blockchain_sync_state` table (new)
- On restart, scans from `last_processed_block` to current HEAD
- WebSocket with auto-reconnect (ethers v6 built-in)
- **Dual verification**: listener catches events + frontend `POST /verify` confirms

### 5.4 New Service: `ExchangeRateService`

**Location**: `shared-services/payments/crypto/exchangeRateService.ts`

```typescript
class ExchangeRateService {
    // Get current GHS -> USD rate via forex API (cached 5 min)
    // Uses Open Exchange Rates / ExchangeRate-API / Currencyfreaks — NOT a crypto exchange.
    // Rationale: No crypto exchange (Binance, CoinGecko) has a reliable GHS spot pair.
    // GHS is not a major crypto trading currency — only forex APIs have accurate GHS/USD rates.
    // We then treat USDT ≈ $1.00 (stablecoin peg) for the final conversion.
    async getGHStoUSDTRate(): Promise<number>;

    // Convert GHS amount to USDT (6 decimals)
    async convertGHStoUSDT(ghsAmount: number): Promise<{
        usdtAmount: number;     // In USDT (human-readable)
        usdtSubunits: bigint;   // In 6-decimal units for contract
        rate: number;           // GHS per USD (≈ USDT)
        rateTimestamp: Date;    // When rate was fetched
        source: string;         // e.g. 'open_exchange_rates'
    }>;
}
```

**Why a forex API instead of Binance/CoinGecko:**
- Neither Binance nor CoinGecko has a direct GHS/USDT spot pair
- Binance P2P has GHS listings but spreads vary wildly (5-15%) — unsuitable for production rates
- CoinGecko requires chaining GHS→USD→USDT with no native GHS support
- Forex APIs (Open Exchange Rates, ExchangeRate-API) provide accurate, central-bank-sourced GHS/USD rates
- USDT maintains a ~1:1 USD peg, so GHS/USD ≈ GHS/USDT for practical purposes
- If USDT depegs significantly (>2%), the staleness guard + admin freeze handles it (see Risk #7 in Section 9)

Needed because `FeeEngine` operates in GHS/pesewas but the contract operates in USDT. Rate is locked at initialization time.

### 5.5 New API Endpoints

**Property Management / Tenant Portal routes:**

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| POST | `/payments/crypto/initialize` | Org/Tenant JWT | `paymentProcessor.initializeCryptoRentPayment()` |
| POST | `/payments/crypto/verify` | Public (ref) | `paymentProcessor.verifyCryptoPayment(txHash)` |
| GET | `/payments/crypto/rate` | Any authed | `exchangeRateService.getGHStoUSDTRate()` |
| GET | `/payments/crypto/wallet/:entityType/:entityId` | Org auth | Check if recipient has registered wallet |

**Tenant Portal:**

| Method | Path | Auth | Handler |
|--------|------|------|---------|
| POST | `/tenant-portal/payments/crypto/initiate` | Tenant JWT | Initialize crypto rent payment |
| POST | `/tenant-portal/payments/crypto/verify` | Public | Verify after on-chain tx confirmation |

**Admin:**

| Method | Path | Handler |
|--------|------|---------|
| POST | `/admin/crypto/register-wallet` | Register recipient wallet on contract |
| GET | `/admin/crypto/contract-status` | Health: paused?, last synced block, connected? |

---

## 6. Frontend Integration Plan

### 6.1 New Dependencies

**Tenant Portal** (`tenant-portal/package.json`):

```json
{
    "wagmi": "^2.x",
    "viem": "^2.x",
    "@web3modal/wagmi": "^4.x"
}
```

### 6.2 Tenant Portal Payment Modal Changes

**Current** payment method selector (2x2 grid):
```
+----------------+  +----------------+
|  Mobile Money  |  | Bank Transfer  |
+----------------+  +----------------+
+----------------+  +----------------+
|     Card       |  |     GhQR       |
+----------------+  +----------------+
```

**Proposed** — add 5th option:
```
+----------------+  +----------------+
|  Mobile Money  |  | Bank Transfer  |
+----------------+  +----------------+
+----------------+  +----------------+
|     Card       |  |     GhQR       |
+----------------+  +----------------+
+-------------------------------------+
|  Pay with USDT (Polygon)            |
|  Fast - Low fees - International    |
+-------------------------------------+
```

**Crypto payment sub-flow** (within the existing payment modal):

1. **Select "Pay with USDT"** — modal switches to crypto sub-flow
2. **Connect wallet** — Web3Modal opens (MetaMask, WalletConnect, Coinbase Wallet)
3. **Network check** — if not on Polygon, prompt `wallet_switchEthereumChain`
4. **Balance check** — read USDT balance, compare with total needed
5. **Initialize** — `POST /crypto/initiate` returns `{ principalUSDT, feeUSDT, totalUSDT, rate, contractAddress, recipientEntityId, referenceHash }`
6. **Fee preview** — show GHS to USDT conversion with locked rate
7. **Approve USDT** — `USDT.approve(contractAddress, totalUSDT)` via wagmi `useWriteContract`
8. **Pay** — `contract.processPayment(type, entityId, principal, refHash, metadata)` via wagmi
9. **Wait** — `useWaitForTransactionReceipt` (~2-3 seconds on Polygon)
10. **Verify** — `POST /crypto/verify` with `{ txHash, paymentReference }` — backend updates ledger + schedules
11. **Success** — show receipt with tx hash + PolygonScan link

### 6.3 Admin Frontend Changes

**PaymentSettings component** — add "Crypto Wallet" field alongside existing bank/MoMo:

```
Settlement Method:  ( ) Bank Account  ( ) Mobile Money

Bank: [Ghana Commercial Bank  v]
Account Number: [1234567890]
Account Name: John Doe  (verified)

--- Crypto Payout (Optional) --------------------
Polygon Wallet Address: [0x742d35Cc6634C0532925a3b844...]
Status: Registered on-chain | Last updated: Jun 15, 2025
```

When admin saves a wallet:
1. Backend validates address format (42-char hex, starts with 0x)
2. Backend calls `contract.registerRecipient(entityId, wallet)` via admin signer
3. Stores wallet in `payment_accounts.crypto_wallet_address` (new column)

---

## 7. Database Schema Changes

### Migration: `XXX_crypto_payment_support.sql`

```sql
-- 1. Add crypto channel option
ALTER TYPE payment_channel ADD VALUE IF NOT EXISTS 'crypto_usdt';

-- 2. Add crypto-specific columns to existing payment_transactions ledger
ALTER TABLE payment_transactions
    ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(66),
    ADD COLUMN IF NOT EXISTS block_number BIGINT,
    ADD COLUMN IF NOT EXISTS payer_wallet VARCHAR(42),
    ADD COLUMN IF NOT EXISTS recipient_wallet VARCHAR(42),
    ADD COLUMN IF NOT EXISTS crypto_currency VARCHAR(10),
    ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,6),
    ADD COLUMN IF NOT EXISTS principal_crypto NUMERIC(20,6),
    ADD COLUMN IF NOT EXISTS fee_crypto NUMERIC(20,6),
    ADD COLUMN IF NOT EXISTS gas_cost_matic NUMERIC(20,8);

-- 3. Add wallet address to payment_accounts (alongside existing bank/MoMo)
ALTER TABLE payment_accounts
    ADD COLUMN IF NOT EXISTS crypto_wallet_address VARCHAR(42),
    ADD COLUMN IF NOT EXISTS crypto_wallet_verified BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS crypto_wallet_registered_at TIMESTAMPTZ;

-- 4. Index for tx hash lookups (only for rows that have one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_tx_hash
    ON payment_transactions(tx_hash) WHERE tx_hash IS NOT NULL;

-- 5. Blockchain listener crash recovery
CREATE TABLE IF NOT EXISTS blockchain_sync_state (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    last_processed_block BIGINT NOT NULL,
    last_processed_at TIMESTAMPTZ NOT NULL,
    UNIQUE(chain_id, contract_address)
);

-- 6. Exchange rate audit log
CREATE TABLE IF NOT EXISTS exchange_rate_log (
    id SERIAL PRIMARY KEY,
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(10) NOT NULL,
    rate NUMERIC(12,6) NOT NULL,
    source VARCHAR(50) NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key design decisions:**
- Crypto columns are **nullable additions to existing `payment_transactions`** — keeps ledger unified
- `exchange_rate` column locks the GHS to USDT rate at payment time for audit/reconciliation
- `blockchain_sync_state` enables listener catch-up from last known block after crash
- `exchange_rate_log` provides an audit trail for rate history

---

## 8. Phased Implementation Roadmap

### Phase 1: Smart Contract + Hardhat Tests (Week 1-2)

**Deliverables:**
- [ ] `blockchain/contracts/PROPMETRIKPayments.sol` — Full contract per Section 4 spec
- [ ] `blockchain/contracts/mocks/MockUSDT.sol` — ERC20 mock for local testing
- [ ] `blockchain/test/PROPMETRIKPayments.test.ts` — Comprehensive test suite
- [ ] `blockchain/hardhat.config.ts` — Polygon Amoy + mainnet config
- [ ] `blockchain/scripts/deploy.ts` — Deploy + verify script
- [ ] `blockchain/scripts/initialize.ts` — Post-deploy: set fees, register test recipients
- [ ] `.env.example` with required variables

**Test coverage requirements:**

| Category | Tests |
|----------|-------|
| Fee calculation | RENT (1% > min, 1% < min uses min), DEAL (0.25%), PROJECT (0.25%), edge: 0 amount, large amount |
| Payment processing | Happy path all 3 types, insufficient allowance, unregistered recipient, inactive recipient, paused contract, duplicate reference |
| Admin functions | Fee update, recipient register/deactivate/update wallet, PROPMETRIK wallet update, pause/unpause |
| Security | Reentrancy attempt, unauthorized admin call, zero-address recipient |
| Gas report | Target: < 100k gas per single payment |

**Acceptance gate**: All tests pass, gas < 100k, deploy succeeds on Amoy testnet with test USDT

---

### Phase 2: Backend Services + DB Migration (Week 2-3)

**Deliverables:**
- [ ] DB migration `XXX_crypto_payment_support.sql` (Section 7)
- [ ] `shared-services/payments/crypto/types.ts` — TypeScript types
- [ ] `shared-services/payments/crypto/cryptoPaymentService.ts`
- [ ] `shared-services/payments/crypto/blockchainListener.ts`
- [ ] `shared-services/payments/crypto/exchangeRateService.ts`
- [ ] `shared-services/payments/crypto/index.ts` — Barrel exports
- [ ] Contract ABI committed to `shared-services/payments/crypto/abi/PROPMETRIKPayments.json`
- [ ] Extend `PaymentProcessor` with `initializeCryptoRentPayment()` + `handleCryptoEvent()`
- [ ] New routes in PM, tenant-portal, admin route files (Section 5.5)
- [ ] Environment variables: `POLYGON_RPC_URL`, `POLYGON_WS_URL`, `PROPMETRIK_CONTRACT_ADDRESS`, `CRYPTO_ADMIN_PRIVATE_KEY`

**Acceptance gate**: Backend can initialize a crypto payment, record pending, listener detects Amoy testnet event, updates ledger to success, rent schedule updated

---

### Phase 3: Frontend Integration (Week 3-4)

**Deliverables:**
- [ ] Install wagmi + viem + @web3modal/wagmi in `tenant-portal/`
- [ ] `tenant-portal/src/lib/web3.ts` — wagmi config (Polygon chain, WalletConnect project ID)
- [ ] `tenant-portal/src/components/CryptoPaymentFlow.tsx` — Full sub-flow component
- [ ] Update payment method selector in `payments/page.tsx` to include USDT option
- [ ] Add crypto API functions to `tenant-portal/src/lib/api.ts`
- [ ] Add "Crypto Wallet" field to `PaymentSettings` component in `frontend/src/`
- [ ] Wire admin wallet registration endpoint

**Acceptance gate**: End-to-end payment on Amoy testnet — tenant connects wallet, approves USDT, pays, backend records success, rent schedule updated

---

### Phase 4: Testing, Audit & Hardening (Week 4-5)

**Deliverables:**
- [ ] Internal security review checklist complete
- [ ] Edge case testing: network switch mid-tx, rejected tx, insufficient gas/MATIC, connection drop, MetaMask popup timeout
- [ ] Listener resilience: kill process, restart, verify catch-up from last block
- [ ] Exchange rate staleness guard (reject if rate > 15 min old)
- [ ] Rate limiting on crypto endpoints (prevent spam inits)
- [ ] Admin dashboard: contract paused?, last synced block, total crypto volume
- [ ] External audit engagement (budget permitting — OpenZeppelin, ConsenSys)
- [ ] Fix all Critical/High findings before proceeding

**Acceptance gate**: No unresolved critical/high findings, listener survives restart, all edge cases handled gracefully

---

### Phase 5: Mainnet Deployment & Gradual Rollout (Week 5-6)

**Deployment steps:**
- [ ] Deploy contract to Polygon mainnet
- [ ] Verify source code on PolygonScan
- [ ] Transfer ownership to Gnosis Safe multisig
- [ ] Configure production fees (update `minimumFeeUSDT` to match current GHS to USDT rate)
- [ ] Switch backend to mainnet RPC + contract address
- [ ] Register internal test recipients

**Rollout stages:**

| Stage | Duration | Scope | Criteria to Advance |
|-------|----------|-------|---------------------|
| Internal | 1 week | PROPMETRIK team wallets only | 10+ successful test payments |
| Beta | 2 weeks | 3 selected organizations | No failed payments, listener stable |
| Soft Launch | 2 weeks | All orgs, marked "Beta" in UI | < 1% failure rate, positive feedback |
| GA | Ongoing | Remove beta label, promote in UI | -- |

**Monitoring:**
- Alchemy webhook alerts for contract events
- PROPMETRIK wallet balance dashboard (fees accumulating)
- Daily crypto volume vs Paystack volume comparison
- Listener uptime and block lag metrics

---

## 9. Risk Assessment & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Smart contract bug (loss of funds) | **Critical** | Low | OpenZeppelin audited libs, comprehensive tests, external audit, pause mechanism, no fund custody |
| Exchange rate stale/manipulated | **High** | Medium | 5-min cache + 15-min staleness reject, rate history log, admin can freeze crypto rail |
| Blockchain listener misses events | **High** | Medium | `last_processed_block` + catch-up scan, dual verify (listener + frontend POST /verify) |
| User sends wrong token/wrong chain | **Medium** | Medium | Frontend enforces Polygon network check + USDT balance check before proceeding |
| Polygon network congestion | **Low** | Low | Gas estimation with 20% buffer, tx timeout, "use Paystack instead" fallback |
| Recipient wallet compromised | **High** | Low | On-chain deactivation, admin alert, wallet rotation function, audit log |
| USDT depeg event | **Medium** | Very Low | Display real-time rate prominently, allow abort before confirmation |
| Regulatory (crypto payments in Ghana) | **High** | Uncertain | Crypto is optional/secondary, no custody, can pause entire rail instantly |
| Admin signer key compromise | **Critical** | Low | Dedicated wallet (not owner), consider AWS KMS in production, revocable via multisig |

---

## 10. Success Criteria & Acceptance Tests

### Functional Requirements

- [ ] Tenant can pay rent via USDT on Polygon end-to-end in < 60 seconds
- [ ] Landlord receives exact principal amount in USDT to their registered wallet
- [ ] PROPMETRIK receives correct service fee in USDT (matching FeeEngine calculation)
- [ ] `payment_transactions` row created with `channel = 'crypto_usdt'`, all crypto columns populated
- [ ] Rent schedule updated (`amount_paid`, `status`) identically to Paystack flow
- [ ] Deal and project crypto payments work with 0.25% fee
- [ ] Duplicate payment reference rejected on-chain (tx reverts)
- [ ] Admin can configure fees, register/deactivate recipients from UI
- [ ] Existing Paystack flow completely unaffected

### Security Requirements

- [ ] SafeERC20 for all USDT transfers
- [ ] Reentrancy attack returns revert
- [ ] Unauthorized fee/recipient changes return revert
- [ ] Pause halts all payments, unpause resumes
- [ ] Double-spend on same reference reverts
- [ ] Only owner can call admin functions

### Non-Functional Requirements

- [ ] Gas per payment: < 100k (~$0.02-0.05 at current prices)
- [ ] Listener catch-up after 1-hour downtime: < 30 seconds
- [ ] Exchange rate freshness: < 5 minutes at payment init time
- [ ] Frontend wallet-connect to payment confirmation: < 45 seconds
- [ ] No user PII stored on-chain (only hashed references + wallet addresses)
- [ ] Zero downtime for existing Paystack rail during rollout

---

## Appendix A: File Structure (After Implementation)

```
blockchain/
    package.json                                    # Already exists
    hardhat.config.ts
    .env.example
    contracts/
        PROPMETRIKPayments.sol
        mocks/
            MockUSDT.sol
    test/
        PROPMETRIKPayments.test.ts
    scripts/
        deploy.ts
        verify.ts
        initialize.ts
    deployments/
        amoy.json                                   # { address, txHash, blockNumber }
        polygon.json

backend/
    shared-services/
        payments/
            feeEngine.ts                            # UNCHANGED
            crypto/
                index.ts                            # Barrel exports
                types.ts
                cryptoPaymentService.ts
                blockchainListener.ts
                exchangeRateService.ts
                abi/
                    PROPMETRIKPayments.json         # Contract ABI
            paystack/
                index.ts                            # UNCHANGED
    src/services/property-management/payment/
        paymentProcessor.ts                         # Extended with crypto methods
    database/migrations/
        XXX_crypto_payment_support.sql

tenant-portal/
    src/
        lib/
            web3.ts                                 # wagmi config
            api.ts                                  # Extended with crypto API functions
        app/payments/
            page.tsx                                # Extended with USDT method option
            components/
                CryptoPaymentFlow.tsx               # Connect -> approve -> pay -> verify

frontend/
    src/components/property-management/
        PaymentSettings.tsx                          # Extended with crypto wallet field
```

## Appendix B: New Environment Variables

```env
# -- Polygon RPC (Alchemy recommended) --
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
POLYGON_WS_URL=wss://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY

# -- Contract --
# CHAIN_ID is a fixed constant: 137 = Polygon mainnet, 80002 = Amoy testnet
PROPMETRIK_CONTRACT_CHAIN_ID=137
# CONTRACT_ADDRESS is generated when you deploy in Phase 1:
#   npx hardhat run scripts/deploy.ts --network polygon
# Hardhat prints the deployed address; paste it here.
# On Amoy testnet first, then mainnet in Phase 5.
PROPMETRIK_CONTRACT_ADDRESS=0x...

# -- Admin Signer (for registerRecipient, updateFeeConfig) --
# In production: use AWS KMS or similar, not raw private key
CRYPTO_ADMIN_PRIVATE_KEY=0x...

# -- Exchange Rate (Forex API for GHS -> USD) --
# No crypto exchange has a reliable GHS spot pair.
# We use a forex API for GHS->USD and assume USDT ≈ $1.00 (stablecoin peg).
# Recommended providers: Open Exchange Rates, ExchangeRate-API, or Currencyfreaks
EXCHANGE_RATE_API_KEY=...
EXCHANGE_RATE_PROVIDER=open_exchange_rates   # or 'exchangerate_api' | 'currencyfreaks'
EXCHANGE_RATE_CACHE_TTL_MS=300000            # 5 minutes

# -- Frontend (tenant-portal .env.local) --
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
# Same values as backend — comes from deployment output (see contract vars above)
NEXT_PUBLIC_PROPMETRIK_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_POLYGON_CHAIN_ID=137
NEXT_PUBLIC_USDT_CONTRACT_ADDRESS=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
```
