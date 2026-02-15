import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Post-deployment verification: confirm token allowlist, fee configs, recipients.
 */
async function main() {
  const deployFile = path.join(__dirname, "..", "deployments", `${network.name}-deployment.json`);
  if (!fs.existsSync(deployFile)) {
    console.error(`No deployment file: ${deployFile}`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf8"));
  console.log("═══════════════════════════════════════════════════");
  console.log("  PROPMETRIK Initialize — Post-Deploy Check       ");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Contract: ${deployment.contract}`);
  console.log(`Network:  ${deployment.network} (${deployment.chainId})`);

  const payments = await ethers.getContractAt("PROPMETRIKPayments", deployment.contract);

  // Check owner
  const owner = await payments.owner();
  console.log(`\nOwner: ${owner}`);

  // Check platform wallet
  const pm = await payments.propmetrikWallet();
  console.log(`PROPMETRIK Wallet: ${pm}`);

  // Check tokens
  console.log("\n🪙  Token Allowlist:");
  const tokenCount = await payments.getTokenCount();
  for (let i = 0; i < Number(tokenCount); i++) {
    const addr = await payments.tokenList(i);
    const [enabled, symbol, decimals] = await payments.isTokenAccepted(addr);
    console.log(`  ${i + 1}. ${symbol.padEnd(8)} ${addr}  ${decimals} decimals  ${enabled ? "✓ enabled" : "✗ disabled"}`);
  }

  // Check fee configs
  console.log("\n💰 Fee Configs:");
  const types = ["RENT", "DEAL", "PROJECT"];
  for (let i = 0; i < 3; i++) {
    const cfg = await payments.feeConfigs(i);
    const pct = Number(cfg.percentageBasisPoints) / 100;
    const min = Number(cfg.minimumFeeUSD6) / 1_000000;
    console.log(`  ${types[i].padEnd(10)} ${pct}%  min $${min.toFixed(2)}  ${cfg.enabled ? "✓" : "✗"}`);
  }

  console.log("\n✅ Initialization check complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
