# PROPMETRIK Smart Contract — Deployment Guide (v2.3 Multi-Token + DEX Swap + Native BTC, Multi-Chain)

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Multi-Token Design](#multi-token-design)
3. [Native BTC Support](#native-btc-support)
4. [DEX Swap & Platform Fee Auto-Conversion](#dex-swap--platform-fee-auto-conversion)
5. [Multi-Chain Support](#multi-chain-support)
6. [Pre-Deployment Checklist](#pre-deployment-checklist)
7. [Testnet Deployment (Polygon Amoy)](#testnet-deployment-polygon-amoy)
8. [Testnet Deployment (Sepolia)](#testnet-deployment-sepolia)
9. [Mainnet Deployment (Polygon)](#mainnet-deployment-polygon)
10. [Mainnet Deployment (Ethereum)](#mainnet-deployment-ethereum)
11. [Post-Deployment Configuration](#post-deployment-configuration)
12. [Adding New Tokens](#adding-new-tokens)
13. [Backend + Frontend Integration](#backend--frontend-integration)
14. [Crypto → Fiat Auto-Conversion (v2.4 Roadmap)](#crypto--fiat-auto-conversion-v24-roadmap)
15. [Security Checklist](#security-checklist)
16. [Emergency Procedures](#emergency-procedures)
17. [Appendix: Contract Addresses](#appendix-contract-addresses)

---

## Architecture Overview

```
Tenant (Trust Wallet / WalletConnect)
    │
    ├── approve(TOKEN, amount + fee)  →  ERC20 Token Contract (USDT, USDC, WETH, etc.)
    │
    └── processPayment(token, ...)    →  PROPMETRIKPayments Contract
            │
            ├── safeTransferFrom(payer → recipient, principal)
            └── safeTransferFrom(payer → propmetrikWallet, fee)

Tenant (Bitcoin Wallet)
    │
    └── send BTC to deposit address   →  Bitcoin Network
            │
            Backend verifies N confirmations
            │
            └── recordOffChainPayment()  →  PROPMETRIKPayments Contract
                    │
                    └── Immutable on-chain attestation of BTC payment
```

**Key design decisions:**
- **Multi-token**: Owner-managed allowlist — supports any ERC20 (USDT, USDC, USDC.e, WETH, future tokens)
- **Native BTC**: Registrar-attested off-chain payments — BTC payment verified on Bitcoin blockchain, recorded on EVM chain via authorized registrar
- **No hardcoded tokens**: Constructor takes only `(propmetrikWallet, initialOwner)` — tokens added post-deploy via `addToken()`
- **Cross-decimal fee scaling**: Minimum fee stored as 6-decimal USD (`minimumFeeUSD6`), scaled to token's native decimals at runtime
- Contract **never holds funds** — atomic split in every ERC20 transaction; BTC forwarded off-chain by backend
- Mirrors backend `FeeEngine` logic exactly (RENT: max(1%, $1.65), DEAL: 0.25%, PROJECT: 0.25%, VALUATION: 2.5%)
- OpenZeppelin v5: ReentrancyGuard, Pausable, Ownable2Step, SafeERC20
- Slither security scan: **0 findings** (101 detectors)
- [x] Test suite: **165/165 passing** (multi-token, DEX swap, platform fee auto-conversion, attestation, native BTC, hardening, registrar role)

---

## Multi-Token Design

### Accepted Currencies

PROPMETRIK v2.3 accepts **6 currencies** — 5 ERC20 tokens via on-chain `processPayment()` / `processPaymentWithSwap()` and **native BTC** via registrar-attested `recordOffChainPayment()`.

### ERC20 Tokens (Polygon Mainnet)

| Token   | Address                                      | Decimals | Symbol | Method           |
|---------|----------------------------------------------|----------|--------|------------------|
| USDT    | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6        | USDT   | `processPayment` |
| USDC    | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 6        | USDC   | `processPayment` |
| USDC.e  | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 6        | USDC.e | `processPayment` |
| WETH    | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619` | 18       | WETH   | `processPayment` |
| WBTC    | `0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6` | 8        | WBTC   | `processPayment` |

### Native BTC (Bitcoin Network)

| Currency | Chain    | Decimals | Symbol | Method                  |
|----------|----------|----------|--------|-------------------------|
| **BTC**  | Bitcoin  | 8 (sats) | BTC    | `recordOffChainPayment` |

BTC payments are sent on the Bitcoin network, verified by the backend (N confirmations), then recorded on-chain as an immutable attestation by an authorized registrar. The contract stores the payment reference, amount in USD (6-decimal), external payment ID, and attestation hash — providing a full audit trail.

### ERC20 Tokens (Ethereum Mainnet)

| Token   | Address                                      | Decimals | Symbol | Method           |
|---------|----------------------------------------------|----------|--------|------------------|
| WETH    | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | 18       | WETH   | `processPayment` |
| USDT    | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6        | USDT   | `processPayment` |
| USDC    | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6        | USDC   | `processPayment` |
| WBTC    | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` | 8        | WBTC   | `processPayment` |

> **Note:** Native BTC via `recordOffChainPayment` is available on all deployed chains — any authorized registrar can attest off-chain payments.

### Token Management Functions

```solidity
// Add a new token to allowlist (owner only)
function addToken(address token, string calldata symbol, uint8 decimals) external onlyOwner;

// Enable/disable a token without removing it
function setTokenEnabled(address token, bool enabled) external onlyOwner;

// Remove a token entirely (can be re-added later)
function removeToken(address token) external onlyOwner;

// View functions
function isTokenAccepted(address token) external view returns (bool enabled, string memory symbol, uint8 decimals);
function getTokenCount() external view returns (uint256);
```

### Fee Scaling Logic

Fees are stored as 6-decimal USD values and scaled at runtime:

| Currency | Decimals | $1.65 Minimum Fee          | Scaling                   | Payment Method          |
|----------|----------|-----------------------------|---------------------------|-------------------------|
| USDT     | 6        | `1_650000`                  | 1:1 (same decimals)      | `processPayment`        |
| USDC     | 6        | `1_650000`                  | 1:1 (same decimals)      | `processPayment`        |
| WBTC     | 8        | `165_000000`                | × 10^2                    | `processPayment`        |
| WETH     | 18       | `1_650000_000000_000000`    | × 10^12                   | `processPayment`        |
| **BTC**  | 8 (sats) | `165_000000`                | × 10^2 (same as WBTC)    | `recordOffChainPayment` |
### processPayment Signature (v2)

```solidity
function processPayment(
    address token,           // NEW: which ERC20 token to pay with
    PaymentType paymentType, // RENT, DEAL, PROJECT, or VALUATION
    bytes32 recipientEntityId,
    uint256 principalAmount,
    bytes32 paymentReference,
    bytes calldata metadata
) external returns (bool);
```

### PaymentProcessed Event (v2)

```solidity
event PaymentProcessed(
    bytes32 indexed paymentReference,
    address indexed payer,
    address indexed recipientWallet,
    address token,           // NEW: which token was used
    uint256 principalAmount,
    uint256 fee,
    PaymentType paymentType
);
```

---

## DEX Swap & Platform Fee Auto-Conversion

### v2.3 Contract Additions

PROPMETRIK v2.3 adds on-chain DEX swap capability via QuickSwap V3 on Polygon, enabling two key features:

1. **Recipient Token Preference**: Recipients (landlords) can set a preferred ERC20 token. When a payer sends a different token, the contract automatically swaps it via QuickSwap V3 before delivering it to the recipient.
2. **Platform Fee Auto-Conversion**: The platform can set a preferred fee token via `setPlatformPreferredToken()`. All platform fees are automatically swapped to this token regardless of what the payer used.

### Key Contract Functions

```solidity
// Pay with automatic swap to recipient's preferred token
function processPaymentWithSwap(
    SwapPaymentParams calldata params
) external returns (bool);

struct SwapPaymentParams {
    address token;              // Token payer is sending
    PaymentType paymentType;
    bytes32 recipientEntityId;
    uint256 principalAmount;
    uint256 amountOutMinimum;   // Slippage protection
    bytes32 paymentReference;
    bytes metadata;
}

// Set recipient's preferred settlement token (owner only)
function setRecipientPreferredToken(
    bytes32 entityId,
    address preferredToken
) external onlyOwner;

// Set platform's preferred fee token (owner only)
function setPlatformPreferredToken(
    address token
) external onlyOwner;

// Configure swap parameters
function setSwapRouter(address router) external onlyOwner;
function setDefaultSwapFeeTier(uint24 feeTier) external onlyOwner;
function setMaxSwapSlippage(uint256 bps) external onlyOwner;
function setPairSwapFeeTier(address tokenIn, address tokenOut, uint24 feeTier) external onlyOwner;
```

### PaymentProcessedWithSwap Event

```solidity
event PaymentProcessedWithSwap(
    bytes32 indexed paymentReference,
    address indexed payer,
    address indexed recipientWallet,
    address tokenIn,          // Token payer sent
    address tokenOut,         // Token recipient received
    uint256 amountIn,         // Amount payer sent
    uint256 amountOut,        // Amount recipient received (after swap)
    uint256 feeIn,            // Fee in payer's token
    PaymentType paymentType
);
```

### Swap Configuration (Polygon Mainnet)

| Parameter | Value |
|---|---|
| QuickSwap V3 SwapRouter | `0xf5b509bB0909a69B1c207E495f687a596C168E12` |
| Default Fee Tier | 3000 (0.3%) |
| Max Swap Slippage | 300 bps (3%) |
| Platform Preferred Token | Configurable via admin UI |

### Platform Settlement Wallet

The platform settlement wallet (where fees are collected) is now configurable via the admin crypto settings UI:
- Admin selects a payout currency from 14 supported coins (EVM + non-EVM)
- Enters their wallet address for that coin
- For EVM coins on Polygon, `setPlatformPreferredToken()` is called on-chain automatically
- For non-EVM coins (BTC, ETH L1, SOL, etc.), fees are routed through NOWPayments for conversion
- Configuration stored in `platform_settings` table with env var fallback

---

## Pre-Deployment Checklist

### Phase 1: Testnet
- [x] Smart contract v2 written and compiled (multi-token)
- [x] 133 unit tests passing (USDT 6-dec, USDC 6-dec, WETH 18-dec, WBTC 8-dec, **native BTC 8-dec**, cross-token, hardening)
- [x] + 32 additional tests for DEX swap, platform fee auto-conversion, and off-chain attestation
- **Total: 165 tests passing**
- [x] Slither static analysis — 0 high/medium findings (101 detectors)
- [x] MockERC20 with configurable decimals for testing
- [x] Native BTC support via recordOffChainPayment (registrar-attested)
- [x] Deploy script auto-detects Ethereum mainnet / Polygon mainnet / testnet
- [x] Hardhat config supports: Ethereum, Polygon, Amoy, Sepolia, localhost
- [x] Deploy to Amoy testnet (v2.1)
- [x] Deploy to Sepolia testnet (v2)
- [x] E2E payment flow tested on testnet — 5/5 passing (USDT RENT, USDC DEAL, WETH PROJECT, WBTC RENT, BTC DEAL)
- [x] Backend payment service updated for multi-token v2 contract
- [x] BlockchainListenerService updated for multi-token events

### Phase 2: Security Audit
- [x] Slither re-scan: **0 high/medium findings** (101 detectors)
- [x] Test suite: **165/165 passing** (includes BTC, swap, platform fee, attestation + hardening tests)
- [ ] Select audit firm → **Recommended: Hacken** ($5K-$8K, 5-10 days, Polygon expertise)
- [ ] Submit v2 contract for audit
- [ ] Receive and address audit report

### Phase 3: Mainnet Preparation
- [x] Safe multisig wallet: `0xEFd259AbF3Af26Aa22a0Fb4e189059C13e3a0C1C` (2-of-2)
- [x] Trust Wallet signer: `0x651A05813aF8E70BC9c57Ddc7093aDa014170Ce9`
- [x] Tangem signer: `0xa2e034fe313c32935f1f151bff951969a0aa190a`
- [x] Deployer funded with POL for gas (~99 POL)
- [x] PolygonScan API key configured
- [x] Alchemy RPC configured

### Phase 4: Mainnet Deployment
- [x] Deploy PROPMETRIKPayments v2.3 to Polygon mainnet (5 ERC20 tokens: USDT, USDC, USDC.e, WETH, WBTC + **native BTC** via registrar + DEX swap via QuickSwap V3)
  - Contract: [`0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06`](https://polygonscan.com/address/0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06#code)
  - Verified on PolygonScan: **Yes**
  - BTC Registrar (Tangem): `0xa2e034fe313c32935f1f151bff951969a0aa190a`
  - Registrar (Deployer): `0x651A05813aF8E70BC9c57Ddc7093aDa014170Ce9` — backend auto-registers landlords
  - Deployed: 2026-02-15
- [ ] Deploy PROPMETRIKPayments v2.3 to Ethereum mainnet (4 ERC20 tokens: WETH, USDT, USDC, WBTC + **native BTC** via registrar)
- [x] Verify contracts on PolygonScan and Etherscan
- [x] Mainnet deploy sets Safe multisig as constructor owner
- [ ] Safe multisig calls `acceptOwnership()` to finalize ownership transfer
- [x] Backend auto-registers landlords via `authorizedRegistrar` role (no manual Safe approval)
- [ ] Process test payments with USDT, USDC, and **BTC (via relayer)**
- [ ] Monitor first 24 hours

---

## Testnet Deployment (Polygon Amoy)

### Prerequisites
- Node.js 18+
- Trust Wallet funded with test POL (at least 0.2 POL)
- Faucets: https://faucet.polygon.technology/ or https://www.alchemy.com/faucets/polygon-amoy

### Steps

```bash
cd blockchain

# 1. Install dependencies
npm install

# 2. Configure .env
cp .env.example .env
# Edit: DEPLOYER_PRIVATE_KEY, SAFE_WALLET_ADDRESS, BTC_RELAYER_ADDRESS, AMOY_RPC_URL

# 3. Deploy (auto-deploys MockERC20 tokens on testnet)
npx hardhat run scripts/deploy.ts --network amoy

# 4. Verify on Amoyscan
npx hardhat run scripts/verify.ts --network amoy

# 5. Post-deploy check
npx hardhat run scripts/initialize.ts --network amoy
```

The deploy script automatically:
- Deploys 5 MockERC20 tokens (USDT 6-dec, USDC 6-dec, USDC.e 6-dec, WETH 18-dec, WBTC 8-dec)
- Deploys PROPMETRIKPayments with deployer as owner
- Adds all 5 mock tokens to the allowlist
- Authorizes registrar for off-chain BTC attestation via `recordOffChainPayment()`
- Saves deployment info to `deployments/amoy-deployment.json`

---

## Testnet Deployment (Sepolia)

### Prerequisites
- Deployer wallet funded with Sepolia ETH (at least 0.05 ETH)
- Faucets: https://sepoliafaucet.com/ or https://www.alchemy.com/faucets/ethereum-sepolia

### Steps

```bash
cd blockchain

# 1. Configure .env
# SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
# ETHERSCAN_API_KEY=YOUR_KEY

# 2. Deploy (auto-deploys MockERC20 tokens on testnet)
npx hardhat run scripts/deploy.ts --network sepolia

# 3. Verify on Sepolia Etherscan
npx hardhat run scripts/verify.ts --network sepolia

# 4. Post-deploy check
npx hardhat run scripts/initialize.ts --network sepolia
```

---

## Mainnet Deployment (Polygon)

**DEPLOYED** — 2026-02-15 (v2.1 with registrar role)

| Item | Value |
|------|-------|
| Contract | [`0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06`](https://polygonscan.com/address/0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06#code) |
| Network | Polygon PoS (chainId 137) |
| Deployer | `0x651A05813aF8E70BC9c57Ddc7093aDa014170Ce9` |
| Owner | Safe `0xEFd259AbF3Af26Aa22a0Fb4e189059C13e3a0C1C` (pending `acceptOwnership()`) |
| Platform Wallet | Safe `0xEFd259AbF3Af26Aa22a0Fb4e189059C13e3a0C1C` |
| BTC Registrar | Tangem `0xa2e034fe313c32935f1f151bff951969a0aa190a` |
| Registrar | Deployer `0x651A05813aF8E70BC9c57Ddc7093aDa014170Ce9` (backend auto-registers landlords) |
| Verified | Yes — [PolygonScan](https://polygonscan.com/address/0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06#code) |

### Configured Tokens

| Token | Address | Decimals |
|-------|---------|----------|
| USDT | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6 |
| USDC | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 6 |
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 6 |
| WETH | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619` | 18 |
| WBTC | `0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6` | 8 |
| BTC | Off-chain (registrar-attested) | 8 |

### Deployment Steps (completed)

```bash
# 1. Set .env with POLYGON_RPC_URL, DEPLOYER_PRIVATE_KEY, SAFE_WALLET_ADDRESS, BTC_RELAYER_ADDRESS

# 2. Deploy (auto-adds real mainnet token addresses)
npx hardhat run scripts/deploy.ts --network polygon

# 3. Verify on PolygonScan
npx hardhat verify --network polygon <CONTRACT_ADDRESS> <SAFE_WALLET> <DEPLOYER>
```

The deploy script automatically:
- Adds real Polygon mainnet tokens (USDT, USDC, USDC.e, WETH, WBTC)
- Authorizes registrar address for off-chain BTC attestation via `recordOffChainPayment()`
- **Authorizes deployer as registrar** — backend can auto-register landlords without Safe approval
- Deploys with deployer as admin, configures all tokens, then transfers ownership to Safe
- **Safe must call `acceptOwnership()` to finalize the 2-step transfer**
- Saves deployment info to `deployments/polygon-deployment.json`

---

## Mainnet Deployment (Ethereum)

### Prerequisites
- Deployer wallet funded with ETH for gas
- Etherscan API key configured

### Steps

```bash
# 1. Use production .env
# ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
# ETHERSCAN_API_KEY=YOUR_KEY

# 2. Deploy (auto-adds real Ethereum mainnet token addresses: WETH, USDT, USDC, WBTC)
npx hardhat run scripts/deploy.ts --network ethereum

# 3. Verify on Etherscan
npx hardhat run scripts/verify.ts --network ethereum

# 4. Post-deploy verification
npx hardhat run scripts/initialize.ts --network ethereum
```

The deploy script automatically:
- Adds real Ethereum mainnet tokens (WETH, USDT, USDC, WBTC)
- Authorizes registrar address for off-chain BTC attestation via `recordOffChainPayment()`
- Sets Safe multisig as owner at deployment time
- Saves deployment info to `deployments/ethereum-deployment.json`

### Ownership Model

On mainnet, ownership is set directly in constructor to `SAFE_WALLET_ADDRESS`.
No post-deploy `acceptOwnership()` action is required.

---

## Post-Deployment Configuration

### Register Recipients

```javascript
// From Safe multisig (or deployer before ownership transfer)
const entityId = ethers.keccak256(ethers.toUtf8Bytes("landlord-001"));
await contract.registerRecipient(entityId, "0xLandlordWallet...");
```

### Verify Token Allowlist

```bash
npx hardhat run scripts/initialize.ts --network polygon
# Shows: all tokens, fee configs, owner, platform wallet
```

---

## Adding New Tokens

To add a new ERC20 token post-deployment (e.g., DAI):

```javascript
// Owner (Safe multisig) calls:
await contract.addToken(
    "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", // DAI on Polygon
    "DAI",  // symbol
    18      // decimals
);
```

To temporarily disable a token:
```javascript
await contract.setTokenEnabled(tokenAddress, false);
```

To remove a token entirely:
```javascript
await contract.removeToken(tokenAddress);
```

---

## Backend + Frontend Integration

### Backend Changes (v2)

The `processPayment` call now requires a `token` parameter:

```typescript
// Before (v1 — single token)
contract.processPayment(paymentType, entityId, amount, ref, metadata);

// After (v2 — multi-token)
contract.processPayment(tokenAddress, paymentType, entityId, amount, ref, metadata);
```

The `PaymentProcessed` event now includes `address token` — update `BlockchainListenerService` to capture which token was used.

### Frontend Changes

- Token selector in payment UI (dropdown: USDT, USDC, WETH, WBTC, **BTC**)
- For ERC20: `approve()` call targets the selected token contract, then `processPayment()`
- For **BTC**: user sends BTC on Bitcoin network → backend verifies confirmations → registrar calls `recordOffChainPayment()`

---

## Crypto → Fiat Auto-Conversion (v2.4 Roadmap)

This section documents the planned implementation for automatic crypto-to-fiat conversion, allowing landlords to receive rent in GHS (Ghana Cedis) to their bank account or mobile money, even when tenants pay in crypto.

### Architecture Overview

```
Tenant pays crypto (any of 14 supported coins)
    │
    ├─ EVM token on Polygon → processPayment() / processPaymentWithSwap()
    └─ Non-EVM (BTC, SOL, etc.) → NOWPayments intake → settles as USDT on Polygon
    │
    │  Payment confirmed on-chain or via IPN webhook
    │
    ├─ auto_convert_to_fiat = false → Crypto delivered to landlord wallet (current behavior)
    │
    └─ auto_convert_to_fiat = true → Auto-Convert Service triggered:
           │
           ├─ 1. USDT sent to off-ramp provider (Yellow Card / Kotani Pay API)
           ├─ 2. Provider converts USDT → GHS at market rate
           └─ 3. GHS disbursed to landlord via:
                  ├─ Bank transfer (Paystack Transfers API)
                  └─ Mobile Money (MoMo payout)
```

### Why Not Binance?

Binance has no programmatic GHS trading pairs or payout API. GHS is only available via P2P which cannot be automated. This rules out Binance (and all other major CEXes) for our use case.

### Recommended Off-Ramp Providers

| Provider | Type | GHS Support | API | Pros | Cons |
|---|---|---|---|---|---|
| **Yellow Card** | Off-ramp API | ✅ USDT→GHS | REST API | Africa-focused, regulated in Ghana, best GHS liquidity, MoMo + bank payout | Onboarding takes 2-4 weeks |
| **Kotani Pay** | Off-ramp API | ✅ USDT→GHS | REST API | Simple API, East/West Africa | Smaller liquidity pool |
| **Transak** | On/Off-ramp | ✅ GHS via MoMo | API + widget | Consumer-facing, B2B API available | Higher fees |
| **Fonbnk** | Off-ramp API | ✅ | REST API | Mobile-money focused | Early stage |

**Primary recommendation: Yellow Card** — most mature Africa off-ramp API with direct USDT→GHS conversion and automated bank/MoMo disbursement.

### Database Schema (Migration)

```sql
-- Add auto-convert flag to payment_accounts
ALTER TABLE payment_accounts
  ADD COLUMN auto_convert_to_fiat BOOLEAN DEFAULT false,
  ADD COLUMN fiat_payout_method TEXT CHECK (fiat_payout_method IN ('bank', 'momo')),
  ADD COLUMN paystack_recipient_code TEXT;

-- Conversion tracking table
CREATE TABLE fiat_conversions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_reference TEXT NOT NULL REFERENCES payment_transactions(reference),
  crypto_amount NUMERIC(20,8) NOT NULL,
  crypto_currency TEXT NOT NULL,             -- e.g. 'USDT'
  fiat_amount NUMERIC(12,2),                 -- GHS amount received
  fiat_currency TEXT NOT NULL DEFAULT 'GHS',
  exchange_rate NUMERIC(12,6),
  spread_fee NUMERIC(12,2),                  -- conversion spread/fee
  offramp_provider TEXT NOT NULL,            -- 'yellow_card' | 'kotani_pay'
  offramp_reference TEXT,                    -- provider's reference ID
  payout_method TEXT NOT NULL,               -- 'bank' | 'momo'
  paystack_transfer_id TEXT,                 -- Paystack transfer reference
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | converting | converted | disbursing | completed | failed
  recipient_entity_type TEXT NOT NULL,
  recipient_entity_id TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Service Architecture

```
backend/shared-services/payments/fiat-conversion/
  ├─ autoConvertService.ts       ─ Orchestrator: listens for confirmed crypto payments,
  │                               triggers conversion if landlord opted in
  ├─ offrampAdapter.ts           ─ Provider-agnostic interface
  ├─ providers/
  │   ├─ yellowCardProvider.ts   ─ Yellow Card API: USDT → GHS conversion
  │   └─ kotaniPayProvider.ts    ─ Kotani Pay API: USDT → GHS conversion
  └─ disbursementService.ts      ─ Paystack Transfers API: GHS → bank/MoMo
```

**Provider-agnostic adapter interface:**

```typescript
interface OffRampProvider {
  name: string;
  convertToFiat(params: {
    cryptoAmount: number;
    cryptoCurrency: string;       // 'USDT'
    fiatCurrency: string;         // 'GHS'
    destinationAddress?: string;  // for direct payout providers
  }): Promise<{
    conversionId: string;
    estimatedFiatAmount: number;
    exchangeRate: number;
    fee: number;
    status: 'pending' | 'processing';
  }>;
  getConversionStatus(conversionId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    fiatAmount?: number;
    completedAt?: Date;
  }>;
}
```

### End-to-End Flow

1. **Crypto payment confirmed** → `blockchainListener` or `nowPaymentsService` IPN updates `payment_transactions.status = 'completed'`
2. **Auto-convert check** → `autoConvertService` queries landlord's `payment_accounts.auto_convert_to_fiat`
3. **Off-ramp** → USDT sent to Yellow Card / Kotani Pay via API. `fiat_conversions` record created with `status = 'converting'`
4. **Conversion complete webhook** → Provider confirms GHS amount. Update `fiat_conversions.status = 'converted'`
5. **Disbursement** → Trigger Paystack Transfer to landlord's bank/MoMo. Update `status = 'disbursing'`
6. **Payout confirmed** → Paystack webhook confirms transfer. Update `status = 'completed'`

### Frontend (Admin Payment Settings)

- Checkbox: **"Auto-convert crypto payments to GHS"**
- When enabled, shows:
  - Payout method selector: **Bank Transfer** or **Mobile Money**
  - Bank: account number + bank selector (via Paystack `resolveAccount` API)
  - MoMo: phone number + network (MTN, Vodafone, AirtelTigo)
- Each landlord configures this independently in their Payment Settings

### Design Decisions (To Be Finalized)

| Decision | Options | Recommendation |
|---|---|---|
| Who absorbs conversion spread? | Platform / Landlord / Split | Landlord absorbs (transparent rate shown) |
| Escrow + auto-convert coexistence | Allow both / Mutually exclusive | Mutually exclusive initially |
| Settlement timing display | Show estimated time / Show live status | Show live status with progress bar |
| Minimum conversion threshold | Convert every payment / Batch small amounts | Convert every payment > $5 equivalent |

### Prerequisites Before Implementation

- [ ] Onboard with Yellow Card (or Kotani Pay) — obtain API keys, complete KYB
- [ ] Set up Paystack Transfer recipient management for auto-disbursement
- [ ] Test off-ramp API in sandbox with USDT→GHS conversions
- [ ] Determine fee absorption model (who pays the ~1-2% conversion spread)

---

## Security Checklist

- [x] ReentrancyGuard on processPayment
- [x] Pausable emergency circuit breaker
- [x] Ownable2Step (prevents accidental ownership transfer)
- [x] SafeERC20 for all token transfers
- [x] Duplicate reference protection
- [x] Zero-address validation on all wallet parameters
- [x] Owner-only for all admin functions
- [x] Token allowlist prevents arbitrary token injection
- [x] Registrar authorization for off-chain payments (owner-managed)
- [x] Off-chain payment attestation data stored on-chain for audit trail
- [x] Cross-type duplicate protection (ERC20 + BTC share reference namespace)
- [x] External payment ID replay protection (prevents same BTC tx recorded twice)
- [x] Recipient wallet uniqueness guard (prevents wallet collision across entities)
- [x] Fee economics guard for non-stable tokens (minimum fee scales by token value)
- [x] Slither: 0 high/medium findings across 101 detectors
- [x] 165 unit tests covering all paths (ERC20 + BTC + swap + platform fee + attestation + hardening)

---

## Emergency Procedures

### Pause Contract
```bash
# Via Safe multisig:
await contract.pause();
# All processPayment calls will revert until unpause()
```

### Disable a Token
```bash
await contract.setTokenEnabled(tokenAddress, false);
# Payments with this token will revert; other tokens unaffected
```

### Update Platform Wallet
```bash
await contract.updatePropmetrikWallet(newWalletAddress);
```

### Deactivate a Recipient
```bash
const entityId = ethers.keccak256(ethers.toUtf8Bytes("entity-id"));
await contract.deactivateRecipient(entityId);
```

### Disable BTC Payments
```bash
# Revoke registrar to prevent new off-chain attestations
await contract.revokeRegistrar(registrarAddress);
# Or pause the entire contract:
await contract.pause();
```

### Revoke a Registrar
```bash
await contract.revokeRegistrar(registrarAddress);
# Registrar can no longer call recordOffChainPayment or register recipients
```

---

## Appendix: Contract Addresses

### Key Wallets

| Identity       | Address                                      |
|----------------|----------------------------------------------|
| Trust Wallet   | `0x651A05813aF8E70BC9c57Ddc7093aDa014170Ce9` |
| Tangem         | `0xa2e034fe313c32935f1f151bff951969a0aa190a` |
| Safe Multisig  | `0xEFd259AbF3Af26Aa22a0Fb4e189059C13e3a0C1C` |

### v1 (Deprecated — Single Token)

| Item              | Address                                      |
|-------------------|----------------------------------------------|
| Contract (Amoy)   | `0x62b94Ce03E8205681368EA548cB089Db9f683F90` |
| MockUSDT (Amoy)   | `0x17e9A7C7FC4874DBdf8E3ECDf099B4B58eE02250` |

### v2.3 (Multi-Token + DEX Swap + Native BTC, Multi-Chain — Current)

| Item                  | Address                                      |
|-----------------------|----------------------------------------------|
| Contract (Polygon)    | [`0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06`](https://polygonscan.com/address/0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06#code) |
| Contract (Ethereum)   | *Deploy pending*                             |
| Contract (Amoy)       | `0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06` — [verified](https://amoy.polygonscan.com/address/0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06#code) |
| Contract (Sepolia)    | `0xC5a731282c17D04562Dc9de271dF8ECe4B551742` |
| QuickSwap V3 Router   | `0xf5b509bB0909a69B1c207E495f687a596C168E12` |

### Polygon Mainnet — Accepted Currencies

| Currency | Type         | Address / Chain                                | Decimals | Method                  |
|----------|--------------|------------------------------------------------|----------|-------------------------|
| USDT     | ERC20        | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`   | 6        | `processPayment`        |
| USDC     | ERC20        | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`   | 6        | `processPayment`        |
| USDC.e   | ERC20        | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`   | 6        | `processPayment`        |
| WETH     | ERC20        | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619`   | 18       | `processPayment`        |
| WBTC     | ERC20        | `0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6`   | 8        | `processPayment`        |
| **BTC**  | **Native**   | **Bitcoin Network**                            | 8 (sats) | `recordOffChainPayment` |

### Ethereum Mainnet — Accepted Currencies

| Currency | Type         | Address / Chain                                | Decimals | Method                  |
|----------|--------------|------------------------------------------------|----------|-------------------------|
| WETH     | ERC20        | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`   | 18       | `processPayment`        |
| USDT     | ERC20        | `0xdAC17F958D2ee523a2206206994597C13D831ec7`   | 6        | `processPayment`        |
| USDC     | ERC20        | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`   | 6        | `processPayment`        |
| WBTC     | ERC20        | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599`   | 8        | `processPayment`        |
| **BTC**  | **Native**   | **Bitcoin Network**                            | 8 (sats) | `recordOffChainPayment` |
