# PROPMETRIK Crypto Payment Smart Contract - Production-Grade Implementation Prompt

## Executive Summary

You are tasked with building a **production-ready Solidity smart contract** for PROPMETRIK's multi-sided payment system on **Polygon blockchain**. This smart contract replicates the exact payment logic and settlement flow currently implemented with Paystack, but for **USDT cryptocurrency payments**.

This is an **OPTIONAL, PARALLEL payment rail** — NOT a replacement for Paystack. It serves international clients who prefer crypto payments while maintaining identical fee structures and settlement logic.

---

## Project Context & Business Model

### Current Architecture (Paystack - Fiat Rail)
PROPMETRIK currently uses Paystack subaccounts to process:
- Property Management: Rent payments (tenant → landlord)
- Deal Management: Deal payments (buyer → deal manager)  
- Project Management: Project payments (client → project manager)

**Critical Principle**: Funds NEVER settle into PROPMETRIK's account. Recipients receive payments directly via Paystack subaccounts. PROPMETRIK only receives service fees.

### New Architecture (Smart Contract - Crypto Rail)
The smart contract must replicate this exact model:
- Payers send USDT
- Recipients receive USDT directly to their wallets
- PROPMETRIK receives only the service fee in USDT
- **NO escrow, NO custody** by PROPMETRIK

---

## Technical Specifications

### Blockchain & Token
- **Network**: Polygon (MATIC) mainnet
- **Token**: USDT (Tether USD - ERC-20 on Polygon)
- **Contract Address**: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` (Polygon USDT)
- **Why Polygon?**: 
  - Gas fees ~$0.01-0.05 per transaction
  - USDT widely available
  - Fast finality (2-3 seconds)
  - EVM-compatible (familiar tooling)

### Payment Types & Fee Structure

The smart contract must support THREE payment types with PAYER-PAID FEES:

#### 1. Property Management (Rent Payments)
```
Payer: Tenant
Recipient: Landlord
Fee: MAX(1% of amount, 25 GHS equivalent in USDT)
```

**Example Flow:**
- Tenant owes: 2,500 GHS (~$165 USDT at current rate)
- Fee calculation: MAX(1% = $1.65, $1.65 equivalent of 25 GHS) = ~$1.65
- **Tenant pays**: $166.65 USDT total
- **Landlord receives**: $165 USDT
- **PROPMETRIK receives**: $1.65 USDT

#### 2. Deal Management
```
Payer: Buyer
Recipient: Deal Manager
Fee: 0.25% of amount
```

**Example Flow:**
- Buyer owes: $50,000 USDT
- Fee: 0.25% = $125 USDT
- **Buyer pays**: $50,125 USDT total
- **Deal Manager receives**: $50,000 USDT
- **PROPMETRIK receives**: $125 USDT

#### 3. Project Management
```
Payer: Client
Recipient: Project Manager
Fee: 0.25% of amount
```

**Example Flow:**
- Client owes: $20,000 USDT
- Fee: 0.25% = $50 USDT
- **Client pays**: $20,050 USDT total
- **Project Manager receives**: $20,000 USDT
- **PROPMETRIK receives**: $50 USDT

---

## Core Contract Requirements

### 1. Multi-Recipient Payment Splitting

The contract MUST execute **atomic payment splits** in a single transaction:

```solidity
// Conceptual flow - NOT final code
function processPayment(
    PaymentType paymentType,
    address recipientWallet,
    uint256 principalAmount,
    string memory paymentReference
) external {
    // 1. Calculate fee based on payment type
    uint256 fee = calculateFee(paymentType, principalAmount);
    uint256 totalAmount = principalAmount + fee;
    
    // 2. Transfer USDT from payer to recipients (atomic)
    USDT.transferFrom(msg.sender, recipientWallet, principalAmount);
    USDT.transferFrom(msg.sender, propMetrikWallet, fee);
    
    // 3. Emit event for backend tracking
    emit PaymentProcessed(
        paymentReference,
        msg.sender,
        recipientWallet,
        principalAmount,
        fee,
        paymentType
    );
}
```

**Key Requirements:**
- ✅ Single transaction (atomic)
- ✅ No intermediate escrow
- ✅ Direct recipient settlement
- ✅ PROPMETRIK receives ONLY fee
- ✅ Revert entire transaction if any transfer fails

### 2. Fee Calculation Engine

Implement a **configurable** fee engine supporting all three payment types:

```solidity
enum PaymentType {
    PROPERTY_MANAGEMENT,  // 1% or 25 GHS min
    DEAL_MANAGEMENT,      // 0.25%
    PROJECT_MANAGEMENT    // 0.25%
}

