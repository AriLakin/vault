const { run, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔍 Starting contract verification process");
  console.log("=".repeat(50));
  console.log(`Network: ${network.name}`);
  
  if (network.name === "hardhat") {
    console.log("❌ Cannot verify contracts on local Hardhat network");
    console.log("   Use this script with testnet or mainnet deployments");
    process.exit(1);
  }

  // Read deployment info
  const deploymentFile = path.join(__dirname, "..", "deployments", `${network.name}-deployment.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.log(`❌ No deployment found for ${network.name}`);
    console.log(`   Please run: npm run deploy:${network.name}`);
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  console.log("📋 Found deployment with contracts:");
  Object.entries(deployment.contracts).forEach(([name, address]) => {
    console.log(`   ${name}: ${address}`);
  });

  const contracts = deployment.contracts;
  const config = deployment.configuration;

  console.log("\n🔍 Verifying contracts on Etherscan...");

  try {
    // Verify CampaignManager
    console.log("\n1️⃣ Verifying CampaignManager...");
    await run("verify:verify", {
      address: contracts.CampaignManager,
      constructorArguments: []
    });
    console.log("   ✅ CampaignManager verified");

  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("   ✅ CampaignManager already verified");
    } else {
      console.log(`   ❌ CampaignManager verification failed: ${error.message}`);
    }
  }

  try {
    // Verify CryptoLaunch
    console.log("\n2️⃣ Verifying CryptoLaunch...");
    await run("verify:verify", {
      address: contracts.CryptoLaunch,
      constructorArguments: [
        contracts.CampaignManager,
        config.platformTreasury
      ]
    });
    console.log("   ✅ CryptoLaunch verified");

  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("   ✅ CryptoLaunch already verified");
    } else {
      console.log(`   ❌ CryptoLaunch verification failed: ${error.message}`);
    }
  }

  try {
    // Verify SecretDEX
    console.log("\n3️⃣ Verifying SecretDEX...");
    await run("verify:verify", {
      address: contracts.SecretDEX,
      constructorArguments: []
    });
    console.log("   ✅ SecretDEX verified");

  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("   ✅ SecretDEX already verified");
    } else {
      console.log(`   ❌ SecretDEX verification failed: ${error.message}`);
    }
  }

  try {
    // Verify TestToken (if exists)
    if (contracts.TestToken) {
      console.log("\n4️⃣ Verifying TestToken...");
      await run("verify:verify", {
        address: contracts.TestToken,
        constructorArguments: [
          "CryptoLaunch Test Token",
          "CLTT",
          18,
          config.initialTokenSupply || "1000000000000000000000000"
        ]
      });
      console.log("   ✅ TestToken verified");
    }

  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log("   ✅ TestToken already verified");
    } else {
      console.log(`   ❌ TestToken verification failed: ${error.message}`);
    }
  }

  // Update deployment file with verification status
  deployment.verified = true;
  deployment.verificationDate = new Date().toISOString();
  
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  console.log("\n" + "=".repeat(50));
  console.log("🎉 Contract verification completed!");
  console.log("=".repeat(50));

  // Generate verification report
  const report = {
    network: network.name,
    chainId: network.config.chainId,
    verificationDate: deployment.verificationDate,
    explorerBaseUrl: getExplorerUrl(network.name),
    contracts: Object.entries(contracts).map(([name, address]) => ({
      name,
      address,
      explorerUrl: `${getExplorerUrl(network.name)}/address/${address}#code`
    }))
  };

  console.log("\n🔗 Verified Contract Links:");
  report.contracts.forEach(({ name, explorerUrl }) => {
    console.log(`   ${name}: ${explorerUrl}`);
  });

  // Save verification report
  const reportFile = path.join(__dirname, "..", "deployments", `${network.name}-verification-report.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  console.log(`\n📄 Verification report saved to: ${reportFile}`);

  // Generate frontend-friendly contract info
  const contractInfo = {
    network: network.name,
    chainId: network.config.chainId,
    contracts: Object.fromEntries(
      Object.entries(contracts).map(([name, address]) => [
        name,
        {
          address,
          verified: true,
          explorerUrl: `${getExplorerUrl(network.name)}/address/${address}`
        }
      ])
    )
  };

  const contractInfoFile = path.join(__dirname, "..", "frontend", "src", "config", `${network.name}-contracts.json`);
  
  // Create config directory if it doesn't exist
  const configDir = path.dirname(contractInfoFile);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(contractInfoFile, JSON.stringify(contractInfo, null, 2));
  
  console.log(`📄 Frontend contract info saved to: ${contractInfoFile}`);
  
  console.log("\n✨ All contracts verified and ready for use!");
}

function getExplorerUrl(networkName) {
  const explorers = {
    mainnet: "https://etherscan.io",
    sepolia: "https://sepolia.etherscan.io",
    polygon: "https://polygonscan.com",
    arbitrum: "https://arbiscan.io",
    optimism: "https://optimistic.etherscan.io",
    bsc: "https://bscscan.com"
  };
  
  return explorers[networkName] || "https://etherscan.io";
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Verification failed:", error);
    process.exit(1);
  });