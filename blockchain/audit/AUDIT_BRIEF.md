# PROPMETRIKPayments — Security Audit Brief

**Submitted by:** PROPMETRIK
**Date:** March 2026
**Version:** v2.3.1 (valuation-swap)
**Contact:** [engineering@propmetrik.com]

---

## 1. Project Overview

**PROPMETRIK** is a property management platform operating in Ghana and expanding to other markets. Our smart contract handles multi-token crypto payments on Polygon, allowing tenants to pay rent, property deals, project fees, and valuation services directly to landlords/agents/valuers, with automatic platform fee splits and optional DEX auto-conversion.

### Business Context
- **Users:** Tenants (payers), landlords/agents/valuers (recipients), platform admin, registrars (backend signers)
- **Geography:** Ghana, expanding regionally — amounts denominated in local currency (converted via backend)
- **Volume:** 500+ transactions/month, scaling rapidly
- **Chain:** Polygon PoS (mainnet chainId 137, testnet on Amoy chainId 80002)

### What's New in v2.3
- **VALUATION payment type** — 2.5% fee for valuation services
- **DEX auto-conversion** — `processPaymentWithSwap()` via QuickSwap V3
- **Off-chain attestation** — `recordOffChainPayment()` for BTC/NOWPayments audit trail
- **Registrar system** — authorized backend signers for recipient management
- **Platform preferred token** — auto-convert platform fees to specified token
- **Recipient preferred tokens** — recipients can specify their payout currency

---

## 2. Scope

### In-Scope Contracts

| Contract | File | LOC | Description |
|---|---|---|---|
| `PROPMETRIKPayments` | `contracts/PROPMETRIKPayments.sol` | 903 | Main payment processor with DEX swap |
| `ISwapRouter` | `contracts/interfaces/ISwapRouter.sol` | 24 | QuickSwap V3 interface |
| `MockERC20` | `contracts/mocks/MockERC20.sol` | 40 | Test token (NOT for mainnet) |

### Dependencies

| Library | Version | Source |
|---|---|---|
| OpenZeppelin Contracts | 5.0.0 | `@openzeppelin/contracts` |
| Solidity | 0.8.20 | Hardhat compiler |
| QuickSwap V3 | - | External DEX (interface only) |

### Out of Scope
- Backend (Express/TypeScript) — handles off-chain logic, NOWPayments integration
- Frontend (Next.js apps) — wallet connection via Wagmi
- Mock contracts — test-only, not deployed to mainnet

---

## 3. Architecture

```
Payer Wallet (Trust Wallet / WalletConnect)
    │
    ├── approve(Token, principal + fee)  →  Polygon Token Contract
    │
    └── processPayment(...) OR processPaymentWithSwap(...)
            │
            │  [Direct Payment Path]
            ├── safeTransferFrom(payer → recipient, principal)
            └── safeTransferFrom(payer → propmetrikWallet, fee)
            │
            │  [Swap Payment Path — if recipient prefers different token]
            ├── safeTransferFrom(payer → contract, total)
            ├── swapExactInputSingle(tokenIn → tokenOut) via QuickSwap V3
            ├── safeTransfer(contract → recipient, principal in preferred token)
            └── safeTransfer(contract → propmetrikWallet, fee [optionally swapped])

Off-Chain Payments (BTC via NOWPayments):
    Backend ──► recordOffChainPayment(...) ──► On-chain audit trail
```

### Key Design Decisions
1. **No fund custody** — Direct payments use atomic `safeTransferFrom` pairs; contract balance stays zero.
2. **Swap path holds funds transiently** — For DEX swaps, contract receives tokens, swaps, then distributes. All within one atomic tx.
3. **Off-chain attestation** — BTC/external payments are attested on-chain for audit trail only; no actual BTC transferred.

---

## 4. Contract Functionality

### 4.1 Core Payment Functions

| Function | Access | Description |
|---|---|---|
| `processPayment()` | Public | Direct token payment — splits from payer to recipient + platform |
| `processPaymentWithSwap()` | Public | DEX swap payment — converts payer's token to recipient's preferred token |
| `recordOffChainPayment()` | Registrar | Attests off-chain payment (BTC/NOWPayments) for audit trail |
| `calculateFee()` | Public (view) | Preview fee for a given amount + payment type |

### 4.2 Admin Functions (onlyOwner)