struct FeeConfig {
    uint256 percentageBasisPoints; // 100 = 1%, 25 = 0.25%
    uint256 minimumFeeUSDT;        // In 6 decimals (USDT uses 6)
    bool enabled;
}

mapping(PaymentType => FeeConfig) public feeConfigs;
```

**Fee Logic Requirements:**
1. **Property Management**: 
   - Calculate 1% of principal
   - Compare with minimum (25 GHS ≈ $1.65 USDT at current rate)
   - Use whichever is GREATER
   - Minimum fee should be **updatable** by admin (for GHS/USD rate changes)

2. **Deal & Project Management**:
   - Simple 0.25% calculation
   - No minimum fee

3. **Admin Functions**:
   - Update fee percentages (onlyOwner)
   - Update minimum fees (onlyOwner)
   - Enable/disable payment types (circuit breaker)

### 3. Recipient Wallet Management

The contract needs a **registry** of authorized recipient wallets:

```solidity
// Store recipient wallet addresses
mapping(address => RecipientProfile) public recipients;

struct RecipientProfile {
    address walletAddress;
    RecipientType recipientType; // LANDLORD, DEAL_MANAGER, PROJECT_MANAGER
    bool isActive;
    uint256 totalReceived; // Running total for analytics
    uint256 paymentCount;  // Number of payments received
}

enum RecipientType {
    LANDLORD,
    DEAL_MANAGER,
    PROJECT_MANAGER
}
```

**Recipient Management Functions:**
- `registerRecipient()` - Add new recipient wallet (onlyOwner or authorized backend)
- `updateRecipientWallet()` - Change wallet address
- `deactivateRecipient()` - Disable payments to a recipient
- `getRecipientDetails()` - View recipient info

**Security Considerations:**
- Only PROPMETRIK backend (via owner or authorized signer) can register recipients
- Prevent payments to unregistered wallets
- Prevent payments to deactivated recipients
- Emit events for all recipient changes

### 4. Payment Processing Function

The main payment function should be **robust** and **secure**:

```solidity
function processPayment(
    PaymentType paymentType,
    address recipientWallet,
    uint256 principalAmount,
    string calldata paymentReference,
    string calldata metadata // JSON string for additional context
) external nonReentrant returns (bool) {
    // 1. Validation
    require(principalAmount > 0, "Amount must be greater than zero");
    require(recipientWallet != address(0), "Invalid recipient");
    require(recipients[recipientWallet].isActive, "Recipient not active");
    require(feeConfigs[paymentType].enabled, "Payment type disabled");
    require(bytes(paymentReference).length > 0, "Reference required");
    
    // 2. Calculate fee
    uint256 fee = _calculateFee(paymentType, principalAmount);
    uint256 totalAmount = principalAmount + fee;
    
    // 3. Check payer has approved sufficient USDT
    require(
        USDT.allowance(msg.sender, address(this)) >= totalAmount,
        "Insufficient USDT allowance"
    );
    
    // 4. Check payer has sufficient balance
    require(
        USDT.balanceOf(msg.sender) >= totalAmount,
        "Insufficient USDT balance"
    );
    
    // 5. Execute atomic transfer
    require(
        USDT.transferFrom(msg.sender, recipientWallet, principalAmount),
        "Transfer to recipient failed"
    );
    require(
        USDT.transferFrom(msg.sender, propMetrikWallet, fee),
        "Fee transfer failed"
    );
    
    // 6. Update analytics
    recipients[recipientWallet].totalReceived += principalAmount;
    recipients[recipientWallet].paymentCount += 1;
    
    // 7. Emit comprehensive event
    emit PaymentProcessed(
        paymentReference,
        msg.sender,
        recipientWallet,
        principalAmount,
        fee,
        paymentType,
        block.timestamp,
        metadata
    );
    
    return true;
}
```

**Critical Security Features:**
- ✅ ReentrancyGuard (OpenZeppelin)
- ✅ Comprehensive input validation
- ✅ Check-Effects-Interactions pattern
- ✅ Explicit balance/allowance checks
- ✅ Atomic transactions (all or nothing)
- ✅ Detailed event emission

### 5. Batch Payment Support (Optional but Recommended)

For efficiency, support **batch payments** in a single transaction:

```solidity
struct PaymentRequest {
    PaymentType paymentType;
    address recipientWallet;
    uint256 principalAmount;
    string paymentReference;
}

