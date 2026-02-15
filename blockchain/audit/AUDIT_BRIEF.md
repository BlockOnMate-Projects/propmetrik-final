# PROPMETRIKPayments — Security Audit Brief

**Submitted by:** Cedyn Group (PROPMETRIK)
**Date:** February 2025
**Contact:** [engineering@cedynhq.com]

---

## 1. Project Overview

**PROPMETRIK** is a property management platform operating in Ghana. We are adding a USDT crypto payment rail on Polygon so tenants can pay rent and fees directly to landlords/agents, with an automatic platform fee split on every transaction.

### Business Context
- **Users:** Tenants (payers), landlords/agents (recipients), platform admin
- **Geography:** Ghana — tenants pay in USDT on Polygon, amounts denominated in GHS (converted via exchange rate oracle)
- **Volume:** Targeting 100-500 transactions/month initially
- **Chain:** Polygon PoS (mainnet chainId 137, currently on Amoy testnet chainId 80002)

---

## 2. Scope

### In-Scope Contracts

| Contract | File | LOC | Description |
|---|---|---|---|
| `PROPMETRIKPayments` | `contracts/PROPMETRIKPayments.sol` | 427 | Main payment processor |
| `MockUSDT` | `contracts/mocks/MockUSDT.sol` | 31 | Test ERC20 token (NOT for mainnet) |

### Dependencies

| Library | Version | Source |
|---|---|---|
| OpenZeppelin Contracts | 5.0.0 | `@openzeppelin/contracts` |
| Solidity | 0.8.20 | Hardhat compiler |

### Out of Scope
- Backend (Express/TypeScript) — handles off-chain logic only
- Frontend (Next.js tenant portal) — wallet connection via Wagmi
- `MockUSDT.sol` — test-only contract, not deployed to mainnet

---

## 3. Architecture

```
Tenant Wallet (Trust Wallet / WalletConnect)
    │
    ├── approve(USDT, principal + fee)  →  Polygon USDT Contract
    │                                      (0xc2132D05D31c914a87C6611C10748AEb04B58e8F)
    │
    └── processPayment(...)              →  PROPMETRIKPayments Contract
            │
            ├── safeTransferFrom(payer → recipient, principal)
            └── safeTransferFrom(payer → propmetrikWallet, fee)
```

### Key Design Decision: No Fund Custody
The contract **never holds any tokens**. Every payment is an atomic pair of `safeTransferFrom` calls that transfer directly from the payer to the recipient (principal) and to the platform wallet (fee). If either transfer fails, the entire transaction reverts.

---

## 4. Contract Functionality

### 4.1 Core Functions

| Function | Access | Description |
|---|---|---|
| `processPayment()` | Public | Splits USDT from payer to recipient + platform |
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

### 4.3 Fee Logic

| Payment Type | Fee Formula | Example |
|---|---|---|
| RENT | `max(principal × 1%, $1.65)` | $200 rent → $2.00 fee; $50 rent → $1.65 fee |
| DEAL | `principal × 0.25%` | $10,000 deal → $25.00 fee |
| PROJECT | `principal × 0.25%` | $5,000 project → $12.50 fee |

Implementation: Basis points (100 = 1%, 25 = 0.25%) with optional minimum in USDT 6-decimal units.

### 4.4 Access Control

- **Ownership:** `Ownable2Step` — 2-step transfer (propose + accept) prevents accidental loss
- **Production plan:** Transfer ownership to a 2-of-3 Safe multisig after deployment

### 4.5 Security Mechanisms

| Protection | Implementation |
|---|---|
| Reentrancy | `ReentrancyGuard` on `processPayment()` |
| Double-spend / Replay | `processedReferences` mapping (hash → bool) |
| No fund custody | Direct `safeTransferFrom` splits (contract balance always 0) |
| Emergency stop | `Pausable` + `whenNotPaused` modifier |
| Safe ERC20 | `SafeERC20` library wraps all token transfers |
| Integer overflow | Solidity 0.8.20 built-in checked arithmetic |
| Zero-address checks | Constructor + all admin functions |

---

## 5. Known Areas of Concern

We'd like the auditors to pay special attention to:

