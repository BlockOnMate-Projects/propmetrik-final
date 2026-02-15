import { ethers } from "hardhat";

async function main() {
  const deployer = "0x651A05813aF8E70BC9c57Ddc7093aDa014170Ce9";
  const bal = await ethers.provider.getBalance(deployer);
  console.log("Deployer POL balance:", ethers.formatEther(bal));
  const fp = await ethers.provider.getFeeData();
  console.log("Gas price:", Number(fp.gasPrice!) / 1e9, "gwei");
  console.log("Max fee:", fp.maxFeePerGas ? Number(fp.maxFeePerGas) / 1e9 + " gwei" : "N/A");

  // Estimate: deploy ~2M gas + 5 addToken ~250K each + addExternalChain ~100K + authorizeRelayer ~50K + transferOwnership ~50K
  // Total ~3.7M gas
  const estimatedGas = 3_700_000n;
  const totalCost = estimatedGas * (fp.gasPrice || 30000000000n);
  console.log("Estimated deploy cost:", ethers.formatEther(totalCost), "POL");
  console.log("Margin:", Number(bal) / Number(totalCost), "x");
}
main();