function processBatchPayments(
    PaymentRequest[] calldata payments,
    string calldata batchReference
) external nonReentrant returns (bool) {
    require(payments.length > 0 && payments.length <= 50, "Invalid batch size");
    
    uint256 totalRequired = 0;
    
    // Calculate total USDT needed
    for (uint i = 0; i < payments.length; i++) {
        uint256 fee = _calculateFee(payments[i].paymentType, payments[i].principalAmount);
        totalRequired += payments[i].principalAmount + fee;
    }
    
    // Check allowance once
    require(
        USDT.allowance(msg.sender, address(this)) >= totalRequired,
        "Insufficient allowance for batch"
    );
    
    // Process each payment
    for (uint i = 0; i < payments.length; i++) {
        _processSinglePayment(payments[i]);
    }
    
    emit BatchPaymentProcessed(batchReference, msg.sender, payments.length, totalRequired);
    
    return true;
}
```

---

## Events for Backend Integration

The contract MUST emit **comprehensive events** that your backend can monitor:

```solidity
// Main payment event
event PaymentProcessed(
    string indexed paymentReference,
    address indexed payer,
    address indexed recipient,
    uint256 principalAmount,
    uint256 fee,
    PaymentType paymentType,
    uint256 timestamp,
    string metadata
);

// Batch payment event
event BatchPaymentProcessed(
    string indexed batchReference,
    address indexed payer,
    uint256 paymentCount,
    uint256 totalAmount
);

// Fee configuration events
event FeeConfigUpdated(
    PaymentType indexed paymentType,
    uint256 percentageBasisPoints,
    uint256 minimumFeeUSDT
);

// Recipient management events
event RecipientRegistered(
    address indexed recipientWallet,
    RecipientType recipientType
);

event RecipientDeactivated(
    address indexed recipientWallet
);

event RecipientWalletUpdated(
    address indexed oldWallet,
    address indexed newWallet
);

// Emergency events
event EmergencyPause(
    address indexed triggeredBy,
    string reason
);

event EmergencyUnpause(
    address indexed triggeredBy
);
```

**Backend Integration:**
- Monitor events using Web3.js or Ethers.js
- Parse event data to update your database
- Match `paymentReference` to existing payment records
- Generate receipts and confirmations
- Trigger notifications (SMS, email)

---

## Admin & Governance Functions

### Owner Controls (Multi-Sig Recommended)

```solidity
// Fee management
function updateFeeConfig(
    PaymentType paymentType,
    uint256 percentageBasisPoints,
    uint256 minimumFeeUSDT
) external onlyOwner

// Recipient management  
function registerRecipient(
    address wallet,
    RecipientType recipientType
) external onlyOwner

function updateRecipientWallet(
    address oldWallet,
    address newWallet
) external onlyOwner

// Emergency controls
function pause() external onlyOwner
function unpause() external onlyOwner

// Wallet management
function updatePROPMETRIKWallet(address newWallet) external onlyOwner

// Fee withdrawal (for collected fees)
function withdrawCollectedFees(uint256 amount) external onlyOwner
```

**Security Best Practices:**
1. Use **OpenZeppelin Ownable2Step** (not Ownable) - prevents accidental ownership loss
2. Consider **Gnosis Safe multisig** for owner address
3. Implement **timelock** for critical parameter changes
4. Add **pause/unpause** functionality (circuit breaker)
5. Emit events for all admin actions

---

## Security Requirements (Critical)

### 1. Use Audited Libraries
```solidity
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
```

### 2. SafeERC20 for All Transfers
```solidity
using SafeERC20 for IERC20;

// Instead of:
USDT.transferFrom(sender, recipient, amount);

// Use:
USDT.safeTransferFrom(sender, recipient, amount);
```

### 3. Reentrancy Protection
- Add `nonReentrant` modifier to all payment functions
- Follow Check-Effects-Interactions pattern

### 4. Input Validation
- Validate all addresses (not zero address)
- Validate all amounts (greater than zero)
- Validate all strings (not empty)
- Check recipient is active
- Check payment type is enabled

### 5. Integer Overflow/Underflow
- Use Solidity 0.8.x (has built-in overflow checks)
- Be explicit with SafeMath if using older version

### 6. Access Control
- Owner-only functions for admin operations
- Consider role-based access (OpenZeppelin AccessControl)
- Never allow users to modify fee configurations

### 7. Emergency Mechanisms
- Pausable contract (OpenZeppelin Pausable)
- Circuit breaker pattern
- Emergency withdrawal (owner only, with timelock)

---

## USDT Specific Considerations

### USDT on Polygon Details
- **Contract**: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`
- **Decimals**: 6 (NOT 18 like ETH/MATIC)
- **Standard**: ERC-20 compatible

