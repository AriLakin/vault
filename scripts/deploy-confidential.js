import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🚀 Starting CryptoLaunch Confidential Platform Deployment");
  console.log("=".repeat(60));
  
  const [deployer] = await ethers.getSigners();
  console.log("📋 Deployment Details:");
  console.log(`   Network: ${network.name}`);
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH`);
  console.log("");

  const deployedContracts = {};
  const gasUsed = [];

  // Deploy CampaignManager
  console.log("📦 Deploying CampaignManager...");
  const CampaignManager = await ethers.getContractFactory("CampaignManager");
  const campaignManager = await CampaignManager.deploy();
  await campaignManager.waitForDeployment();
  const campaignManagerAddress = await campaignManager.getAddress();
  
  console.log(`   ✅ CampaignManager deployed to: ${campaignManagerAddress}`);
  deployedContracts.CampaignManager = campaignManagerAddress;
  
  const deployTx1 = await campaignManager.deploymentTransaction();
  if (deployTx1) {
    const receipt1 = await deployTx1.wait();
    gasUsed.push({ contract: "CampaignManager", gas: receipt1.gasUsed.toString() });
    console.log(`   ⛽ Gas used: ${receipt1.gasUsed.toString()}`);
  }

  // Deploy CryptoLaunch
  console.log("\n📦 Deploying CryptoLaunch...");
  const platformTreasury = deployer.address; // Use deployer as treasury for now
  
  const CryptoLaunch = await ethers.getContractFactory("CryptoLaunch");
  const cryptoLaunch = await CryptoLaunch.deploy(
    campaignManagerAddress,
    platformTreasury
  );
  await cryptoLaunch.waitForDeployment();
  const cryptoLaunchAddress = await cryptoLaunch.getAddress();
  
  console.log(`   ✅ CryptoLaunch deployed to: ${cryptoLaunchAddress}`);
  deployedContracts.CryptoLaunch = cryptoLaunchAddress;
  
  const deployTx2 = await cryptoLaunch.deploymentTransaction();
  if (deployTx2) {
    const receipt2 = await deployTx2.wait();
    gasUsed.push({ contract: "CryptoLaunch", gas: receipt2.gasUsed.toString() });
    console.log(`   ⛽ Gas used: ${receipt2.gasUsed.toString()}`);
  }

  // Deploy SecretDEX
  console.log("\n📦 Deploying SecretDEX...");
  const SecretDEX = await ethers.getContractFactory("SecretDEX");
  const secretDEX = await SecretDEX.deploy();
  await secretDEX.waitForDeployment();
  const secretDEXAddress = await secretDEX.getAddress();
  
  console.log(`   ✅ SecretDEX deployed to: ${secretDEXAddress}`);
  deployedContracts.SecretDEX = secretDEXAddress;
  
  const deployTx3 = await secretDEX.deploymentTransaction();
  if (deployTx3) {
    const receipt3 = await deployTx3.wait();
    gasUsed.push({ contract: "SecretDEX", gas: receipt3.gasUsed.toString() });
    console.log(`   ⛽ Gas used: ${receipt3.gasUsed.toString()}`);
  }

  // Deploy TestToken
  console.log("\n📦 Deploying TestToken...");
  const TestToken = await ethers.getContractFactory("TestToken");
  const initialSupply = ethers.parseEther("1000000"); // 1M tokens
  
  const testToken = await TestToken.deploy(
    "CryptoLaunch Test Token",
    "CLTT",
    18,
    initialSupply
  );
  await testToken.waitForDeployment();
  const testTokenAddress = await testToken.getAddress();
  
  console.log(`   ✅ TestToken deployed to: ${testTokenAddress}`);
  deployedContracts.TestToken = testTokenAddress;
  
  const deployTx4 = await testToken.deploymentTransaction();
  if (deployTx4) {
    const receipt4 = await deployTx4.wait();
    gasUsed.push({ contract: "TestToken", gas: receipt4.gasUsed.toString() });
    console.log(`   ⛽ Gas used: ${receipt4.gasUsed.toString()}`);
  }

  // Setup initial configuration
  console.log("\n⚙️  Configuring contracts...");
  
  // Grant roles to CryptoLaunch contract
  const VERIFIER_ROLE = await campaignManager.VERIFIER_ROLE();
  await campaignManager.grantRole(VERIFIER_ROLE, cryptoLaunchAddress);
  console.log(`   ✅ Granted VERIFIER_ROLE to CryptoLaunch`);
  
  // Create initial liquidity pool on DEX
  const wethAddress = network.name === "hardhat" ? testTokenAddress : "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  await secretDEX.createLiquidityPool(testTokenAddress, wethAddress, 30); // 0.3% fee
  console.log(`   ✅ Created initial liquidity pool`);

  // Save deployment information
  const deploymentInfo = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    blockNumber: await deployer.provider.getBlockNumber(),
    contracts: deployedContracts,
    gasUsage: gasUsed,
    configuration: {
      platformTreasury,
      platformFeePercentage: 300,
      initialTokenSupply: initialSupply.toString()
    }
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  // Save deployment info to file
  const deploymentFile = path.join(deploymentsDir, `${network.name}-deployment.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`\n📄 Deployment information saved to: ${deploymentFile}`);

  // Generate frontend environment variables
  const envVars = `
# CryptoLaunch Contract Addresses for ${network.name}
REACT_APP_CRYPTOLAUNCH_${network.name.toUpperCase()}=${cryptoLaunchAddress}
REACT_APP_CAMPAIGN_MANAGER_${network.name.toUpperCase()}=${campaignManagerAddress}
REACT_APP_SECRET_DEX_${network.name.toUpperCase()}=${secretDEXAddress}
REACT_APP_TEST_TOKEN_${network.name.toUpperCase()}=${testTokenAddress}

# Network Configuration
REACT_APP_NETWORK_NAME=${network.name}
REACT_APP_CHAIN_ID=${network.config.chainId}
`;

  const envFile = path.join(__dirname, "..", "frontend", ".env.contracts");
  fs.writeFileSync(envFile, envVars.trim());
  
  console.log(`📄 Frontend environment variables saved to: ${envFile}`);

  // Display summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Deployment Summary");
  console.log("=".repeat(60));
  
  Object.entries(deployedContracts).forEach(([name, address]) => {
    console.log(`📋 ${name.padEnd(20)} ${address}`);
  });
  
  console.log("\n⛽ Gas Usage Summary:");
  gasUsed.forEach(({ contract, gas }) => {
    console.log(`   ${contract.padEnd(20)} ${parseInt(gas).toLocaleString()} gas`);
  });
  
  const totalGas = gasUsed.reduce((total, { gas }) => total + parseInt(gas), 0);
  console.log(`   ${"Total".padEnd(20)} ${totalGas.toLocaleString()} gas`);

  if (network.name !== "hardhat") {
    console.log("\n🔗 Verification Commands:");
    console.log("Run these commands to verify contracts on Etherscan:");
    console.log(`npx hardhat verify --network ${network.name} ${campaignManagerAddress}`);
    console.log(`npx hardhat verify --network ${network.name} ${cryptoLaunchAddress} "${campaignManagerAddress}" "${platformTreasury}"`);
    console.log(`npx hardhat verify --network ${network.name} ${secretDEXAddress}`);
    console.log(`npx hardhat verify --network ${network.name} ${testTokenAddress} "CryptoLaunch Test Token" "CLTT" 18 "${initialSupply}"`);
  }

  console.log("\n🌐 Frontend URLs:");
  console.log(`   Development: http://localhost:3000`);
  console.log(`   Production:  https://cryptolaunch.app`);
  
  console.log("\n🚀 Deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });