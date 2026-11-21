const { ethers } = require("hardhat");
async function main() { const c = await (await ethers.getContractFactory("FinovaAnchor")).deploy(); await c.waitForDeployment(); console.log("FinovaAnchor deployed to:", await c.getAddress()); }
main().catch(e => { console.error(e); process.exit(1); });