### Decimal Handling
```solidity
// USDT uses 6 decimals
uint256 constant USDT_DECIMALS = 6;

// $100 USDT = 100,000,000 (100 * 10^6)
uint256 oneHundredUSDT = 100 * 10**USDT_DECIMALS;

// Fee calculations must account for this
function _calculateFee(
    PaymentType paymentType,
    uint256 principalAmount
) internal view returns (uint256) {
    FeeConfig memory config = feeConfigs[paymentType];
    
    if (paymentType == PaymentType.PROPERTY_MANAGEMENT) {
        // Calculate 1%
        uint256 percentageFee = (principalAmount * config.percentageBasisPoints) / 10000;
        
        // Compare with minimum
        return percentageFee > config.minimumFeeUSDT ? percentageFee : config.minimumFeeUSDT;
    } else {
        // Deal & Project Management: simple percentage
        return (principalAmount * config.percentageBasisPoints) / 10000;
    }
}
```

### USDT Approval Pattern
Users must **approve** the contract before making payments:

```javascript
// Frontend code (example)
const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const CONTRACT_ADDRESS = "0x..."; // Your deployed contract

// 1. User approves contract to spend USDT
await usdtContract.approve(CONTRACT_ADDRESS, totalAmount);

// 2. User calls payment function
await paymentContract.processPayment(paymentType, recipient, amount, ref, metadata);
```

---

## Testing Requirements

### Unit Tests (Hardhat/Foundry)
```javascript
describe("PROPMETRIK Payment Contract", function() {
    it("Should process property management payment with correct fee", async function() {
        // Test 1% fee calculation
        // Test minimum fee override
        // Test recipient receives principal
        // Test PROPMETRIK receives fee
    });
    
    it("Should process deal management payment with 0.25% fee", async function() {
        // Test 0.25% fee calculation
        // Test recipient receives principal
        // Test PROPMETRIK receives fee
    });
    
    it("Should reject payment to unregistered recipient", async function() {
        // Test access control
    });
    
    it("Should reject payment with insufficient allowance", async function() {
        // Test ERC20 approval check
    });
    
    it("Should emit PaymentProcessed event", async function() {
        // Test event emission
    });
    
    it("Should support batch payments", async function() {
        // Test batch processing
    });
    
    it("Should pause and unpause correctly", async function() {
        // Test emergency controls
    });
});
```

### Integration Tests
- Test with actual Polygon Mumbai testnet USDT
- Test with real wallet interactions (MetaMask)
- Test with various recipient wallets
- Test edge cases (zero amounts, max uint256, etc.)

### Gas Optimization Tests
- Measure gas costs for single payments
- Measure gas costs for batch payments
- Target: <100k gas per payment
- Optimize storage usage

---

## Deployment Strategy

### Phase 1: Testnet Deployment (Mumbai)
1. Deploy contract to Polygon Mumbai testnet
2. Get Mumbai MATIC from faucet
3. Use Mumbai USDT: `0x...` (find from PolygonScan)
4. Test all functions with test wallets
5. Verify contract on Mumbai PolygonScan

### Phase 2: Audit & Security Review
1. Internal code review (checklist)
2. External audit (recommended: OpenZeppelin, ConsenSys Diligence, Trail of Bits)
3. Fix all findings (critical, high, medium)
4. Re-audit if major changes

### Phase 3: Mainnet Deployment
1. Deploy to Polygon mainnet
2. Fund deployer wallet with ~$10 MATIC for gas
3. Initialize contract:
   - Set PROPMETRIK wallet
   - Configure fee structures
   - Register initial recipients (test with small amounts)
4. Verify contract on PolygonScan
5. Transfer ownership to multisig (Gnosis Safe)

### Phase 4: Gradual Rollout
1. Internal testing (PROPMETRIK team)
2. Beta testing (select users)
3. Soft launch (optional payment method)
4. Full launch (advertise crypto option)

---

## Backend Integration Architecture

### Smart Contract ↔ Backend Communication

