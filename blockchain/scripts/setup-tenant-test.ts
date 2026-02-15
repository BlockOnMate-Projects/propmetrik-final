/**
 * Setup tenant test wallets on Amoy for manual E2E testing.
 *
 * 1. Mints mock tokens to the tenant wallet
 * 2. Registers a test landlord recipient (using deployer as landlord)
 * 3. Prints instructions for the tenant to test on Amoyscan
 *
 * Usage: npx hardhat run scripts/setup-tenant-test.ts --network amoy
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TENANT_WALLET = "0x7c858007aafe82492e30a239a8d1fe6d1e2396f6";

// We'll use a fresh entityId for this manual test
const LANDLORD_ENTITY_ID = ethers.keccak256(ethers.toUtf8Bytes("manual-test-landlord-001"));

const MOCK_ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
];

async function main() {
  const depPath = path.join(__dirname, "..", "deployments", "amoy-deployment.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf-8"));
  const [deployer] = await ethers.getSigners();
  const contract = await ethers.getContractAt("PROPMETRIKPayments", dep.contract);

  console.log("═══════════════════════════════════════════════════");
  console.log("  Tenant Test Setup — Amoy");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Contract:       ${dep.contract}`);
  console.log(`Tenant wallet:  ${TENANT_WALLET}`);
  console.log(`Deployer:       ${deployer.address}`);
  console.log("");

  // ─── 1. Register a landlord recipient (deployer address as landlord) ───
  // Use a second signer address or deployer itself as recipient
  // We'll use a deterministic address for the "landlord"
  const landlordWallet = ethers.getAddress("0xf28ad8386af38bac1d12a37fbcd9df41b6d48a47"); // checksummed
  
  console.log("1. Registering test landlord recipient...");
  try {
    const tx = await contract.registerRecipient(LANDLORD_ENTITY_ID, landlordWallet);
    await tx.wait();
    console.log(`   ✅ Landlord registered: ${landlordWallet}`);
  } catch (err: any) {
    if (err.message.includes("already registered") || err.message.includes("already assigned")) {
      console.log(`   ℹ️  Landlord already registered, continuing`);
    } else {
      throw err;
    }
  }

  // ─── 2. Mint tokens to tenant ─────────────────────────────────
  console.log("\n2. Minting tokens to tenant...");

  const mintAmounts: { symbol: string; amount: string; decimals: number }[] = [
    { symbol: "USDT",   amount: "10000",  decimals: 6  },
    { symbol: "USDC",   amount: "10000",  decimals: 6  },
    { symbol: "WETH",   amount: "5",      decimals: 18 },
    { symbol: "WBTC",   amount: "1",      decimals: 8  },
  ];

  for (const m of mintAmounts) {
    const tokenInfo = dep.tokens.find((t: any) => t.symbol === m.symbol);
    if (!tokenInfo) { console.log(`   ⚠️  ${m.symbol} not found in deployment`); continue; }

    const token = new ethers.Contract(tokenInfo.address, MOCK_ERC20_ABI, deployer);
    const amount = ethers.parseUnits(m.amount, m.decimals);
    const tx = await token.mint(TENANT_WALLET, amount);
    await tx.wait();

    const balance = await token.balanceOf(TENANT_WALLET);
    console.log(`   ✅ ${m.symbol}: minted ${m.amount} → balance: ${ethers.formatUnits(balance, m.decimals)}`);
  }

  // ─── 3. Print tenant instructions ─────────────────────────────
  const usdt = dep.tokens.find((t: any) => t.symbol === "USDT");
  const usdc = dep.tokens.find((t: any) => t.symbol === "USDC");

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  TENANT TEST INSTRUCTIONS");
  console.log("═══════════════════════════════════════════════════");
  console.log("");
  console.log("Your tenant wallet has been funded with test tokens.");
  console.log("Open the verified contract on Amoyscan to test:");
  console.log(`  https://amoy.polygonscan.com/address/${dep.contract}#writeContract`);
  console.log("");
  console.log("─── Step 1: Approve USDT ──────────────────────────");
  console.log(`  Go to USDT contract: https://amoy.polygonscan.com/address/${usdt.address}#writeContract`);
  console.log(`  Call: approve(`);
  console.log(`    spender: ${dep.contract}`);
  console.log(`    amount:  115792089237316195423570985008687907853269984665640564039457584007913129639935`);
  console.log(`  )`);
  console.log("");
  console.log("─── Step 2: Process RENT Payment ──────────────────");
  console.log(`  Go to: https://amoy.polygonscan.com/address/${dep.contract}#writeContract`);
  console.log(`  Call: processPayment(`);
  console.log(`    token:              ${usdt.address}`);
  console.log(`    paymentType:        0                              (0 = RENT)`);
  console.log(`    recipientEntityId:  ${LANDLORD_ENTITY_ID}`);
  console.log(`    principalAmount:    500000000                      (500 USDT = 500 × 10^6)`);
  console.log(`    paymentReference:   ${ethers.keccak256(ethers.toUtf8Bytes("manual-rent-test-001"))}`);
  console.log(`    metadata:           0x`);
  console.log(`  )`);
  console.log("");
  console.log("─── Step 3: Verify Results ────────────────────────");
  console.log(`  • Tenant (${TENANT_WALLET}) lost 505 USDT (500 principal + 5 fee)`);
  console.log(`  • Landlord (${landlordWallet}) received 500 USDT`);
  console.log(`  • Platform (${dep.propmetrikWallet}) received 5 USDT fee`);
  console.log("");
  console.log("─── Optional: Test USDC DEAL ──────────────────────");
  console.log(`  Same flow but with:`);
  console.log(`    token:              ${usdc?.address}`);
  console.log(`    paymentType:        1                              (1 = DEAL)`);
  console.log(`    principalAmount:    10000000000                    (10,000 USDC = 10000 × 10^6)`);
  console.log(`    paymentReference:   ${ethers.keccak256(ethers.toUtf8Bytes("manual-deal-test-001"))}`);
  console.log(`  Expected: 25 USDC fee (0.25% of 10,000)`);
  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("  Addresses Summary");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Contract:          ${dep.contract}`);
  console.log(`  Tenant:            ${TENANT_WALLET}`);
  console.log(`  Landlord:          ${landlordWallet}`);
  console.log(`  Platform (Safe):   ${dep.propmetrikWallet}`);
  console.log(`  Landlord EntityId: ${LANDLORD_ENTITY_ID}`);
  console.log("");
  console.log("  Token addresses (import into Trust Wallet):");
  for (const t of dep.tokens) {
    console.log(`    ${t.symbol.padEnd(8)} ${t.address}  (${t.decimals} dec)`);
  }
  console.log("═══════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
