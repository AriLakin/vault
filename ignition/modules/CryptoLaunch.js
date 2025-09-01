const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("CryptoLaunchModule", (m) => {
  // Parameters for deployment
  const platformTreasury = m.getParameter("platformTreasury", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  const platformFeePercentage = m.getParameter("platformFeePercentage", 300); // 3%
  
  // Deploy CampaignManager first
  const campaignManager = m.contract("CampaignManager");
  
  // Deploy CryptoLaunch with CampaignManager address
  const cryptoLaunch = m.contract("CryptoLaunch", [
    campaignManager,
    platformTreasury
  ]);
  
  // Deploy SecretDEX
  const secretDEX = m.contract("SecretDEX");
  
  // Deploy TestToken for development
  const testToken = m.contract("TestToken", [
    "CryptoLaunch Test Token",
    "CLTT",
    18,
    m.getParameter("initialSupply", "1000000000000000000000000") // 1M tokens
  ]);
  
  // Set up platform fee after deployment
  m.call(cryptoLaunch, "updatePlatformFee", [platformFeePercentage]);
  
  return {
    cryptoLaunch,
    campaignManager,
    secretDEX,
    testToken
  };
});