```
┌─────────────────┐
│   User Wallet   │
│ (MetaMask, etc) │
└────────┬────────┘
         │
         │ 1. Approve USDT
         │ 2. Call processPayment()
         │
         ▼
┌─────────────────────────┐
│  PROPMETRIK Smart       │
│  Contract (Polygon)     │
│  - Validate payment     │
│  - Split USDT           │
│  - Emit events          │
└────────┬────────────────┘
         │
         │ Events emitted
         │
         ▼
┌─────────────────────────┐
│  Alchemy/QuickNode      │
│  (Event Monitoring)     │
└────────┬────────────────┘
         │
         │ Webhook or polling
         │
         ▼
┌─────────────────────────┐
│  PROPMETRIK Backend     │
│  - Listen for events    │
│  - Update database      │
│  - Send notifications   │
│  - Generate receipts    │
└─────────────────────────┘
```

### Event Monitoring Code (Node.js Example)

```javascript
const { ethers } = require('ethers');

// Setup provider
const provider = new ethers.providers.JsonRpcProvider(
    'https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY'
);

// Contract ABI (just the events)
const contractABI = [
    "event PaymentProcessed(string indexed paymentReference, address indexed payer, address indexed recipient, uint256 principalAmount, uint256 fee, uint8 paymentType, uint256 timestamp, string metadata)"
];

// Contract instance
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);

// Listen for payment events
contract.on("PaymentProcessed", async (
    paymentReference,
    payer,
    recipient,
    principalAmount,
    fee,
    paymentType,
    timestamp,
    metadata
) => {
    console.log('Payment received:', paymentReference);
    
    // Update database
    await db.payments.update({
        reference: paymentReference,
        status: 'completed',
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
        payer: payer,
        recipient: recipient,
        amount: ethers.utils.formatUnits(principalAmount, 6), // USDT has 6 decimals
        fee: ethers.utils.formatUnits(fee, 6),
        paymentType: ['PROPERTY', 'DEAL', 'PROJECT'][paymentType],
        timestamp: new Date(timestamp * 1000)
    });
    
    // Send confirmation email/SMS
    await notifications.send({
        to: payer,
        template: 'payment_confirmed',
        data: { reference: paymentReference, amount: principalAmount }
    });
    
    // Generate receipt
    await receipts.generate(paymentReference);
});

console.log('Listening for payment events...');
```

---

## User Experience Flow

### Frontend Payment Flow (Tenant Paying Rent Example)

**Step 1: User initiates payment**
- User clicks "Pay Rent" in tenant portal
- Modal opens showing:
  - Amount due: 2,500 GHS
  - "Pay with Crypto" option visible
  - User clicks "Pay with Crypto (USDT)"

**Step 2: Payment method selection**
- UI shows: "Pay with USDT on Polygon"
- Display: Principal: $165 USDT, Fee: $1.65 USDT, Total: $166.65 USDT
- User clicks "Connect Wallet"

**Step 3: Wallet connection**
- WalletConnect modal opens
- User selects MetaMask (or Tangem, Coinbase Wallet, etc.)
- User approves connection
- UI shows: Connected to [0x1234...5678]

**Step 4: Check balance**
- UI checks: Does user have ≥$166.65 USDT on Polygon?
- If NO: Show "Insufficient balance. Buy USDT or bridge from another network."
- If YES: Proceed

**Step 5: Approve USDT spending**
- UI: "Approve PROPMETRIK contract to spend $166.65 USDT"
- MetaMask popup: "Approve token spending"
- User confirms (Gas: ~$0.01 MATIC)
- Wait for confirmation (~3 seconds)

**Step 6: Process payment**
- UI: "Confirm payment"
- MetaMask popup: "Send transaction to PROPMETRIK Contract"
- Details:
  - To: PROPMETRIK Contract
  - Function: processPayment()
  - Gas: ~$0.02 MATIC
- User confirms
- UI shows: "Processing payment..."

**Step 7: Confirmation**
- Transaction mined (~3 seconds)
- UI shows: "Payment successful! ✅"
- Display:
  - Transaction hash: 0xabc...def
  - View on PolygonScan (link)
  - Download receipt (button)
- Backend receives event → updates status → sends email

**Total time**: ~30 seconds (vs 2-5 minutes for international card payments)
**Total cost**: ~$0.03 in gas fees (paid by tenant in MATIC)

---

## Smart Contract Code Structure

### Recommended File Organization

