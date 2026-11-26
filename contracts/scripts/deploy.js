// Usage: SEPOLIA_RPC_URL=... DEPLOYER_PRIVATE_KEY=... [ANCHORER_ADDRESS=0x...] npx hardhat run scripts/deploy.js --network sepolia
// The deployer becomes the contract OWNER (keep that key offline / use a multisig).
// ANCHORER_ADDRESS is the address of the hot wallet whose private key you put in the Supabase secret ANCHOR_PRIVATE_KEY.
// If you leave it out, the deployer is also the anchorer (fine for a first test, not for anything you rely on).
const { ethers, network } = require("hardhat");
async function main() {
  if (network.name !== "sepolia") throw new Error(`Run with --network sepolia (current: ${network.name}). Set SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY first.`);
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address, "balance:", ethers.formatEther(balance), "SepoliaETH");
  if (balance === 0n) throw new Error("Deployer has 0 SepoliaETH. Get some from a Sepolia faucet first.");
  const anchorer = process.env.ANCHORER_ADDRESS || deployer.address;
  const c = await (await ethers.getContractFactory("FinovaAnchor")).deploy(anchorer);
  await c.waitForDeployment();
  console.log("FinovaAnchor deployed to:", await c.getAddress());
  console.log("Owner:", deployer.address, "| Anchorer:", anchorer);
  console.log("Next: set Supabase secret ANCHOR_CONTRACT to the address above, and fund the anchorer wallet with SepoliaETH.");
}
main().catch(e => { console.error(e); process.exit(1); });
