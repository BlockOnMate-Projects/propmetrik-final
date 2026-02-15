/**
 * Mint test tokens to Coinbase wallet for manual tenant testing.
 * Usage: npx hardhat run scripts/mint-to-tenant.ts --network amoy
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TENANT_WALLET = "0x98c84394193267c0bd39F920980BEc0aCC2c313f";

const MOCK_ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
];

async function main() {
  const depPath = path.join(__dirname, "..", "deployments", "amoy-deployment.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf-8"));
  const [deployer] = await ethers.getSigners();

  console.log(`Minting tokens to Coinbase wallet: ${TENANT_WALLET}\n`);

  const mints = [
    { symbol: "USDT", amount: "10000", decimals: 6 },
    { symbol: "USDC", amount: "10000", decimals: 6 },
    { symbol: "WETH", amount: "5",     decimals: 18 },
    { symbol: "WBTC", amount: "1",     decimals: 8 },
  ];

  for (const m of mints) {
    const tokenInfo = dep.tokens.find((t: any) => t.symbol === m.symbol);
    const token = new ethers.Contract(tokenInfo.address, MOCK_ERC20_ABI, deployer);
    const amount = ethers.parseUnits(m.amount, m.decimals);
    const tx = await token.mint(TENANT_WALLET, amount);
    await tx.wait();
    const bal = await token.balanceOf(TENANT_WALLET);
    console.log(`  ✅ ${m.symbol}: minted ${m.amount} → balance: ${ethers.formatUnits(bal, m.decimals)}`);
  }

  // Send some POL for gas
  console.log("\nSending 0.5 POL for gas...");
  const gasTx = await deployer.sendTransaction({
    to: TENANT_WALLET,
    value: ethers.parseEther("0.5"),
  });
  await gasTx.wait();
  const polBal = await ethers.provider.getBalance(TENANT_WALLET);
  console.log(`  ✅ POL balance: ${ethers.formatEther(polBal)}`);

  const entityId = ethers.keccak256(ethers.toUtf8Bytes("manual-test-landlord-001"));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  TENANT TEST — Coinbase Wallet");
  console.log("═══════════════════════════════════════════════════");
  console.log("");
  console.log("Step 1 — Approve USDT:");
  console.log(`  https://amoy.polygonscan.com/address/${dep.tokens.find((t:any)=>t.symbol==="USDT").address}#writeContract`);
  console.log(`  approve(spender: ${dep.contract}, amount: max uint256)`);
  console.log("");
  console.log("Step 2 — Process RENT Payment:");
  console.log(`  https://amoy.polygonscan.com/address/${dep.contract}#writeContract`);
  console.log(`  processPayment(`);
  console.log(`    token:              ${dep.tokens.find((t:any)=>t.symbol==="USDT").address}`);
  console.log(`    paymentType:        0`);
  console.log(`    recipientEntityId:  ${entityId}`);
  console.log(`    principalAmount:    500000000`);
  console.log(`    paymentReference:   ${ethers.keccak256(ethers.toUtf8Bytes("coinbase-rent-test-001"))}`);
  console.log(`    metadata:           0x`);
  console.log(`  )`);
  console.log("");
  console.log("Expected result:");
  console.log(`  • You lose 505 USDT (500 + 5 fee)`);
  console.log(`  • Landlord (0xf28a...8A47) gets 500 USDT`);
  console.log(`  • Platform Safe gets 5 USDT fee`);
  console.log("═══════════════════════════════════════════════════");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