```
contracts/
├── PROPMETRIKPayments.sol          // Main payment contract
├── interfaces/
│   └── IUSDTToken.sol              // USDT interface
├── libraries/
│   └── FeeCalculator.sol           // Fee calculation logic
└── mocks/
    └── MockUSDT.sol                // For testing

test/
├── PROPMETRIKPayments.test.js      // Unit tests
├── Integration.test.js             // Integration tests
└── Security.test.js                // Security tests

scripts/
├── deploy.js                       // Deployment script
├── verify.js                       // Contract verification
└── initialize.js                   // Post-deployment setup

hardhat.config.js                   // Hardhat configuration
```

### Main Contract Skeleton

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title PROPMETRIKPayments
 * @author PROPMETRIK Engineering Team
 * @notice Multi-sided payment splitting contract for property management,
 *         deal management, and project management payments in USDT
 * @dev Implements atomic payment splits with configurable fees
 */
contract PROPMETRIKPayments is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;
    
    // ============================================
    // STATE VARIABLES
    // ============================================
    
    IERC20 public immutable USDT;
    address public propMetrikWallet;
    
    uint256 public constant BASIS_POINTS = 10000; // 100% = 10000 basis points
    uint256 public constant USDT_DECIMALS = 6;
    
    // ============================================
    // ENUMS & STRUCTS
    // ============================================
    
    enum PaymentType {
        PROPERTY_MANAGEMENT,
        DEAL_MANAGEMENT,
        PROJECT_MANAGEMENT
    }
    
    enum RecipientType {
        LANDLORD,
        DEAL_MANAGER,
        PROJECT_MANAGER
    }
    
    struct FeeConfig {
        uint256 percentageBasisPoints;
        uint256 minimumFeeUSDT;
        bool enabled;
    }
    
    struct RecipientProfile {
        address walletAddress;
        RecipientType recipientType;
        bool isActive;
        uint256 totalReceived;
        uint256 paymentCount;
    }
    
    // ============================================
    // MAPPINGS
    // ============================================
    
    mapping(PaymentType => FeeConfig) public feeConfigs;
    mapping(address => RecipientProfile) public recipients;
    mapping(string => bool) public processedReferences; // Prevent duplicate payments
    
    // ============================================
    // EVENTS
    // ============================================
    
    event PaymentProcessed(
        string indexed paymentReference,
        address indexed payer,
        address indexed recipient,
        uint256 principalAmount,
        uint256 fee,
        PaymentType paymentType,
        uint256 timestamp,
        string metadata
    );
    
    event FeeConfigUpdated(
        PaymentType indexed paymentType,
        uint256 percentageBasisPoints,
        uint256 minimumFeeUSDT
    );
    
    event RecipientRegistered(
        address indexed recipientWallet,
        RecipientType recipientType
    );
    
    event RecipientDeactivated(address indexed recipientWallet);
    
    event PROPMETRIKWalletUpdated(address indexed oldWallet, address indexed newWallet);
    
    // ============================================
    // CONSTRUCTOR
    // ============================================
    
    constructor(
        address _usdtAddress,
        address _propMetrikWallet
    ) {
        require(_usdtAddress != address(0), "Invalid USDT address");
        require(_propMetrikWallet != address(0), "Invalid PROPMETRIK wallet");
        
        USDT = IERC20(_usdtAddress);
        propMetrikWallet = _propMetrikWallet;
        
        // Initialize default fee configs
        _initializeFeeConfigs();
    }
    
    // ============================================
    // MAIN PAYMENT FUNCTION
    // ============================================
    
    function processPayment(
        PaymentType paymentType,
        address recipientWallet,
        uint256 principalAmount,
        string calldata paymentReference,
        string calldata metadata
    ) external nonReentrant whenNotPaused returns (bool) {
        // Implementation here...
    }
    
    // ============================================
    // ADMIN FUNCTIONS
    // ============================================
    
    // Fee management, recipient management, etc.
    
    // ============================================
    // INTERNAL FUNCTIONS
    // ============================================
    
    function _calculateFee(
        PaymentType paymentType,
        uint256 principalAmount
    ) internal view returns (uint256) {
        // Implementation here...
    }
    
    function _initializeFeeConfigs() internal {
        // Initialize default fees
    }
}
```

---

## Gas Optimization Strategies

### 1. Minimize Storage Operations
```solidity
// ❌ Bad: Multiple storage writes
recipients[wallet].totalReceived += amount;
recipients[wallet].paymentCount += 1;

