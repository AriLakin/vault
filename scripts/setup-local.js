const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🛠️  Setting up local development environment");
  console.log("=".repeat(50));

  const [deployer, user1, user2, user3] = await ethers.getSigners();
  
  // Read deployment info
  const deploymentFile = path.join(__dirname, "..", "deployments", "hardhat-deployment.json");
  
  if (!fs.existsSync(deploymentFile)) {
    console.log("❌ No deployment found. Please run: npm run deploy:local");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  console.log("📋 Using deployed contracts:");
  Object.entries(deployment.contracts).forEach(([name, address]) => {
    console.log(`   ${name}: ${address}`);
  });

  // Get contract instances
  const cryptoLaunch = await ethers.getContractAt("CryptoLaunch", deployment.contracts.CryptoLaunch);
  const campaignManager = await ethers.getContractAt("CampaignManager", deployment.contracts.CampaignManager);
  const secretDEX = await ethers.getContractAt("SecretDEX", deployment.contracts.SecretDEX);
  const testToken = await ethers.getContractAt("TestToken", deployment.contracts.TestToken);

  console.log("\n🎯 Creating sample campaigns...");

  // Create sample campaigns
  const campaigns = [
    {
      name: "DeFi Privacy Protocol",
      description: "Revolutionary privacy-focused DeFi protocol using advanced cryptography",
      fundingGoal: ethers.parseEther("1000"), // 1000 ETH
      tokenPrice: ethers.parseEther("0.01"), // 0.01 ETH per token
      duration: 30 * 24 * 60 * 60, // 30 days
      minContribution: ethers.parseEther("0.1"),
      maxContribution: ethers.parseEther("50"),
    },
    {
      name: "Quantum-Safe Blockchain",
      description: "Next-generation blockchain resistant to quantum computing attacks",
      fundingGoal: ethers.parseEther("2000"),
      tokenPrice: ethers.parseEther("0.005"),
      duration: 45 * 24 * 60 * 60, // 45 days
      minContribution: ethers.parseEther("0.05"),
      maxContribution: ethers.parseEther("100"),
    },
    {
      name: "Sustainable NFT Marketplace",
      description: "Carbon-negative NFT marketplace powered by renewable energy",
      fundingGoal: ethers.parseEther("500"),
      tokenPrice: ethers.parseEther("0.02"),
      duration: 21 * 24 * 60 * 60, // 21 days
      minContribution: ethers.parseEther("0.01"),
      maxContribution: ethers.parseEther("25"),
    }
  ];

  // Mint tokens to deployer for campaign creation
  console.log("💰 Preparing tokens for campaigns...");
  const totalTokensNeeded = ethers.parseEther("500000"); // 500K tokens per campaign
  
  for (let i = 0; i < campaigns.length; i++) {
    await testToken.mint(deployer.address, totalTokensNeeded);
    await testToken.approve(await cryptoLaunch.getAddress(), totalTokensNeeded);
    
    const campaign = campaigns[i];
    const tx = await cryptoLaunch.launchCampaign(
      await testToken.getAddress(),
      totalTokensNeeded,
      campaign.fundingGoal,
      campaign.tokenPrice,
      campaign.duration,
      campaign.minContribution,
      campaign.maxContribution,
      `ipfs://campaign${i + 1}metadata`
    );
    
    const receipt = await tx.wait();
    const campaignId = receipt.logs[0].args[0];
    
    console.log(`   ✅ Campaign ${i + 1} created with ID: ${campaignId}`);
    
    // Register campaign with metadata
    await campaignManager.registerCampaign(
      campaign.name,
      campaign.description,
      `https://campaign${i + 1}.example.com`,
      `https://whitepaper${i + 1}.example.com`,
      [`https://twitter.com/campaign${i + 1}`, `https://discord.gg/campaign${i + 1}`],
      ethers.keccak256(ethers.toUtf8Bytes(`logo${i + 1}`))
    );
  }

  console.log("\n💸 Creating sample investments...");
  
  // Create sample confidential investments
  const investors = [user1, user2, user3];
  const investmentAmounts = [
    ethers.parseEther("5"),
    ethers.parseEther("10"),
    ethers.parseEther("2")
  ];

  for (let campaignId = 1; campaignId <= 3; campaignId++) {
    for (let i = 0; i < investors.length; i++) {
      const investor = investors[i];
      const amount = investmentAmounts[i];
      
      // Create mock encrypted amount and proof
      const nonce = Math.floor(Math.random() * 1000000);
      const encryptedAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [amount, nonce])
      );
      const proof = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [amount, nonce, investor.address]
      );
      
      await cryptoLaunch.connect(investor).makeConfidentialBacking(
        campaignId,
        encryptedAmount,
        proof,
        nonce,
        { value: amount }
      );
      
      console.log(`   ✅ Investment of ${ethers.formatEther(amount)} ETH in campaign ${campaignId}`);
    }
  }

  console.log("\n🔄 Setting up DEX with sample data...");
  
  // Create additional test tokens for DEX
  const TestToken2 = await ethers.getContractFactory("TestToken");
  const testToken2 = await TestToken2.deploy("Second Test Token", "STT", 18, ethers.parseEther("1000000"));
  await testToken2.waitForDeployment();
  
  console.log(`   ✅ Second test token deployed: ${await testToken2.getAddress()}`);
  
  // Create liquidity pool
  await secretDEX.createLiquidityPool(
    await testToken.getAddress(),
    await testToken2.getAddress(),
    30 // 0.3% fee
  );
  
  console.log("   ✅ Liquidity pool created for test tokens");
  
  // Add sample liquidity (mock encrypted amounts)
  const liquidityAmount1 = ethers.parseEther("1000");
  const liquidityAmount2 = ethers.parseEther("2000");
  const liquidityNonce = 12345;
  
  const encryptedLiquidity1 = ethers.keccak256(
    ethers.solidityPacked(["uint256", "uint256"], [liquidityAmount1, liquidityNonce])
  );
  const encryptedLiquidity2 = ethers.keccak256(
    ethers.solidityPacked(["uint256", "uint256"], [liquidityAmount2, liquidityNonce])
  );
  const liquidityProof = ethers.solidityPacked(
    ["uint256", "uint256", "uint256"],
    [liquidityAmount1, liquidityAmount2, liquidityNonce]
  );
  
  await secretDEX.addConfidentialLiquidity(
    1, // poolId
    encryptedLiquidity1,
    encryptedLiquidity2,
    liquidityProof
  );
  
  console.log("   ✅ Sample liquidity added to pool");
  
  // Create sample orders
  const orderAmount = ethers.parseEther("100");
  const orderPrice = ethers.parseEther("0.5");
  const orderNonce = 54321;
  
  const encryptedOrderAmount = ethers.keccak256(
    ethers.solidityPacked(["uint256", "uint256"], [orderAmount, orderNonce])
  );
  const encryptedOrderPrice = ethers.keccak256(
    ethers.solidityPacked(["uint256", "uint256"], [orderPrice, orderNonce])
  );
  const orderProof = ethers.solidityPacked(
    ["uint256", "uint256", "uint256"],
    [orderAmount, orderPrice, orderNonce]
  );
  
  await secretDEX.connect(user1).createConfidentialOrder(
    await testToken.getAddress(),
    await testToken2.getAddress(),
    encryptedOrderAmount,
    encryptedOrderAmount,
    encryptedOrderPrice,
    0, // BUY order
    orderProof
  );
  
  console.log("   ✅ Sample confidential order created");

  console.log("\n🔧 Configuring permissions...");
  
  // Grant additional roles for testing
  const VERIFIER_ROLE = await campaignManager.VERIFIER_ROLE();
  await campaignManager.grantRole(VERIFIER_ROLE, user1.address);
  console.log("   ✅ Granted VERIFIER_ROLE to user1 for testing");
  
  // Verify some campaigns
  for (let campaignId = 1; campaignId <= 2; campaignId++) {
    await campaignManager.connect(user1).verifyCampaign(
      campaignId,
      true, // KYC completed
      true, // Audit completed
      true, // Legal completed
      "Verified for testing purposes"
    );
    console.log(`   ✅ Campaign ${campaignId} verified`);
  }

  // Update deployment info with additional contracts
  deployment.contracts.TestToken2 = await testToken2.getAddress();
  deployment.setup = {
    sampleCampaigns: 3,
    sampleInvestments: 9,
    liquidityPools: 1,
    sampleOrders: 1,
    verifiedCampaigns: 2
  };
  deployment.testAccounts = {
    deployer: deployer.address,
    user1: user1.address,
    user2: user2.address,
    user3: user3.address
  };

  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  console.log("\n" + "=".repeat(50));
  console.log("🎉 Local environment setup completed!");
  console.log("=".repeat(50));
  
  console.log("\n📋 Test Data Summary:");
  console.log(`   Sample Campaigns: ${deployment.setup.sampleCampaigns}`);
  console.log(`   Sample Investments: ${deployment.setup.sampleInvestments}`);
  console.log(`   Liquidity Pools: ${deployment.setup.liquidityPools}`);
  console.log(`   Sample Orders: ${deployment.setup.sampleOrders}`);
  console.log(`   Verified Campaigns: ${deployment.setup.verifiedCampaigns}`);
  
  console.log("\n👤 Test Accounts:");
  console.log(`   Deployer: ${deployer.address} (Admin)`);
  console.log(`   User1: ${user1.address} (Verifier & Investor)`);
  console.log(`   User2: ${user2.address} (Investor)`);
  console.log(`   User3: ${user3.address} (Investor)`);
  
  console.log("\n🌐 Ready to use!");
  console.log("   Frontend: npm run frontend");
  console.log("   Network: http://localhost:8545");
  console.log("   Chain ID: 31337");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });