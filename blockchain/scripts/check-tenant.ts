import { ethers } from "hardhat";

async function main() {
  const USDT = "0x04BdA11dCB7d803c5bc46CBCdBb336D3e38f22dC";
  const CONTRACT = "0x469c39649fdd3c74B99A9c6E53EF62e0DDC72C06";
  const TENANT = "0x98c84394193267c0bd39F920980BEc0aCC2c313f";
  const LANDLORD = "0xf28ad8386Af38bAC1D12A37fbCd9Df41b6d48A47";
  const ENTITY_ID = "0xb6dfb1117df78b02ea718f85bffd55d7864e1289cd70432240c574c266919538";
  const payRef = "0x05e8aac4b4ab35d6a0cbd3057819fbda22bc6cf446c5731c2a8af2689a5e1cea";

  const usdt = await ethers.getContractAt("MockERC20", USDT);
  const contract = await ethers.getContractAt("PROPMETRIKPayments", CONTRACT);

  // 1. Allowance
  const allowance = await usdt.allowance(TENANT, CONTRACT);
  console.log("1. USDT allowance:", allowance.toString());

  // 2. Balance
  const balance = await usdt.balanceOf(TENANT);
  console.log("2. USDT balance:", balance.toString());

  // 3. POL for gas
  const polBal = await ethers.provider.getBalance(TENANT);
  console.log("3. POL balance:", ethers.formatEther(polBal));

  // 4. Check if payment ref already used  
  try {
    const payment = await contract.payments(payRef);
    const payer = payment[0];
    const used = payer !== "0x0000000000000000000000000000000000000000";
    console.log("4. Payment ref already used:", used, "payer:", payer);
  } catch (e: any) {
    console.log("4. Payment ref check error:", e.message?.substring(0, 200));
  }

  // 5. Check recipient is registered
  try {
    const profile = await contract.getRecipientProfile(LANDLORD);
    console.log("5. Recipient active:", profile[1], "entityId:", profile[0]);
  } catch (e: any) {
    console.log("5. Recipient profile error:", e.message?.substring(0, 200));
  }

  // 6. Fee calculation
  try {
    const fee = await contract.calculateFee(USDT, 500000000n);
    console.log("6. Fee for 500 USDT:", fee.toString(), "(", Number(fee) / 1e6, "USDT )");
  } catch (e: any) {
    console.log("6. calculateFee error:", e.message?.substring(0, 300));
  }

  // 7. Token supported
  try {
    const tokenInfo = await contract.supportedTokens(USDT);
    console.log("7. Token active:", tokenInfo[0], "decimals:", tokenInfo[1].toString());
  } catch (e: any) {
    console.log("7. Token info error:", e.message?.substring(0, 200));
  }

  // Summary
  console.log("\n--- DIAGNOSIS ---");
  if (allowance === 0n) {
    console.log("PROBLEM: Tenant has NOT approved USDT. Must call approve() on USDT contract first.");
  } else if (allowance < 505000000n) {
    console.log("PROBLEM: Allowance too low:", allowance.toString(), "need at least 505000000");
  }
  if (balance < 505000000n) {
    console.log("PROBLEM: Insufficient USDT balance:", balance.toString(), "need at least 505000000");
  }
  if (polBal === 0n) {
    console.log("PROBLEM: No POL for gas");
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message?.substring(0, 500));
  process.exit(1);
});