// ✅ Good: Load to memory, modify, write once
RecipientProfile memory profile = recipients[wallet];
profile.totalReceived += amount;
profile.paymentCount += 1;
recipients[wallet] = profile;
```

### 2. Use Immutable Where Possible
```solidity
// ✅ USDT address never changes
IERC20 public immutable USDT;
```

### 3. Pack Structs Efficiently
```solidity
// ❌ Bad: Wastes storage
struct FeeConfig {
    uint256 percentageBasisPoints;  // 32 bytes
    uint256 minimumFeeUSDT;         // 32 bytes
    bool enabled;                   // 1 byte (but uses 32 bytes)
}

// ✅ Good: Packed into fewer slots
struct FeeConfig {
    uint128 percentageBasisPoints;  // 16 bytes
    uint128 minimumFeeUSDT;         // 16 bytes (total: 32 bytes)
    bool enabled;                   // 1 byte (packs with above)
}
```

### 4. Use `calldata` for Read-Only Parameters
```solidity
// ✅ Use calldata for strings that aren't modified
function processPayment(
    string calldata paymentReference,
    string calldata metadata
) external { ... }
```

### 5. Batch Operations
- Implement batch payment function
- Users save gas by processing multiple payments in one transaction

---

## Deliverables

### 1. Smart Contract Files
- `PROPMETRIKPayments.sol` - Main contract
- `FeeCalculator.sol` - Fee calculation library (optional)
- All necessary interfaces

### 2. Testing Suite
- Comprehensive unit tests (>90% coverage)
- Integration tests with Mumbai testnet
- Gas usage reports
- Security test suite

### 3. Deployment Scripts
- Hardhat deploy script for testnet
- Hardhat deploy script for mainnet
- Contract verification script
- Initialization script (set fees, register recipients)

### 4. Documentation
- **README.md**: Setup instructions, how to deploy, how to test
- **ARCHITECTURE.md**: High-level design, flows, diagrams
- **API.md**: All public functions, parameters, return values
- **SECURITY.md**: Security considerations, audit checklist
- **INTEGRATION.md**: How backend integrates (event monitoring, etc.)

### 5. Deployment Artifacts
- Deployed contract addresses (testnet & mainnet)
- ABI JSON files
- Verified source code on PolygonScan
- Deployment transaction hashes

---

## Success Criteria

A successful smart contract implementation will:

✅ **Functional Requirements**
- Process all three payment types correctly
- Calculate fees according to exact specifications
- Execute atomic payment splits (no partial failures)
- Emit comprehensive events for backend tracking
- Support batch payments efficiently
- Allow admin configuration of fees and recipients

✅ **Security Requirements**
- Pass all security tests (no reentrancy, no overflows, etc.)
- Use OpenZeppelin audited libraries
- Implement pause/unpause mechanism
- Validate all inputs rigorously
- Handle edge cases gracefully

✅ **Gas Efficiency**
- Single payment: <100k gas (~$0.02 at current prices)
- Batch payment (5 payments): <300k gas (~$0.06)
- No unnecessary storage operations
- Optimized struct packing

✅ **Production Readiness**
- Deployed and verified on Polygon mainnet
- Ownership transferred to multisig
- All functions tested with real USDT on testnet
- Documentation complete
- Backend integration tested

✅ **User Experience**
- Payment completes in <10 seconds
- Clear error messages
- Events emitted immediately after transaction
- Supports all major wallets (MetaMask, WalletConnect, etc.)

---

## Common Pitfalls to Avoid

### 1. ❌ Floating Point Math
```solidity
// ❌ Wrong: Solidity doesn't support decimals
uint256 fee = amount * 0.01;

// ✅ Correct: Use basis points
uint256 fee = (amount * 100) / 10000; // 1%
```

### 2. ❌ Not Handling USDT's 6 Decimals
```solidity
// ❌ Wrong: Assumes 18 decimals like ETH
uint256 oneDollar = 1 * 10**18;

// ✅ Correct: USDT uses 6 decimals
uint256 oneDollar = 1 * 10**6;
```

### 3. ❌ Using `transfer()` Instead of SafeERC20
```solidity
// ❌ Wrong: transfer() can fail silently with some tokens
USDT.transfer(recipient, amount);

