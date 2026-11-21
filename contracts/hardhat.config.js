require("@nomicfoundation/hardhat-toolbox");
// Export SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY in your shell. Never commit them.
const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY } = process.env;
module.exports = { solidity: "0.8.24",
  networks: SEPOLIA_RPC_URL && DEPLOYER_PRIVATE_KEY ? { sepolia: { url: SEPOLIA_RPC_URL, accounts: [DEPLOYER_PRIVATE_KEY] } } : {} };