| Function | Description |
|---|---|
| `updateFeeConfig()` | Change fee basis points / minimums per payment type |
| `setPaymentTypeEnabled()` | Circuit breaker per payment type |
| `registerRecipient()` | Add recipient wallet mapping |
| `updateRecipientWallet()` | Rotate a recipient's wallet |
| `deactivateRecipient()` | Disable a recipient |
| `reactivateRecipient()` | Re-enable a recipient |
| `updatePROPMETRIKWallet()` | Change platform fee collection wallet |
| `pause()` / `unpause()` | Emergency stop all payments |
| `addToken()` / `removeToken()` | Manage accepted token allowlist |
| `setSwapRouter()` | Configure DEX router address |
| `setPairSwapFeeTier()` | Set pool fee tier for specific token pairs |
| `setMaxSwapSlippage()` | Configure maximum slippage for DEX swaps |
| `setPlatformPreferredToken()` | Set token for auto-converting platform fees |
| `authorizeRegistrar()` / `revokeRegistrar()` | Manage registrar addresses |

### 4.3 Registrar Functions (authorizedRegistrar)

| Function | Description |
|---|---|
| `registerRecipient()` | Add new recipient (backend auto-registration) |
| `recordOffChainPayment()` | Attest BTC/external payments on-chain |
| `setRecipientPreferredToken()` | Set recipient's preferred payout token |

### 4.4 Fee Logic

| Payment Type | Fee Formula | Example |
|---|---|---|
| RENT | `max(principal × 1%, $1.67)` | $200 rent → $2.00 fee; $50 rent → $1.67 fee |
| DEAL | `principal × 0.25%` | $10,000 deal → $25.00 fee |
| PROJECT | `principal × 0.25%` | $5,000 project → $12.50 fee |
| VALUATION | `principal × 2.5%` | $1,000 valuation → $25.00 fee |

Implementation: Basis points (100 = 1%, 25 = 0.25%, 250 = 2.5%) with optional minimum in USDT 6-decimal units.

### 4.5 Access Control

- **Ownership:** `Ownable2Step` — 2-step transfer (propose + accept) prevents accidental loss
- **Registrars:** Authorized backend signers for recipient management and off-chain attestation
- **Production plan:** Transfer ownership to a 2-of-3 Safe multisig after deployment

### 4.6 Security Mechanisms

| Protection | Implementation |
|---|---|
| Reentrancy | `ReentrancyGuard` on all payment functions |
| Double-spend / Replay | `processedReferences` mapping (hash → bool) |
| No fund custody | Direct `safeTransferFrom` splits (swap path is atomic) |
| Emergency stop | `Pausable` + `whenNotPaused` modifier |
| Safe ERC20 | `SafeERC20` library wraps all token transfers |
| Integer overflow | Solidity 0.8.20 built-in checked arithmetic |
| Zero-address checks | All functions validate addresses |
| Slippage protection | `amountOutMinimum` parameter and `maxSwapSlippageBps` limit |

---

## 5. Known Areas of Concern

We'd like the auditors to pay special attention to:

### 5.1 Existing Concerns (from v2.1)

1. **`processPayment()` atomicity** — Can any combination of inputs cause a state where one `safeTransferFrom` succeeds but the other doesn't update state correctly?

2. **`uint96 totalReceived` overflow** — We use `uint96` for gas packing. At USDT 6 decimals, `uint96` holds up to ~79 billion USDT— effectively impossible to overflow, but is the cast safe?

3. **Fee calculation rounding** — `(principal * basisPoints) / 10000` — any edge cases where rounding favors attacker over platform?

4. **`metadata` parameter** — Unused on-chain but passed for off-chain indexing. Any risk from arbitrary calldata?

5. **Front-running** — Could a miner/validator front-run `processPayment()` for benefit? We believe no MEV opportunity exists.

6. **`updateRecipientWallet()` race condition** — When rotating a wallet, any race with concurrent `processPayment()` calls?

### 5.2 New Concerns (v2.3 — DEX Swap)

7. **`processPaymentWithSwap()` slippage attack** — The payer specifies `amountOutMinimum`. Could an attacker manipulate the pool to extract value? We have `maxSwapSlippageBps` as a global limit (default 1%).

8. **Swap router trust** — We call QuickSwap V3's `exactInputSingle()`. If the router is compromised or has a vulnerability, could funds be lost during swap?

9. **DEX callback re-entrancy** — QuickSwap V3 may call back into our contract during swap. Is the `nonReentrant` modifier sufficient?

10. **Token-in stuck after failed swap** — If swap reverts after `safeTransferFrom(payer → contract)`, does the entire transaction revert atomically?

11. **Platform fee swap isolation** — When `platformPreferredToken` is set, we swap platform fees separately. Any risk of partial success leaving funds in contract?

### 5.3 New Concerns (v2.3 — Off-Chain Attestation)

12. **`recordOffChainPayment()` trust model** — Registrars can attest any payment reference. If a registrar key is compromised, they could attest fake payments. Recommend key rotation procedures.

13. **Attestation hash collision** — We store `keccak256(externalPaymentId)` as the attestation hash. Any risk of intentional collision?