// ✅ Correct: Use SafeERC20
using SafeERC20 for IERC20;
USDT.safeTransfer(recipient, amount);
```

### 4. ❌ Not Checking Allowance Before `transferFrom()`
```solidity
// ✅ Always check
require(
    USDT.allowance(payer, address(this)) >= totalAmount,
    "Insufficient allowance"
);
```

### 5. ❌ Mutable PROPMETRIK Wallet Without Timelock
```solidity
// ❌ Risk: Owner can instantly change wallet to steal fees
function setPROPMETRIKWallet(address newWallet) external onlyOwner {
    propMetrikWallet = newWallet;
}

// ✅ Better: Add timelock (optional) or require multisig
```

---

## Post-Deployment Checklist

### Immediately After Deployment
- [ ] Verify contract source on PolygonScan
- [ ] Transfer ownership to multisig (Gnosis Safe)
- [ ] Configure initial fee structures
- [ ] Register test recipients
- [ ] Test with small amounts (~$1 USDT)
- [ ] Monitor events for first 24 hours
- [ ] Update backend to listen to contract address

### First Week
- [ ] Process 10-20 test transactions
- [ ] Verify all events are captured correctly
- [ ] Test pause/unpause functionality
- [ ] Test fee updates (if needed)
- [ ] Monitor gas costs (should be <$0.05 per payment)
- [ ] Verify PROPMETRIK wallet is receiving fees correctly

### First Month
- [ ] Enable for beta users (international clients only)
- [ ] Collect user feedback
- [ ] Monitor for any unusual activity
- [ ] Consider external security audit
- [ ] Optimize gas if needed
- [ ] Update documentation based on real usage

---

## Alternative Architectures Considered

### 1. Escrow Model (Rejected)
**Why rejected**: Adds complexity, custody risk, and doesn't match Paystack model

### 2. Pull Payment Model (Rejected)
**Why rejected**: Recipients would need to manually claim payments, poor UX

### 3. Upgradeable Contract (Not Implemented)
**Status**: Optional future enhancement
**Risk**: Adds complexity and potential attack vectors
**Benefit**: Can fix bugs without redeploying

### 4. Multi-Token Support (Future)
**Status**: Phase 2 feature
**Idea**: Support USDC, DAI, cUSD (Celo) in addition to USDT

---

## Support & Maintenance

### Monitoring
- Use Alchemy or QuickNode for reliable RPC
- Set up alerts for unusual gas spikes
- Monitor PROPMETRIK wallet balance (fees accumulating)
- Track daily transaction volume
- Set up alerts for contract being paused

### Maintenance
- Review and update minimum fees quarterly (adjust for GHS/USD rate)
- Consider fee optimization based on usage patterns
- Respond to security alerts promptly
- Plan for contract upgrades (if needed)

### User Support
- Provide clear documentation on crypto payments
- Create video tutorials for wallet setup
- Offer troubleshooting guide (insufficient balance, wrong network, etc.)
- Have customer support trained on crypto payments

---

## Final Notes

### Why This Approach Works
1. **Mirrors Paystack exactly** - Same fee logic, same settlement model
2. **No custody risk** - PROPMETRIK never holds user funds
3. **Atomic transactions** - All or nothing, no partial failures
4. **Transparent** - All transactions visible on-chain
5. **Cost-effective** - $0.02 vs $5-15 for international wires
6. **Fast** - 3 seconds vs 2-5 days for bank transfers

### When NOT to Use Crypto Rail
- Local Ghanaian users (mobile money via Paystack is better)
- Small amounts (<$50) where gas fees are significant % of payment
- Users unfamiliar with crypto (requires education)
- When speed is critical and user doesn't have USDT ready

### When TO Use Crypto Rail
- International payments (diaspora, foreign investors)
- Large amounts (>$1000) where % fee is negligible
- Users who prefer crypto
- Cross-border transactions (avoids FX fees)
- When Paystack card payments fail (international card declines)

---

## Request for Claude

**Please generate:**
1. Complete `PROPMETRIKPayments.sol` smart contract
2. Comprehensive test suite (Hardhat)
3. Deployment script (testnet + mainnet)
4. Event monitoring example (Node.js)
5. README with setup instructions

**Contract must:**
- Use Solidity 0.8.20+
- Use OpenZeppelin libraries
- Follow all security best practices above
- Have detailed comments/natspec
- Be gas-optimized
- Be production-ready

**Test suite must:**
- Cover all functions
- Test happy paths and edge cases
- Test security (reentrancy, overflow, access control)
- Include gas usage reports
- Use realistic amounts and scenarios

**Deployment script must:**
- Support both testnet and mainnet
- Include contract verification
- Handle initialization (fees, wallets)
- Provide clear instructions

Thank you!