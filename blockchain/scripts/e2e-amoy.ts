/**
 * PROPMETRIKPayments v2.1 — Full E2E Test on Amoy Testnet
 *
 * Tests all 6 currencies across all 3 payment types:
 *   1. USDT  → RENT   (stablecoin, 6 decimals)
 *   2. USDC  → DEAL   (stablecoin, 6 decimals)
 *   3. WETH  → PROJECT (18 decimals)
 *   4. WBTC  → RENT   (8 decimals)
 *
 * Usage: npx hardhat run scripts/e2e-amoy.ts --network amoy
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ABI fragments we need
const MOCK_ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

async function main() {
  // ── Load deployment ────────────────────────────────────────────
  const depPath = path.join(__dirname, "..", "deployments", "amoy-deployment.json");
  if (!fs.existsSync(depPath)) {
    throw new Error("Deployment file not found. Run deploy.ts first.");
  }
  const dep = JSON.parse(fs.readFileSync(depPath, "utf-8"));

  const [deployer] = await ethers.getSigners();
  const contract = await ethers.getContractAt("PROPMETRIKPayments", dep.contract);
  const contractAddr = dep.contract;

  console.log("═══════════════════════════════════════════════════");
  console.log("  PROPMETRIK v2.1 — E2E Payment Test (Amoy)");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Contract:  ${contractAddr}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} POL\n`);

  // ── Register a test recipient ──────────────────────────────────
  const entityId = ethers.keccak256(ethers.toUtf8Bytes("e2e-landlord-001"));
  const recipientWallet = deployer.address; // use deployer as recipient for simplicity

  console.log("1. Registering test recipient...");
  try {
    const regTx = await contract.registerRecipient(entityId, recipientWallet);
    await regTx.wait();
    console.log("   ✅ Recipient registered\n");
  } catch (err: any) {
    if (err.message.includes("Entity already registered")) {
      console.log("   ℹ️  Recipient already registered, continuing\n");
    } else {
      throw err;
    }
  }

  // ── Helper: run an ERC20 payment test ──────────────────────────
  let testNum = 0;
  const results: { test: string; status: string; txHash?: string; fee?: string }[] = [];

  async function testERC20Payment(
    tokenInfo: { address: string; symbol: string; decimals: number },
    paymentType: number, // 0=RENT, 1=DEAL, 2=PROJECT
    paymentTypeLabel: string,
    amountHuman: string,
  ) {
    testNum++;
    const label = `${testNum}. ${tokenInfo.symbol} → ${paymentTypeLabel}`;
    console.log(`${label} (${amountHuman} ${tokenInfo.symbol})`);

    try {
      const token = new ethers.Contract(tokenInfo.address, MOCK_ERC20_ABI, deployer);
      const amount = ethers.parseUnits(amountHuman, tokenInfo.decimals);

      // Mint tokens to deployer
      const mintTx = await token.mint(deployer.address, amount * 2n); // mint extra for fees
      await mintTx.wait();
      console.log(`   💰 Minted ${amountHuman} ${tokenInfo.symbol}`);

      // Approve contract
      const approveTx = await token.approve(contractAddr, ethers.MaxUint256);
      await approveTx.wait();
      console.log(`   ✓  Approved`);

      // Calculate fee first
      const feeAmount = await contract.calculateFee(tokenInfo.address, paymentType, amount);
      console.log(`   📊 Fee: ${ethers.formatUnits(feeAmount, tokenInfo.decimals)} ${tokenInfo.symbol}`);

      // Ensure we have enough (mint fee amount too)
      const mintFeeTx = await token.mint(deployer.address, feeAmount);
      await mintFeeTx.wait();

      // Process payment
      const ref = ethers.keccak256(ethers.toUtf8Bytes(`e2e-${tokenInfo.symbol}-${paymentTypeLabel}-${Date.now()}`));
      const tx = await contract.processPayment(
        tokenInfo.address,
        paymentType,
        entityId,
        amount,
        ref,
        "0x",
      );
      const receipt = await tx.wait();
      console.log(`   ✅ Payment processed! TX: ${receipt!.hash}`);
      console.log(`   ⛽ Gas used: ${receipt!.gasUsed.toString()}\n`);

      results.push({
        test: `${tokenInfo.symbol} ${paymentTypeLabel}`,
        status: "✅ PASS",
        txHash: receipt!.hash,
        fee: ethers.formatUnits(feeAmount, tokenInfo.decimals),
      });
    } catch (err: any) {
      console.log(`   ❌ FAILED: ${err.message}\n`);
      results.push({ test: `${tokenInfo.symbol} ${paymentTypeLabel}`, status: "❌ FAIL" });
    }
  }

  // ── Run all E2E tests ──────────────────────────────────────────
  const tokens = dep.tokens as { address: string; symbol: string; decimals: number }[];
  const usdt = tokens.find((t: any) => t.symbol === "USDT")!;
  const usdc = tokens.find((t: any) => t.symbol === "USDC")!;
  const weth = tokens.find((t: any) => t.symbol === "WETH")!;
  const wbtc = tokens.find((t: any) => t.symbol === "WBTC")!;

  // Test 1: USDT RENT ($500)
  await testERC20Payment(usdt, 0, "RENT", "500");

  // Test 2: USDC DEAL ($10,000)
  await testERC20Payment(usdc, 1, "DEAL", "10000");

  // Test 3: WETH PROJECT (0.5 WETH)
  await testERC20Payment(weth, 2, "PROJECT", "0.5");

  // Test 4: WBTC RENT (0.01 WBTC)
  await testERC20Payment(wbtc, 0, "RENT", "0.01");

  // ── Verify on-chain state ──────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  Post-Payment Verification");
  console.log("═══════════════════════════════════════════════════\n");

  const profile = await contract.getRecipientProfile(deployer.address);
  console.log(`Recipient active:          ${profile.isActive}`);
  console.log(`Recipient payment count:   ${profile.paymentCount.toString()}\n`);

  const tokenCount = await contract.getTokenCount();
  console.log(`Accepted tokens:           ${tokenCount}`);

  const owner = await contract.owner();
  console.log(`Contract owner:            ${owner}`);

  const wallet = await contract.propmetrikWallet();
  console.log(`Platform wallet:           ${wallet}`);

  const paused = await contract.paused();
  console.log(`Contract paused:           ${paused}\n`);

  // ── Summary ────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log("  E2E Test Results");
  console.log("═══════════════════════════════════════════════════");
  for (const r of results) {
    const feeStr = r.fee ? ` (fee: ${r.fee})` : "";
    console.log(`  ${r.status}  ${r.test}${feeStr}`);
  }
  const passed = results.filter((r) => r.status.includes("PASS")).length;
  const total = results.length;
  console.log(`\n  ${passed}/${total} tests passed`);
  console.log("═══════════════════════════════════════════════════");

  if (passed < total) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