14. **Reference namespace collision** — Off-chain and on-chain payments share the `processedReferences` mapping. Is this the intended behavior or a risk?

---

## 6. Existing Security Analysis

### Slither (Trail of Bits)
- **Version:** 0.11.5
- **Note:** v2.3 shows import resolution issues due to OpenZeppelin v5 remappings. Manual Slither run pending.
- **Previous v2.1 result:** 0 findings across 101 detectors

### Test Suite
- **Framework:** Hardhat + ethers.js
- **Tests:** **177/177 passing** across multiple categories
- **Categories covered:**
  - Deployment & initialization
  - Fee calculation (all 4 payment types)
  - Direct payment processing
  - DEX swap payments (`processPaymentWithSwap`)
  - Off-chain attestation (`recordOffChainPayment`)
  - Recipient management & wallet rotation
  - Token allowlist management
  - Access control (owner, registrar)
  - Pause/unpause emergency controls
  - Edge cases and error conditions
- **Full output:** `test-results.txt` (attached)

### Gas Analysis
| Function | Avg Gas | Notes |
|---|---|---|
| `processPayment()` | ~147,000 | Direct transfer path |
| `processPaymentWithSwap()` | ~185,000 | Includes DEX swap |
| `recordOffChainPayment()` | ~65,000 | Off-chain attestation |
| Contract deployment | ~4,194,000 | One-time cost |

---

## 7. Deployment Info

| Environment | Version | Status | Address |
|---|---|---|---|
| Amoy Testnet | v2.3.1 | ✅ Ready | Pending redeployment |
| Polygon Mainnet | v2.1.0 | ⚠️ Outdated | `0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06` |
| Polygon Mainnet | v2.3.1 | 🔜 Pending | Requires this audit |

### External Integrations (Polygon Mainnet)
| Service | Address |
|---|---|
| QuickSwap V3 SwapRouter | `0xf5b509bB0909a69B1c207E495f687a596C168E12` |
| USDT | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` |
| USDC | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| USDC.e (bridged) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| WETH | `0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619` |
| WBTC | `0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6` |

---

## 8. Files Included

```
blockchain/
├── contracts/
│   ├── PROPMETRIKPayments.sol     ← PRIMARY AUDIT TARGET (903 LOC)
│   ├── interfaces/
│   │   └── ISwapRouter.sol        ← QuickSwap V3 interface (24 LOC)
│   └── mocks/
│       └── MockERC20.sol          ← Test only (40 LOC, out of scope)
├── test/
│   ├── PROPMETRIKPayments.test.ts ← Core tests
│   ├── PROPMETRIKPayments.swap.test.ts ← DEX swap tests
│   └── ... (177 total tests)
├── gas-report.txt                 ← Gas usage analysis
├── test-results.txt               ← Hardhat test output
├── hardhat.config.ts              ← Build config
├── package.json                   ← Dependencies
└── audit/
    └── AUDIT_BRIEF.md             ← This document
```

---

## 9. Preferred Deliverables

1. **Audit report** — findings categorized by severity (Critical / High / Medium / Low / Informational)
2. **DEX integration review** — specific analysis of `processPaymentWithSwap()` and QuickSwap V3 interactions
3. **Remediation guidance** — specific code suggestions for each finding
4. **Final sign-off** — confirmation letter after we fix findings, suitable for public disclosure
5. **Timeline:** 1-2 weeks preferred

---

## 10. Budget & Timeline Expectations

| Firm | Est. Cost | Est. Timeline | Notes |
|---|---|---|---|
| **Hacken** | $8,000 – $15,000 | 5-10 business days | 1,500+ audits, Polygon/QuickSwap expertise. |
| **CertiK** | $12,000 – $25,000 | 1-2 weeks | Industry standard, Skynet badge. Premium brand. |
| **Halborn** | $10,000 – $20,000 | 1-2 weeks | NIST-aligned, offensive security background. |
| **OpenZeppelin** | $20,000 – $40,000 | 2-4 weeks | Gold standard. Good for DEX integrations. |
| **Trail of Bits** | $30,000 – $60,000 | 3-6 weeks | Enterprise-grade. May be overkill for our scope. |

**Recommendation:** **Hacken** or **Halborn** — both have DEX/DeFi expertise needed for reviewing the QuickSwap V3 integration. The contract has grown to 903 LOC with complex swap logic, so budget should account for thorough DEX interaction review.

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| v2.3.1 | March 2026 | Added VALUATION fee type, DEX swap via QuickSwap V3, off-chain attestation, registrar system |
| v2.1.0 | February 2025 | Multi-token support, BTC relay (removed in v2.3) |
| v1.0.0 | January 2025 | Initial USDT-only payment processor |

---

*End of audit brief.*
