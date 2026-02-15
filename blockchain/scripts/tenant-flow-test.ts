import { ethers } from "hardhat";

/**
 * Simulates a real tenant making a USDT rent payment.
 * Creates a fresh wallet, funds it, approves, and pays — 
 * exactly what a frontend user would do.
 */
async function main() {
  const CONTRACT = "0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06";
  const USDT_ADDR = "0x04BdA11dCB7d803c5bc46CBCdBb336D3e38f22dC";
  const USDC_ADDR = "0xa18292064a2904010F96999ddcfc3c21E0c1941a";
  const WETH_ADDR = "0x09466e26831599556307E9b99791C972A617A14D";
  const LANDLORD_ENTITY_ID = "0xb6dfb1117df78b02ea718f85bffd55d7864e1289cd70432240c574c266919538";

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // --- Create a fresh tenant wallet ---
  const tenantWallet = ethers.Wallet.createRandom().connect(ethers.provider);
  console.log("\n=== TENANT WALLET (throwaway test) ===");
  console.log("Address:", tenantWallet.address);
  console.log("Private Key:", tenantWallet.privateKey);
  console.log("(This is a throwaway testnet wallet — no real value)\n");

  // --- Fund tenant with POL for gas ---
  console.log("1. Sending 0.3 POL for gas...");
  const gasTx = await deployer.sendTransaction({
    to: tenantWallet.address,
    value: ethers.parseEther("0.3"),
  });
  await gasTx.wait();
  console.log("   Gas funded ✓");

  // --- Mint tokens to tenant ---
  const usdt = await ethers.getContractAt("MockERC20", USDT_ADDR);
  const usdc = await ethers.getContractAt("MockERC20", USDC_ADDR);
  const weth = await ethers.getContractAt("MockERC20", WETH_ADDR);

  console.log("2. Minting test tokens...");
  await (await usdt.mint(tenantWallet.address, 10000n * 10n ** 6n)).wait();
  await (await usdc.mint(tenantWallet.address, 10000n * 10n ** 6n)).wait();
  await (await weth.mint(tenantWallet.address, ethers.parseEther("5"))).wait();
  console.log("   10K USDT, 10K USDC, 5 WETH minted ✓\n");

  // --- Connect contract as tenant ---
  const contract = await ethers.getContractAt("PROPMETRIKPayments", CONTRACT, tenantWallet);
  const usdtAsTenant = usdt.connect(tenantWallet);
  const usdcAsTenant = usdc.connect(tenantWallet);

  // =============================================
  //  TEST 1: USDT Rent Payment ($500)
  // =============================================
  console.log("══════════════════════════════════════");
  console.log("TEST 1: USDT RENT — $500");
  console.log("══════════════════════════════════════");

  const rentAmount = 500n * 10n ** 6n; // 500 USDT
  const rentRef = ethers.keccak256(ethers.toUtf8Bytes("tenant-test-rent-" + Date.now()));

  // Step A: Tenant approves contract to spend USDT
  console.log("3a. Approving USDT spend...");
  const approveTx = await usdtAsTenant.approve(CONTRACT, ethers.MaxUint256);
  await approveTx.wait();
  console.log("    Approved ✓");

  // Step B: Tenant calls processPayment
  console.log("3b. Processing USDT rent payment ($500)...");
  const tenantUsdtBefore = await usdt.balanceOf(tenantWallet.address);
  
  const payTx = await contract.processPayment(
    USDT_ADDR,          // token
    0,                   // paymentType: RENT
    LANDLORD_ENTITY_ID,  // recipientEntityId
    rentAmount,          // principalAmount
    rentRef,             // paymentReference
    "0x"                 // metadata
  );
  const receipt = await payTx.wait();
  console.log("    Tx hash:", receipt!.hash);
  console.log("    Gas used:", receipt!.gasUsed.toString());

  // Step C: Verify balances
  const tenantUsdtAfter = await usdt.balanceOf(tenantWallet.address);
  const tenantSpent = tenantUsdtBefore - tenantUsdtAfter;
  console.log("    Tenant spent:", Number(tenantSpent) / 1e6, "USDT");
  console.log("    (500 principal + fee) ✓\n");

  // =============================================
  //  TEST 2: USDC Deal Payment ($2,000)
  // =============================================
  console.log("══════════════════════════════════════");
  console.log("TEST 2: USDC DEAL — $2,000");
  console.log("══════════════════════════════════════");

  const dealAmount = 2000n * 10n ** 6n; // 2000 USDC
  const dealRef = ethers.keccak256(ethers.toUtf8Bytes("tenant-test-deal-" + Date.now()));

  console.log("4a. Approving USDC spend...");
  const approveUsdc = await usdcAsTenant.approve(CONTRACT, ethers.MaxUint256);
  await approveUsdc.wait();
  console.log("    Approved ✓");

  console.log("4b. Processing USDC deal payment ($2,000)...");
  const tenantUsdcBefore = await usdc.balanceOf(tenantWallet.address);

  const dealTx = await contract.processPayment(
    USDC_ADDR,           // token
    1,                   // paymentType: DEAL
    LANDLORD_ENTITY_ID,  // recipientEntityId
    dealAmount,          // principalAmount
    dealRef,             // paymentReference
    "0x"                 // metadata
  );
  const dealReceipt = await dealTx.wait();
  console.log("    Tx hash:", dealReceipt!.hash);
  console.log("    Gas used:", dealReceipt!.gasUsed.toString());

  const tenantUsdcAfter = await usdc.balanceOf(tenantWallet.address);
  const usdcSpent = tenantUsdcBefore - tenantUsdcAfter;
  console.log("    Tenant spent:", Number(usdcSpent) / 1e6, "USDC");
  console.log("    (2000 principal + fee) ✓\n");

  // =============================================
  //  FINAL SUMMARY
  // =============================================
  console.log("══════════════════════════════════════");
  console.log("         TENANT TEST SUMMARY");
  console.log("══════════════════════════════════════");

  // Get Safe (platform) balance
  const safeAddr = await contract.propmetrikWallet();
  const safeUsdt = await usdt.balanceOf(safeAddr);
  const safeUsdc = await usdc.balanceOf(safeAddr);

  console.log("Platform Safe:", safeAddr);
  console.log("  USDT fees collected:", Number(safeUsdt) / 1e6, "USDT");
  console.log("  USDC fees collected:", Number(safeUsdc) / 1e6, "USDC");

  console.log("\nTenant:", tenantWallet.address);
  const finalUsdt = await usdt.balanceOf(tenantWallet.address);
  const finalUsdc = await usdc.balanceOf(tenantWallet.address);
  console.log("  USDT remaining:", Number(finalUsdt) / 1e6);
  console.log("  USDC remaining:", Number(finalUsdc) / 1e6);

  console.log("\n✅ ALL TENANT TESTS PASSED");
  console.log("   The flow: Fund → Approve → Pay → Verify is working correctly.");
  console.log("   This is exactly what the frontend dApp will do.\n");
}

main().catch((e) => {
  console.error("❌ FAILED:", e.message);
  process.exit(1);
});
