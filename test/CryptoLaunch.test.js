const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CryptoLaunch", function () {
  async function deployContractsFixture() {
    const [owner, campaignCreator, investor1, investor2, treasury] = await ethers.getSigners();

    // Deploy CampaignManager
    const CampaignManager = await ethers.getContractFactory("CampaignManager");
    const campaignManager = await CampaignManager.deploy();
    await campaignManager.waitForDeployment();

    // Deploy CryptoLaunch
    const CryptoLaunch = await ethers.getContractFactory("CryptoLaunch");
    const cryptoLaunch = await CryptoLaunch.deploy(
      await campaignManager.getAddress(),
      treasury.address
    );
    await cryptoLaunch.waitForDeployment();

    // Deploy TestToken
    const TestToken = await ethers.getContractFactory("TestToken");
    const testToken = await TestToken.deploy(
      "Test Token",
      "TT",
      18,
      ethers.parseEther("1000000")
    );
    await testToken.waitForDeployment();

    // Grant necessary roles
    const VERIFIER_ROLE = await campaignManager.VERIFIER_ROLE();
    await campaignManager.grantRole(VERIFIER_ROLE, await cryptoLaunch.getAddress());

    return {
      cryptoLaunch,
      campaignManager,
      testToken,
      owner,
      campaignCreator,
      investor1,
      investor2,
      treasury
    };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { cryptoLaunch, campaignManager, treasury } = await loadFixture(deployContractsFixture);

      expect(await cryptoLaunch.campaignManager()).to.equal(await campaignManager.getAddress());
      expect(await cryptoLaunch.platformTreasury()).to.equal(treasury.address);
      expect(await cryptoLaunch.nextCampaignId()).to.equal(1);
      expect(await cryptoLaunch.platformFeePercentage()).to.equal(300); // 3%
    });

    it("Should set correct owner", async function () {
      const { cryptoLaunch, owner } = await loadFixture(deployContractsFixture);
      expect(await cryptoLaunch.owner()).to.equal(owner.address);
    });
  });

  describe("Campaign Management", function () {
    it("Should launch a campaign successfully", async function () {
      const { cryptoLaunch, testToken, campaignCreator } = await loadFixture(deployContractsFixture);

      const tokenSupply = ethers.parseEther("100000");
      const fundingGoal = ethers.parseEther("1000");
      const tokenPrice = ethers.parseEther("0.01");
      const duration = 30 * 24 * 60 * 60; // 30 days
      const minContribution = ethers.parseEther("0.1");
      const maxContribution = ethers.parseEther("10");

      // Transfer tokens to campaign creator
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await expect(
        cryptoLaunch.connect(campaignCreator).launchCampaign(
          await testToken.getAddress(),
          tokenSupply,
          fundingGoal,
          tokenPrice,
          duration,
          minContribution,
          maxContribution,
          "ipfs://test-metadata"
        )
      ).to.emit(cryptoLaunch, "CampaignLaunched")
        .withArgs(1, campaignCreator.address, await testToken.getAddress(), fundingGoal, tokenPrice);

      // Verify campaign details
      const campaign = await cryptoLaunch.campaigns(1);
      expect(campaign.campaignOwner).to.equal(campaignCreator.address);
      expect(campaign.fundingGoal).to.equal(fundingGoal);
      expect(campaign.tokenPriceInWei).to.equal(tokenPrice);
      expect(campaign.isLive).to.equal(true);
    });

    it("Should reject campaign with invalid parameters", async function () {
      const { cryptoLaunch, testToken, campaignCreator } = await loadFixture(deployContractsFixture);

      await expect(
        cryptoLaunch.connect(campaignCreator).launchCampaign(
          ethers.ZeroAddress, // Invalid token address
          ethers.parseEther("100000"),
          ethers.parseEther("1000"),
          ethers.parseEther("0.01"),
          7 * 24 * 60 * 60,
          ethers.parseEther("0.1"),
          ethers.parseEther("10"),
          "ipfs://test-metadata"
        )
      ).to.be.revertedWith("Invalid reward token address");
    });

    it("Should handle campaign cancellation", async function () {
      const { cryptoLaunch, testToken, campaignCreator } = await loadFixture(deployContractsFixture);

      // Launch campaign first
      const tokenSupply = ethers.parseEther("100000");
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await cryptoLaunch.connect(campaignCreator).launchCampaign(
        await testToken.getAddress(),
        tokenSupply,
        ethers.parseEther("1000"),
        ethers.parseEther("0.01"),
        30 * 24 * 60 * 60,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://test-metadata"
      );

      // Cancel campaign
      await expect(
        cryptoLaunch.connect(campaignCreator).cancelCampaign(1)
      ).to.emit(cryptoLaunch, "CampaignPhaseChanged")
        .withArgs(1, 1, 3); // Live to Failed

      const campaign = await cryptoLaunch.campaigns(1);
      expect(campaign.isLive).to.equal(false);
      expect(campaign.currentPhase).to.equal(3); // Failed
    });
  });

  describe("Confidential Backing", function () {
    async function setupCampaignFixture() {
      const fixture = await loadFixture(deployContractsFixture);
      const { cryptoLaunch, testToken, campaignCreator } = fixture;

      const tokenSupply = ethers.parseEther("100000");
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await cryptoLaunch.connect(campaignCreator).launchCampaign(
        await testToken.getAddress(),
        tokenSupply,
        ethers.parseEther("1000"),
        ethers.parseEther("0.01"),
        30 * 24 * 60 * 60,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://test-metadata"
      );

      return fixture;
    }

    it("Should accept confidential backing", async function () {
      const { cryptoLaunch, investor1 } = await loadFixture(setupCampaignFixture);

      const investmentAmount = ethers.parseEther("5");
      const nonce = 12345;
      const encryptedAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [investmentAmount, nonce])
      );
      const proof = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [investmentAmount, nonce, investor1.address]
      );

      await expect(
        cryptoLaunch.connect(investor1).makeConfidentialBacking(
          1,
          encryptedAmount,
          proof,
          nonce,
          { value: investmentAmount }
        )
      ).to.emit(cryptoLaunch, "ConfidentialBackingReceived")
        .withArgs(1, investor1.address, encryptedAmount, await time.latest() + 1);

      // Verify investment was recorded
      const campaign = await cryptoLaunch.campaigns(1);
      expect(campaign.totalBackers).to.equal(1);
    });

    it("Should reject backing below minimum contribution", async function () {
      const { cryptoLaunch, investor1 } = await loadFixture(setupCampaignFixture);

      const investmentAmount = ethers.parseEther("0.05"); // Below 0.1 minimum
      const nonce = 12345;
      const encryptedAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [investmentAmount, nonce])
      );
      const proof = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [investmentAmount, nonce, investor1.address]
      );

      await expect(
        cryptoLaunch.connect(investor1).makeConfidentialBacking(
          1,
          encryptedAmount,
          proof,
          nonce,
          { value: investmentAmount }
        )
      ).to.be.revertedWith("Below minimum contribution");
    });

    it("Should reject backing above maximum contribution", async function () {
      const { cryptoLaunch, investor1 } = await loadFixture(setupCampaignFixture);

      const investmentAmount = ethers.parseEther("15"); // Above 10 maximum
      const nonce = 12345;
      const encryptedAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [investmentAmount, nonce])
      );
      const proof = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [investmentAmount, nonce, investor1.address]
      );

      await expect(
        cryptoLaunch.connect(investor1).makeConfidentialBacking(
          1,
          encryptedAmount,
          proof,
          nonce,
          { value: investmentAmount }
        )
      ).to.be.revertedWith("Exceeds maximum contribution");
    });

    it("Should handle multiple investments from same user", async function () {
      const { cryptoLaunch, investor1 } = await loadFixture(setupCampaignFixture);

      // First investment
      const investment1 = ethers.parseEther("3");
      const nonce1 = 12345;
      const encryptedAmount1 = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [investment1, nonce1])
      );
      const proof1 = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [investment1, nonce1, investor1.address]
      );

      await cryptoLaunch.connect(investor1).makeConfidentialBacking(
        1, encryptedAmount1, proof1, nonce1, { value: investment1 }
      );

      // Second investment
      const investment2 = ethers.parseEther("2");
      const nonce2 = 54321;
      const encryptedAmount2 = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [investment2, nonce2])
      );
      const proof2 = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [investment2, nonce2, investor1.address]
      );

      await cryptoLaunch.connect(investor1).makeConfidentialBacking(
        1, encryptedAmount2, proof2, nonce2, { value: investment2 }
      );

      // Verify total backers count (should still be 1)
      const campaign = await cryptoLaunch.campaigns(1);
      expect(campaign.totalBackers).to.equal(1);

      // Verify backings array has 2 entries
      const backings = await cryptoLaunch.getCampaignBackings(1);
      expect(backings.length).to.equal(2);
    });
  });

  describe("Token Claims and Vesting", function () {
    async function setupSuccessfulCampaignFixture() {
      const fixture = await loadFixture(deployContractsFixture);
      const { cryptoLaunch, testToken, campaignCreator, investor1 } = fixture;

      // Setup campaign
      const tokenSupply = ethers.parseEther("100000");
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await cryptoLaunch.connect(campaignCreator).launchCampaign(
        await testToken.getAddress(),
        tokenSupply,
        ethers.parseEther("100"), // Low goal for easy completion
        ethers.parseEther("0.01"),
        30 * 24 * 60 * 60,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://test-metadata"
      );

      // Make investment
      const investmentAmount = ethers.parseEther("5");
      const nonce = 12345;
      const encryptedAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [investmentAmount, nonce])
      );
      const proof = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [investmentAmount, nonce, investor1.address]
      );

      await cryptoLaunch.connect(investor1).makeConfidentialBacking(
        1, encryptedAmount, proof, nonce, { value: investmentAmount }
      );

      return fixture;
    }

    it("Should finalize successful campaign", async function () {
      const { cryptoLaunch, campaignCreator } = await loadFixture(setupSuccessfulCampaignFixture);

      // Fast forward past campaign end
      await time.increase(31 * 24 * 60 * 60);

      const decryptionKey = ethers.toUtf8Bytes("mock-decryption-key");
      
      await expect(
        cryptoLaunch.connect(campaignCreator).finalizeCampaign(1, decryptionKey)
      ).to.emit(cryptoLaunch, "CampaignFundingCompleted");

      const campaign = await cryptoLaunch.campaigns(1);
      expect(campaign.isLive).to.equal(false);
      expect(campaign.fundingSuccessful).to.equal(true);
    });

    it("Should create vesting schedule for successful campaign", async function () {
      const { cryptoLaunch, campaignCreator, investor1 } = await loadFixture(setupSuccessfulCampaignFixture);

      // Fast forward and finalize
      await time.increase(31 * 24 * 60 * 60);
      const decryptionKey = ethers.toUtf8Bytes("mock-decryption-key");
      await cryptoLaunch.connect(campaignCreator).finalizeCampaign(1, decryptionKey);

      // Check vesting schedule was created
      const vesting = await cryptoLaunch.getVestingInfo(1, investor1.address);
      expect(vesting.isActive).to.equal(true);
      expect(vesting.duration).to.equal(180 * 24 * 60 * 60); // 180 days
      expect(vesting.cliffPeriod).to.equal(30 * 24 * 60 * 60); // 30 days
    });

    it("Should allow token claims after cliff period", async function () {
      const { cryptoLaunch, testToken, campaignCreator, investor1 } = await loadFixture(setupSuccessfulCampaignFixture);

      // Finalize campaign
      await time.increase(31 * 24 * 60 * 60);
      const decryptionKey = ethers.toUtf8Bytes("mock-decryption-key");
      await cryptoLaunch.connect(campaignCreator).finalizeCampaign(1, decryptionKey);

      // Fast forward past cliff period
      await time.increase(35 * 24 * 60 * 60); // 35 days to pass cliff

      const initialBalance = await testToken.balanceOf(investor1.address);
      
      await expect(
        cryptoLaunch.connect(investor1).claimVestedTokens(1)
      ).to.emit(cryptoLaunch, "RewardTokensDistributed");

      const finalBalance = await testToken.balanceOf(investor1.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should prevent token claims before cliff period", async function () {
      const { cryptoLaunch, campaignCreator, investor1 } = await loadFixture(setupSuccessfulCampaignFixture);

      // Finalize campaign
      await time.increase(31 * 24 * 60 * 60);
      const decryptionKey = ethers.toUtf8Bytes("mock-decryption-key");
      await cryptoLaunch.connect(campaignCreator).finalizeCampaign(1, decryptionKey);

      // Try to claim immediately (before cliff)
      await expect(
        cryptoLaunch.connect(investor1).claimVestedTokens(1)
      ).to.be.revertedWith("Cliff period not passed");
    });
  });

  describe("Refunds", function () {
    async function setupFailedCampaignFixture() {
      const fixture = await loadFixture(deployContractsFixture);
      const { cryptoLaunch, testToken, campaignCreator, investor1 } = fixture;

      // Setup campaign with high funding goal
      const tokenSupply = ethers.parseEther("100000");
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await cryptoLaunch.connect(campaignCreator).launchCampaign(
        await testToken.getAddress(),
        tokenSupply,
        ethers.parseEther("10000"), // High goal that won't be reached
        ethers.parseEther("0.01"),
        30 * 24 * 60 * 60,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://test-metadata"
      );

      // Make small investment
      const investmentAmount = ethers.parseEther("5");
      const nonce = 12345;
      const encryptedAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [investmentAmount, nonce])
      );
      const proof = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [investmentAmount, nonce, investor1.address]
      );

      await cryptoLaunch.connect(investor1).makeConfidentialBacking(
        1, encryptedAmount, proof, nonce, { value: investmentAmount }
      );

      return fixture;
    }

    it("Should handle failed campaign refunds", async function () {
      const { cryptoLaunch, campaignCreator, investor1 } = await loadFixture(setupFailedCampaignFixture);

      // Fast forward past campaign end
      await time.increase(31 * 24 * 60 * 60);

      const decryptionKey = ethers.toUtf8Bytes("mock-decryption-key");
      await cryptoLaunch.connect(campaignCreator).finalizeCampaign(1, decryptionKey);

      const campaign = await cryptoLaunch.campaigns(1);
      expect(campaign.fundingSuccessful).to.equal(false);
      expect(campaign.currentPhase).to.equal(3); // Failed

      // Claim refund
      const initialBalance = await ethers.provider.getBalance(investor1.address);
      
      const tx = await cryptoLaunch.connect(investor1).claimRefund(1);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const finalBalance = await ethers.provider.getBalance(investor1.address);
      const refundReceived = finalBalance - initialBalance + gasUsed;
      
      expect(refundReceived).to.be.gt(0);
    });

    it("Should prevent double refund claims", async function () {
      const { cryptoLaunch, campaignCreator, investor1 } = await loadFixture(setupFailedCampaignFixture);

      // Finalize as failed
      await time.increase(31 * 24 * 60 * 60);
      const decryptionKey = ethers.toUtf8Bytes("mock-decryption-key");
      await cryptoLaunch.connect(campaignCreator).finalizeCampaign(1, decryptionKey);

      // First refund claim
      await cryptoLaunch.connect(investor1).claimRefund(1);

      // Second refund claim should fail
      await expect(
        cryptoLaunch.connect(investor1).claimRefund(1)
      ).to.be.revertedWith("No refund available");
    });
  });

  describe("Platform Management", function () {
    it("Should allow owner to update platform fee", async function () {
      const { cryptoLaunch, owner } = await loadFixture(deployContractsFixture);

      await cryptoLaunch.connect(owner).updatePlatformFee(250); // 2.5%
      expect(await cryptoLaunch.platformFeePercentage()).to.equal(250);
    });

    it("Should prevent non-owner from updating platform fee", async function () {
      const { cryptoLaunch, investor1 } = await loadFixture(deployContractsFixture);

      await expect(
        cryptoLaunch.connect(investor1).updatePlatformFee(250)
      ).to.be.revertedWithCustomError(cryptoLaunch, "OwnableUnauthorizedAccount");
    });

    it("Should reject platform fee above maximum", async function () {
      const { cryptoLaunch, owner } = await loadFixture(deployContractsFixture);

      await expect(
        cryptoLaunch.connect(owner).updatePlatformFee(600) // Above 5% max
      ).to.be.revertedWith("Fee exceeds maximum");
    });

    it("Should allow updating platform treasury", async function () {
      const { cryptoLaunch, owner, investor1 } = await loadFixture(deployContractsFixture);

      await cryptoLaunch.connect(owner).updatePlatformTreasury(investor1.address);
      expect(await cryptoLaunch.platformTreasury()).to.equal(investor1.address);
    });

    it("Should allow emergency pause/resume", async function () {
      const { cryptoLaunch, testToken, campaignCreator, owner } = await loadFixture(deployContractsFixture);

      // Create campaign first
      const tokenSupply = ethers.parseEther("100000");
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await cryptoLaunch.connect(campaignCreator).launchCampaign(
        await testToken.getAddress(),
        tokenSupply,
        ethers.parseEther("1000"),
        ethers.parseEther("0.01"),
        30 * 24 * 60 * 60,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://test-metadata"
      );

      // Emergency pause
      await cryptoLaunch.connect(owner).emergencyPause(1);
      let campaign = await cryptoLaunch.campaigns(1);
      expect(campaign.isLive).to.equal(false);

      // Emergency resume
      await cryptoLaunch.connect(owner).emergencyResume(1);
      campaign = await cryptoLaunch.campaigns(1);
      expect(campaign.isLive).to.equal(true);
    });
  });

  describe("View Functions", function () {
    it("Should return campaign details correctly", async function () {
      const { cryptoLaunch, testToken, campaignCreator } = await loadFixture(deployContractsFixture);

      const tokenSupply = ethers.parseEther("100000");
      const fundingGoal = ethers.parseEther("1000");
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await cryptoLaunch.connect(campaignCreator).launchCampaign(
        await testToken.getAddress(),
        tokenSupply,
        fundingGoal,
        ethers.parseEther("0.01"),
        30 * 24 * 60 * 60,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://test-metadata"
      );

      const campaign = await cryptoLaunch.getCampaignDetails(1);
      expect(campaign.campaignOwner).to.equal(campaignCreator.address);
      expect(campaign.fundingGoal).to.equal(fundingGoal);
      expect(campaign.rewardToken).to.equal(await testToken.getAddress());
    });

    it("Should return backer campaigns", async function () {
      const { cryptoLaunch, testToken, campaignCreator, investor1 } = await loadFixture(deployContractsFixture);

      // Create campaign
      const tokenSupply = ethers.parseEther("100000");
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await cryptoLaunch.connect(campaignCreator).launchCampaign(
        await testToken.getAddress(),
        tokenSupply,
        ethers.parseEther("1000"),
        ethers.parseEther("0.01"),
        30 * 24 * 60 * 60,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://test-metadata"
      );

      // Make investment
      const investmentAmount = ethers.parseEther("5");
      const nonce = 12345;
      const encryptedAmount = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [investmentAmount, nonce])
      );
      const proof = ethers.solidityPacked(
        ["uint256", "uint256", "address"],
        [investmentAmount, nonce, investor1.address]
      );

      await cryptoLaunch.connect(investor1).makeConfidentialBacking(
        1, encryptedAmount, proof, nonce, { value: investmentAmount }
      );

      const backerCampaigns = await cryptoLaunch.getBackerCampaigns(investor1.address);
      expect(backerCampaigns.length).to.equal(1);
      expect(backerCampaigns[0]).to.equal(1);
    });

    it("Should return active campaigns count", async function () {
      const { cryptoLaunch, testToken, campaignCreator } = await loadFixture(deployContractsFixture);

      expect(await cryptoLaunch.getActiveCampaignsCount()).to.equal(0);

      // Create campaign
      const tokenSupply = ethers.parseEther("100000");
      await testToken.transfer(campaignCreator.address, tokenSupply);
      await testToken.connect(campaignCreator).approve(await cryptoLaunch.getAddress(), tokenSupply);

      await cryptoLaunch.connect(campaignCreator).launchCampaign(
        await testToken.getAddress(),
        tokenSupply,
        ethers.parseEther("1000"),
        ethers.parseEther("0.01"),
        30 * 24 * 60 * 60,
        ethers.parseEther("0.1"),
        ethers.parseEther("10"),
        "ipfs://test-metadata"
      );

      expect(await cryptoLaunch.getActiveCampaignsCount()).to.equal(1);
    });
  });
});