import { ethers } from "hardhat";
async function main() {
  const contract = await ethers.getContractAt("PROPMETRIKPayments", "0x969EC852C54fB82522284e35704471C5EB869cEf");
  const owner = await contract.owner();
  console.log("Owner:", owner);
  console.log("Is Safe?", owner.toLowerCase() === "0xefd259abf3af26aa22a0fb4e189059c13e3a0c1c");
}
main();
