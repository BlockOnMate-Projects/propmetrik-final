import * as dotenv from "dotenv";
dotenv.config();
import { loadCryptoConfig } from "../shared-services/payments/crypto/types";
import { ethers } from "ethers";
import contractAbi from "../shared-services/payments/crypto/abi/PROPMETRIKPayments.json";

async function main() {
  const config = loadCryptoConfig();
  if (!config) { console.log("Config not loaded!"); return; }
  console.log("Config loaded:");
  console.log("  RPC:", config.rpcUrl.substring(0, 50) + "...");
  console.log("  Contract:", config.contractAddress);
  console.log("  Chain:", config.chainId);

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, { chainId: config.chainId, name: "polygon" });
  const contract = new ethers.Contract(config.contractAddress, contractAbi, provider);

  const owner = await contract.owner();
  console.log("\nOn-chain reads:");
  console.log("  Owner:", owner);
  const wallet = await contract.propmetrikWallet();
  console.log("  Platform wallet:", wallet);

  console.log("\n  Backend successfully connected to Polygon mainnet contract!");
}
main().catch(e => { console.error("Error:", e.message); process.exit(1); });