1. **`processPayment()` atomicity** — Can any combination of inputs cause a state where one `safeTransferFrom` succeeds but the other doesn't update state correctly? (We believe the answer is no — if either reverts, the entire tx reverts, but we'd like confirmation.)

2. **`uint96 totalReceived` overflow** — We use `uint96` for gas packing. At USDT 6 decimals, `uint96` holds up to ~79 billion USDT— effectively impossible to overflow, but is the cast `uint96(principalAmount)` safe if `principalAmount` is a `uint256`? Could a malicious caller pass a value > `uint96.max`?

3. **Fee calculation rounding** — `(principal * basisPoints) / 10000` — any edge cases where rounding favors attacker over platform or vice versa?

4. **`metadata` parameter** — We pass `bytes calldata metadata` to `processPayment()` but never use it on-chain (it's for off-chain indexing via tx input data). Is there any risk from allowing arbitrary calldata here?

5. **Front-running** — Could a miner/validator front-run `processPayment()` for any benefit? We believe no, because the payer explicitly specifies the recipientEntityId and principalAmount — there's no MEV opportunity. We'd like confirmation.

6. **`updateRecipientWallet()` profile transfer** — When rotating a wallet, we copy the `Recipient` struct to the new address and deactivate the old. Any race condition with concurrent `processPayment()` calls?

---

## 6. Existing Security Analysis

### Slither (Trail of Bits)
- **Version:** 0.11.5
- **Result:** **0 findings** across 101 detectors
- **Full JSON report:** `slither-report.json` (attached)

### Test Suite
- **Framework:** Hardhat + ethers.js
- **Tests:** **62/62 passing** across 8 categories
- **Coverage:** Deployment, fee calculation, payment processing, recipient management, access control, pause/unpause, edge cases, view functions
- **Full output:** `test-results.txt` (attached)

---

## 7. Deployment Info

| Environment | Status | Address |
|---|---|---|
| Amoy Testnet | ✅ Deployed | `0x62b94Ce03E8205681368EA548cB089Db9f683F90` |
| Polygon Mainnet | Pending audit | — |

---

## 8. Files Included

```
blockchain/
├── contracts/
│   ├── PROPMETRIKPayments.sol     ← PRIMARY AUDIT TARGET (427 LOC)
│   └── mocks/
│       └── MockUSDT.sol           ← Test only (31 LOC, out of scope)
├── test/
│   └── PROPMETRIKPayments.test.ts ← 62 tests (739 LOC)
├── slither-report.json            ← Slither v0.11.5 output
├── test-results.txt               ← Hardhat test output
├── hardhat.config.ts              ← Build config
├── package.json                   ← Dependencies
└── audit/
    └── AUDIT_BRIEF.md             ← This document
```

---

## 9. Preferred Deliverables

1. **Audit report** — findings categorized by severity (Critical / High / Medium / Low / Informational)
2. **Remediation guidance** — specific code suggestions for each finding
3. **Final sign-off** — confirmation letter after we fix findings, suitable for public disclosure
4. **Timeline:** 1-2 weeks preferred

---

## 10. Budget & Timeline Expectations

| Firm | Est. Cost | Est. Timeline | Notes |
|---|---|---|---|
| **Hacken** | $5,000 – $8,000 | 5-10 business days | 1,500+ audits, Polygon expertise. Best value for our scope. |
| **CertiK** | $8,000 – $15,000 | 1-2 weeks | Industry standard, Skynet badge. Premium brand. |
| **Halborn** | $6,000 – $12,000 | 1-2 weeks | NIST-aligned, offensive security background. |
| **OpenZeppelin** | $15,000 – $30,000 | 2-4 weeks | Gold standard but priced for larger protocols. |
| **Trail of Bits** | $20,000 – $50,000 | 3-6 weeks | Enterprise-grade. Overkill for our contract size. |

**Recommendation:** **Hacken** — they have explicit Polygon ecosystem expertise, have audited 1,500+ projects, offer competitive pricing for small-to-medium contracts (~430 LOC), and include free remediation checks. Their portal provides real-time audit tracking. CertiK is the runner-up if a Skynet security badge is desired for marketing purposes.

---

*End of audit brief.*
