import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Verify contract on Polygonscan/Amoyscan.
 * Constructor args: (propmetrikWallet, initialOwner) — 2 arguments, no token address.
 */
async function main() {
  const deployFile = path.join(__dirname, "..", "deployments", `${network.name}-deployment.json`);
  if (!fs.existsSync(deployFile)) {
    console.error(`No deployment file: ${deployFile}`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf8"));
  console.log("═══════════════════════════════════════════════════");
  console.log("  PROPMETRIK — Contract Verification               ");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Contract: ${deployment.contract}`);
  console.log(`Network:  ${deployment.network}`);

  try {
    await run("verify:verify", {
      address: deployment.contract,
      constructorArguments: [
        deployment.propmetrikWallet,
        deployment.initialOwner || deployment.deployer,
      ],
    });
    console.log("\n✅ Contract verified on explorer");
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("\n✅ Contract already verified");
    } else {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
