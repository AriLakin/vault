const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CampaignManager", function () {
  async function deployCampaignManagerFixture() {
    const [owner, creator1, creator2, verifier1, verifier2] = await ethers.getSigners();

    const CampaignManager = await ethers.getContractFactory("CampaignManager");
    const campaignManager = await CampaignManager.deploy();
    await campaignManager.waitForDeployment();

    return {
      campaignManager,
      owner,
      creator1,
      creator2,
      verifier1,
      verifier2
    };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { campaignManager, owner } = await loadFixture(deployCampaignManagerFixture);

      expect(await campaignManager.nextCampaignId()).to.equal(1);
      expect(await campaignManager.verificationFee()).to.equal(ethers.parseEther("0.1"));
      
      // Check that owner has admin role
      const DEFAULT_ADMIN_ROLE = await campaignManager.DEFAULT_ADMIN_ROLE();
      expect(await campaignManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });

    it("Should grant initial roles to deployer", async function () {
      const { campaignManager, owner } = await loadFixture(deployCampaignManagerFixture);

      const DEFAULT_ADMIN_ROLE = await campaignManager.DEFAULT_ADMIN_ROLE();
      const VERIFIER_ROLE = await campaignManager.VERIFIER_ROLE();
      const CAMPAIGN_CREATOR_ROLE = await campaignManager.CAMPAIGN_CREATOR_ROLE();

      expect(await campaignManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
      expect(await campaignManager.hasRole(VERIFIER_ROLE, owner.address)).to.equal(true);
      expect(await campaignManager.hasRole(CAMPAIGN_CREATOR_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("Campaign Registration", function () {
    it("Should register campaign successfully", async function () {
      const { campaignManager, creator1 } = await loadFixture(deployCampaignManagerFixture);

      await expect(
        campaignManager.connect(creator1).registerCampaign(
          "Test Campaign",
          "A test campaign description",
          "https://testcampaign.com",
          "https://whitepaper.com",
          ["https://twitter.com/test", "https://discord.gg/test"],
          ethers.keccak256(ethers.toUtf8Bytes("logo-hash"))
        )
      ).to.emit(campaignManager, "CampaignRegistered")
        .withArgs(1, creator1.address, "Test Campaign", await ethers.provider.getBlockNumber() + 1);

      // Verify campaign metadata
      const campaign = await campaignManager.campaignMetadata(1);
      expect(campaign.name).to.equal("Test Campaign");
      expect(campaign.creator).to.equal(creator1.address);
      expect(campaign.isActive).to.equal(true);
      expect(campaign.reputation.totalScore).to.equal(50); // Starting score
    });

    it("Should reject empty campaign name", async function () {
      const { campaignManager, creator1 } = await loadFixture(deployCampaignManagerFixture);

      await expect(
        campaignManager.connect(creator1).registerCampaign(
          "", // Empty name
          "A test campaign description",
          "https://testcampaign.com",
          "https://whitepaper.com",
          ["https://twitter.com/test"],
          ethers.keccak256(ethers.toUtf8Bytes("logo-hash"))
        )
      ).to.be.revertedWith("Campaign name required");
    });

    it("Should reject empty campaign description", async function () {
      const { campaignManager, creator1 } = await loadFixture(deployCampaignManagerFixture);

      await expect(
        campaignManager.connect(creator1).registerCampaign(
          "Test Campaign",
          "", // Empty description
          "https://testcampaign.com",
          "https://whitepaper.com",
          ["https://twitter.com/test"],
          ethers.keccak256(ethers.toUtf8Bytes("logo-hash"))
        )
      ).to.be.revertedWith("Campaign description required");
    });

    it("Should enforce maximum campaigns per creator", async function () {
      const { campaignManager, creator1 } = await loadFixture(deployCampaignManagerFixture);

      // Register maximum allowed campaigns (10)
      for (let i = 0; i < 10; i++) {
        await campaignManager.connect(creator1).registerCampaign(
          `Campaign ${i + 1}`,
          `Description ${i + 1}`,
          `https://campaign${i + 1}.com`,
          `https://whitepaper${i + 1}.com`,
          [`https://twitter.com/campaign${i + 1}`],
          ethers.keccak256(ethers.toUtf8Bytes(`logo-hash-${i + 1}`))
        );
      }

      // Try to register 11th campaign
      await expect(
        campaignManager.connect(creator1).registerCampaign(
          "Campaign 11",
          "Description 11",
          "https://campaign11.com",
          "https://whitepaper11.com",
          ["https://twitter.com/campaign11"],
          ethers.keccak256(ethers.toUtf8Bytes("logo-hash-11"))
        )
      ).to.be.revertedWith("Max campaigns limit reached");
    });

    it("Should automatically grant creator role on first registration", async function () {
      const { campaignManager, creator1 } = await loadFixture(deployCampaignManagerFixture);

      const CAMPAIGN_CREATOR_ROLE = await campaignManager.CAMPAIGN_CREATOR_ROLE();
      
      // Initially creator1 doesn't have the role
      expect(await campaignManager.hasRole(CAMPAIGN_CREATOR_ROLE, creator1.address)).to.equal(false);

      // Register campaign
      await campaignManager.connect(creator1).registerCampaign(
        "Test Campaign",
        "A test campaign description",
        "https://testcampaign.com",
        "https://whitepaper.com",
        ["https://twitter.com/test"],
        ethers.keccak256(ethers.toUtf8Bytes("logo-hash"))
      );

      // Now creator1 should have the role
      expect(await campaignManager.hasRole(CAMPAIGN_CREATOR_ROLE, creator1.address)).to.equal(true);
    });

    it("Should update creator campaigns array", async function () {
      const { campaignManager, creator1 } = await loadFixture(deployCampaignManagerFixture);

      // Register first campaign
      await campaignManager.connect(creator1).registerCampaign(
        "Campaign 1",
        "Description 1",
        "https://campaign1.com",
        "https://whitepaper1.com",
        ["https://twitter.com/campaign1"],
        ethers.keccak256(ethers.toUtf8Bytes("logo-hash-1"))
      );

      // Register second campaign
      await campaignManager.connect(creator1).registerCampaign(
        "Campaign 2",
        "Description 2",
        "https://campaign2.com",
        "https://whitepaper2.com",
        ["https://twitter.com/campaign2"],
        ethers.keccak256(ethers.toUtf8Bytes("logo-hash-2"))
      );

      const creatorCampaigns = await campaignManager.getCreatorCampaigns(creator1.address);
      expect(creatorCampaigns.length).to.equal(2);
      expect(creatorCampaigns[0]).to.equal(1);
      expect(creatorCampaigns[1]).to.equal(2);
    });
  });

  describe("Campaign Verification", function () {
    async function setupCampaignFixture() {
      const fixture = await loadFixture(deployCampaignManagerFixture);
      const { campaignManager, creator1 } = fixture;

      // Register a campaign first
      await campaignManager.connect(creator1).registerCampaign(
        "Test Campaign",
        "A test campaign description",
        "https://testcampaign.com",
        "https://whitepaper.com",
        ["https://twitter.com/test"],
        ethers.keccak256(ethers.toUtf8Bytes("logo-hash"))
      );

      return fixture;
    }

    it("Should verify campaign successfully", async function () {
      const { campaignManager, owner } = await loadFixture(setupCampaignFixture);

      await expect(
        campaignManager.connect(owner).verifyCampaign(
          1,
          true,  // KYC completed
          true,  // Audit completed
          true,  // Legal completed
          "All verification checks passed"
        )
      ).to.emit(campaignManager, "CampaignVerified");

      // Check verification status
      const campaign = await campaignManager.campaignMetadata(1);
      expect(campaign.verification.kycCompleted).to.equal(true);
      expect(campaign.verification.auditCompleted).to.equal(true);
      expect(campaign.verification.legalCompleted).to.equal(true);
      expect(campaign.verification.verifiedBy).to.equal(owner.address);

      // Check if marked as verified
      expect(await campaignManager.verifiedCampaigns(1)).to.equal(true);
    });

    it("Should only allow verifiers to verify campaigns", async function () {
      const { campaignManager, creator1 } = await loadFixture(setupCampaignFixture);

      await expect(
        campaignManager.connect(creator1).verifyCampaign(
          1,
          true, true, true,
          "Unauthorized verification attempt"
        )
      ).to.be.revertedWithCustomError(campaignManager, "AccessControlUnauthorizedAccount");
    });

    it("Should update creator reputation on full verification", async function () {
      const { campaignManager, owner, creator1 } = await loadFixture(setupCampaignFixture);

      const initialReputation = await campaignManager.creatorReputation(creator1.address);
      const initialScore = initialReputation.totalScore;

      await campaignManager.connect(owner).verifyCampaign(
        1,
        true, true, true,
        "All verification checks passed"
      );

      const updatedReputation = await campaignManager.creatorReputation(creator1.address);
      expect(updatedReputation.totalScore).to.equal(initialScore + 50n); // 50 point bonus
    });

    it("Should not mark as verified if not all checks pass", async function () {
      const { campaignManager, owner } = await loadFixture(setupCampaignFixture);

      await campaignManager.connect(owner).verifyCampaign(
        1,
        true,  // KYC completed
        false, // Audit not completed
        true,  // Legal completed
        "Audit still pending"
      );

      expect(await campaignManager.verifiedCampaigns(1)).to.equal(false);
    });

    it("Should reject verification of invalid campaign ID", async function () {
      const { campaignManager, owner } = await loadFixture(setupCampaignFixture);

      await expect(
        campaignManager.connect(owner).verifyCampaign(
          999, // Invalid ID
          true, true, true,
          "Invalid campaign"
        )
      ).to.be.revertedWith("Invalid campaign ID");
    });
  });

  describe("Campaign Metadata Management", function () {
    async function setupVerifiedCampaignFixture() {
      const fixture = await loadFixture(deployCampaignManagerFixture);
      const { campaignManager, creator1, owner } = fixture;

      // Register and verify campaign
      await campaignManager.connect(creator1).registerCampaign(
        "Test Campaign",
        "A test campaign description",
        "https://testcampaign.com",
        "https://whitepaper.com",
        ["https://twitter.com/test"],
        ethers.keccak256(ethers.toUtf8Bytes("logo-hash"))
      );

      return fixture;
    }

    it("Should allow creator to update metadata", async function () {
      const { campaignManager, creator1 } = await loadFixture(setupVerifiedCampaignFixture);

      const updatedSocials = ["https://twitter.com/updated", "https://discord.gg/updated"];
      
      await expect(
        campaignManager.connect(creator1).updateCampaignMetadata(
          1,
          "Updated Campaign Name",
          "Updated description",
          "https://updated-website.com",
          "https://updated-whitepaper.com",
          updatedSocials,
          ethers.keccak256(ethers.toUtf8Bytes("updated-logo"))
        )
      ).to.emit(campaignManager, "MetadataUpdated")
        .withArgs(1, creator1.address, await ethers.provider.getBlockNumber() + 1);

      const campaign = await campaignManager.campaignMetadata(1);
      expect(campaign.name).to.equal("Updated Campaign Name");
      expect(campaign.description).to.equal("Updated description");
      expect(campaign.websiteUrl).to.equal("https://updated-website.com");
    });

    it("Should only allow campaign creator to update metadata", async function () {
      const { campaignManager, creator2 } = await loadFixture(setupVerifiedCampaignFixture);

      await expect(
        campaignManager.connect(creator2).updateCampaignMetadata(
          1,
          "Unauthorized Update",
          "This should fail",
          "https://hack.com",
          "https://fake-whitepaper.com",
          ["https://twitter.com/fake"],
          ethers.keccak256(ethers.toUtf8Bytes("fake-logo"))
        )
      ).to.be.revertedWith("Not campaign creator");
    });

    it("Should update updatedAt timestamp", async function () {
      const { campaignManager, creator1 } = await loadFixture(setupVerifiedCampaignFixture);

      const campaignBefore = await campaignManager.campaignMetadata(1);
      const timestampBefore = campaignBefore.updatedAt;

      // Wait a bit and update
      await ethers.provider.send("evm_increaseTime", [1]);
      await ethers.provider.send("evm_mine", []);

      await campaignManager.connect(creator1).updateCampaignMetadata(
        1,
        "Updated Name",
        "Updated description",
        "https://updated.com",
        "https://updated-whitepaper.com",
        ["https://twitter.com/updated"],
        ethers.keccak256(ethers.toUtf8Bytes("updated-logo"))
      );

      const campaignAfter = await campaignManager.campaignMetadata(1);
      expect(campaignAfter.updatedAt).to.be.gt(timestampBefore);
    });
  });

  describe("Reputation Management", function () {
    async function setupCreatorFixture() {
      const fixture = await loadFixture(deployCampaignManagerFixture);
      const { campaignManager, creator1 } = fixture;

      // Register campaign to initialize reputation
      await campaignManager.connect(creator1).registerCampaign(
        "Test Campaign",
        "Description",
        "https://test.com",
        "https://whitepaper.com",
        ["https://twitter.com/test"],
        ethers.keccak256(ethers.toUtf8Bytes("logo"))
      );

      return fixture;
    }

    it("Should allow verifier to update reputation", async function () {
      const { campaignManager, creator1, owner } = await loadFixture(setupCreatorFixture);

      const initialReputation = await campaignManager.creatorReputation(creator1.address);
      const initialScore = initialReputation.totalScore;

      await expect(
        campaignManager.connect(owner).updateCreatorReputation(
          creator1.address,
          25,
          true // Increase
        )
      ).to.emit(campaignManager, "ReputationUpdated")
        .withArgs(creator1.address, initialScore, initialScore + 25n, await ethers.provider.getBlockNumber() + 1);

      const updatedReputation = await campaignManager.creatorReputation(creator1.address);
      expect(updatedReputation.totalScore).to.equal(initialScore + 25n);
    });

    it("Should allow reputation decrease", async function () {
      const { campaignManager, creator1, owner } = await loadFixture(setupCreatorFixture);

      const initialReputation = await campaignManager.creatorReputation(creator1.address);
      const initialScore = initialReputation.totalScore;

      await campaignManager.connect(owner).updateCreatorReputation(
        creator1.address,
        10,
        false // Decrease
      );

      const updatedReputation = await campaignManager.creatorReputation(creator1.address);
      expect(updatedReputation.totalScore).to.equal(initialScore - 10n);
    });

    it("Should not allow reputation to go below zero", async function () {
      const { campaignManager, creator1, owner } = await loadFixture(setupCreatorFixture);

      await campaignManager.connect(owner).updateCreatorReputation(
        creator1.address,
        1000, // Large decrease
        false
      );

      const reputation = await campaignManager.creatorReputation(creator1.address);
      expect(reputation.totalScore).to.equal(0);
    });

    it("Should record successful campaign", async function () {
      const { campaignManager, creator1, owner } = await loadFixture(setupCreatorFixture);

      const initialReputation = await campaignManager.creatorReputation(creator1.address);
      const initialScore = initialReputation.totalScore;
      const initialSuccessful = initialReputation.successfulCampaigns;

      await campaignManager.connect(owner).recordSuccessfulCampaign(creator1.address);

      const updatedReputation = await campaignManager.creatorReputation(creator1.address);
      expect(updatedReputation.successfulCampaigns).to.equal(initialSuccessful + 1n);
      expect(updatedReputation.totalScore).to.equal(initialScore + 100n); // 100 point bonus
    });

    it("Should only allow verifiers to update reputation", async function () {
      const { campaignManager, creator1, creator2 } = await loadFixture(setupCreatorFixture);

      await expect(
        campaignManager.connect(creator2).updateCreatorReputation(
          creator1.address,
          25,
          true
        )
      ).to.be.revertedWithCustomError(campaignManager, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Campaign State Management", function () {
    async function setupActiveCampaignFixture() {
      const fixture = await loadFixture(deployCampaignManagerFixture);
      const { campaignManager, creator1 } = fixture;

      await campaignManager.connect(creator1).registerCampaign(
        "Active Campaign",
        "Description",
        "https://test.com",
        "https://whitepaper.com",
        ["https://twitter.com/test"],
        ethers.keccak256(ethers.toUtf8Bytes("logo"))
      );

      return fixture;
    }

    it("Should allow creator to pause campaign", async function () {
      const { campaignManager, creator1 } = await loadFixture(setupActiveCampaignFixture);

      await campaignManager.connect(creator1).pauseCampaign(1);

      const campaign = await campaignManager.campaignMetadata(1);
      expect(campaign.isActive).to.equal(false);
    });

    it("Should allow creator to resume campaign", async function () {
      const { campaignManager, creator1 } = await loadFixture(setupActiveCampaignFixture);

      await campaignManager.connect(creator1).pauseCampaign(1);
      await campaignManager.connect(creator1).resumeCampaign(1);

      const campaign = await campaignManager.campaignMetadata(1);
      expect(campaign.isActive).to.equal(true);
    });

    it("Should only allow creator to pause/resume their campaigns", async function () {
      const { campaignManager, creator2 } = await loadFixture(setupActiveCampaignFixture);

      await expect(
        campaignManager.connect(creator2).pauseCampaign(1)
      ).to.be.revertedWith("Not campaign creator");

      await expect(
        campaignManager.connect(creator2).resumeCampaign(1)
      ).to.be.revertedWith("Not campaign creator");
    });
  });

  describe("Query Functions", function () {
    async function setupMultipleCampaignsFixture() {
      const fixture = await loadFixture(deployCampaignManagerFixture);
      const { campaignManager, creator1, creator2, owner } = fixture;

      // Create and verify some campaigns
      await campaignManager.connect(creator1).registerCampaign(
        "Campaign 1", "Desc 1", "https://c1.com", "https://w1.com", ["https://t1.com"], ethers.keccak256(ethers.toUtf8Bytes("l1"))
      );

      await campaignManager.connect(creator2).registerCampaign(
        "Campaign 2", "Desc 2", "https://c2.com", "https://w2.com", ["https://t2.com"], ethers.keccak256(ethers.toUtf8Bytes("l2"))
      );

      await campaignManager.connect(creator1).registerCampaign(
        "Campaign 3", "Desc 3", "https://c3.com", "https://w3.com", ["https://t3.com"], ethers.keccak256(ethers.toUtf8Bytes("l3"))
      );

      // Verify campaigns 1 and 3
      await campaignManager.connect(owner).verifyCampaign(1, true, true, true, "Verified");
      await campaignManager.connect(owner).verifyCampaign(3, true, true, true, "Verified");

      return fixture;
    }

    it("Should return verified campaigns", async function () {
      const { campaignManager } = await loadFixture(setupMultipleCampaignsFixture);

      const verifiedCampaigns = await campaignManager.getVerifiedCampaigns();
      expect(verifiedCampaigns.length).to.equal(2);
      expect(verifiedCampaigns[0]).to.equal(1);
      expect(verifiedCampaigns[1]).to.equal(3);
    });

    it("Should return creator campaigns", async function () {
      const { campaignManager, creator1 } = await loadFixture(setupMultipleCampaignsFixture);

      const creatorCampaigns = await campaignManager.getCreatorCampaigns(creator1.address);
      expect(creatorCampaigns.length).to.equal(2);
      expect(creatorCampaigns[0]).to.equal(1);
      expect(creatorCampaigns[1]).to.equal(3);
    });

    it("Should check creator eligibility", async function () {
      const { campaignManager, creator1, creator2 } = await loadFixture(setupMultipleCampaignsFixture);

      // creator1 has campaigns and should be eligible (starting score 50)
      expect(await campaignManager.isCreatorEligible(creator1.address)).to.equal(false); // Score < 100

      // Update reputation to make eligible
      const { owner } = await loadFixture(setupMultipleCampaignsFixture);
      await campaignManager.connect(owner).updateCreatorReputation(creator1.address, 60, true);
      
      expect(await campaignManager.isCreatorEligible(creator1.address)).to.equal(true); // Score >= 100
    });

    it("Should return campaign metadata", async function () {
      const { campaignManager } = await loadFixture(setupMultipleCampaignsFixture);

      const campaign = await campaignManager.getCampaignMetadata(1);
      expect(campaign.name).to.equal("Campaign 1");
      expect(campaign.description).to.equal("Desc 1");
      expect(campaign.websiteUrl).to.equal("https://c1.com");
      expect(campaign.campaignId).to.equal(1);
    });

    it("Should check if campaign is verified", async function () {
      const { campaignManager } = await loadFixture(setupMultipleCampaignsFixture);

      expect(await campaignManager.isCampaignVerified(1)).to.equal(true);
      expect(await campaignManager.isCampaignVerified(2)).to.equal(false);
      expect(await campaignManager.isCampaignVerified(3)).to.equal(true);
    });
  });

  describe("Administrative Functions", function () {
    it("Should allow admin to set verification fee", async function () {
      const { campaignManager, owner } = await loadFixture(deployCampaignManagerFixture);

      await campaignManager.connect(owner).setVerificationFee(ethers.parseEther("0.2"));
      expect(await campaignManager.verificationFee()).to.equal(ethers.parseEther("0.2"));
    });

    it("Should allow admin to pause/unpause contract", async function () {
      const { campaignManager, owner, creator1 } = await loadFixture(deployCampaignManagerFixture);

      // Pause contract
      await campaignManager.connect(owner).pause();

      // Try to register campaign while paused
      await expect(
        campaignManager.connect(creator1).registerCampaign(
          "Test", "Desc", "https://test.com", "https://wp.com", ["https://social.com"], ethers.keccak256(ethers.toUtf8Bytes("logo"))
        )
      ).to.be.revertedWithCustomError(campaignManager, "EnforcedPause");

      // Unpause
      await campaignManager.connect(owner).unpause();

      // Now registration should work
      await expect(
        campaignManager.connect(creator1).registerCampaign(
          "Test", "Desc", "https://test.com", "https://wp.com", ["https://social.com"], ethers.keccak256(ethers.toUtf8Bytes("logo"))
        )
      ).to.emit(campaignManager, "CampaignRegistered");
    });

    it("Should only allow admin to pause/unpause", async function () {
      const { campaignManager, creator1 } = await loadFixture(deployCampaignManagerFixture);

      await expect(
        campaignManager.connect(creator1).pause()
      ).to.be.revertedWithCustomError(campaignManager, "AccessControlUnauthorizedAccount");

      await expect(
        campaignManager.connect(creator1).unpause()
      ).to.be.revertedWithCustomError(campaignManager, "AccessControlUnauthorizedAccount");
    });
  });
});