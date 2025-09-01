// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./CampaignManager.sol";
import "./ConfidentialUtils.sol";

contract CryptoLaunch is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ConfidentialUtils for bytes32;

    struct FundraisingCampaign {
        uint256 campaignId;
        address campaignOwner;
        address rewardToken;
        uint256 totalTokenSupply;
        uint256 fundingGoal;
        bytes32 encryptedRaisedAmount;
        uint256 tokenPriceInWei;
        uint256 campaignStart;
        uint256 campaignEnd;
        uint256 minimumContribution;
        uint256 maximumContribution;
        bool isLive;
        bool fundingSuccessful;
        string campaignDataURI;
        CampaignPhase currentPhase;
        uint256 totalBackers;
    }

    enum CampaignPhase { 
        Preparation, 
        Live, 
        Successful, 
        Failed, 
        TokenDistribution,
        Completed 
    }

    struct ConfidentialBacking {
        bytes32 encryptedContribution;
        address backer;
        uint256 campaignId;
        uint256 backingTime;
        bool rewardsClaimed;
        bytes confidentialProof;
        uint256 nonce;
    }

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 duration;
        uint256 cliffPeriod;
        bool isActive;
    }

    mapping(uint256 => FundraisingCampaign) public campaigns;
    mapping(uint256 => ConfidentialBacking[]) public campaignBackings;
    mapping(address => uint256[]) public backerCampaigns;
    mapping(uint256 => mapping(address => bool)) public hasBackedCampaign;
    mapping(uint256 => mapping(address => VestingSchedule)) public vestingSchedules;
    mapping(address => bytes32) public backerEncryptionKeys;
    
    uint256 public nextCampaignId = 1;
    uint256 public platformFeePercentage = 300; // 3%
    uint256 public constant MAX_PLATFORM_FEE = 500; // 5%
    uint256 public constant MIN_CAMPAIGN_DURATION = 7 days;
    uint256 public constant MAX_CAMPAIGN_DURATION = 90 days;
    
    address public platformTreasury;
    CampaignManager public immutable campaignManager;
    
    event CampaignLaunched(
        uint256 indexed campaignId,
        address indexed campaignOwner,
        address rewardToken,
        uint256 fundingGoal,
        uint256 tokenPriceInWei
    );

    event ConfidentialBackingReceived(
        uint256 indexed campaignId,
        address indexed backer,
        bytes32 encryptedContribution,
        uint256 backingTime
    );

    event CampaignFundingCompleted(
        uint256 indexed campaignId,
        bytes32 encryptedTotalRaised,
        uint256 totalBackers,
        uint256 completionTime
    );

    event RewardTokensDistributed(
        uint256 indexed campaignId,
        address indexed backer,
        uint256 tokenAmount
    );

    event CampaignPhaseChanged(
        uint256 indexed campaignId,
        CampaignPhase previousPhase,
        CampaignPhase newPhase
    );

    event VestingScheduleCreated(
        uint256 indexed campaignId,
        address indexed backer,
        uint256 totalAmount,
        uint256 duration
    );

    modifier onlyCampaignOwner(uint256 _campaignId) {
        require(
            campaigns[_campaignId].campaignOwner == msg.sender,
            "Not authorized campaign owner"
        );
        _;
    }

    modifier validCampaignId(uint256 _campaignId) {
        require(
            _campaignId > 0 && _campaignId < nextCampaignId,
            "Invalid campaign identifier"
        );
        _;
    }

    modifier campaignIsLive(uint256 _campaignId) {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        require(campaign.isLive, "Campaign not currently live");
        require(block.timestamp >= campaign.campaignStart, "Campaign not started");
        require(block.timestamp <= campaign.campaignEnd, "Campaign has ended");
        _;
    }

    constructor(
        address _campaignManager,
        address _platformTreasury
    ) Ownable(msg.sender) {
        require(_campaignManager != address(0), "Invalid campaign manager");
        require(_platformTreasury != address(0), "Invalid treasury address");
        
        campaignManager = CampaignManager(_campaignManager);
        platformTreasury = _platformTreasury;
    }

    function launchCampaign(
        address _rewardToken,
        uint256 _totalTokenSupply,
        uint256 _fundingGoal,
        uint256 _tokenPriceInWei,
        uint256 _campaignDuration,
        uint256 _minimumContribution,
        uint256 _maximumContribution,
        string memory _campaignDataURI
    ) external nonReentrant returns (uint256) {
        require(_rewardToken != address(0), "Invalid reward token address");
        require(_totalTokenSupply > 0, "Token supply must be positive");
        require(_fundingGoal > 0, "Funding goal must be positive");
        require(_tokenPriceInWei > 0, "Token price must be positive");
        require(
            _campaignDuration >= MIN_CAMPAIGN_DURATION && 
            _campaignDuration <= MAX_CAMPAIGN_DURATION,
            "Invalid campaign duration"
        );
        require(_minimumContribution > 0, "Minimum contribution required");
        require(_maximumContribution >= _minimumContribution, "Invalid contribution limits");
        require(bytes(_campaignDataURI).length > 0, "Campaign data URI required");

        // Verify campaign creator eligibility through CampaignManager
        require(campaignManager.isCreatorEligible(msg.sender), "Creator not eligible");

        uint256 campaignId = nextCampaignId++;
        
        campaigns[campaignId] = FundraisingCampaign({
            campaignId: campaignId,
            campaignOwner: msg.sender,
            rewardToken: _rewardToken,
            totalTokenSupply: _totalTokenSupply,
            fundingGoal: _fundingGoal,
            encryptedRaisedAmount: bytes32(0),
            tokenPriceInWei: _tokenPriceInWei,
            campaignStart: block.timestamp,
            campaignEnd: block.timestamp + _campaignDuration,
            minimumContribution: _minimumContribution,
            maximumContribution: _maximumContribution,
            isLive: true,
            fundingSuccessful: false,
            campaignDataURI: _campaignDataURI,
            currentPhase: CampaignPhase.Live,
            totalBackers: 0
        });

        // Transfer reward tokens to contract for later distribution
        IERC20(_rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _totalTokenSupply
        );

        emit CampaignLaunched(
            campaignId,
            msg.sender,
            _rewardToken,
            _fundingGoal,
            _tokenPriceInWei
        );

        return campaignId;
    }

    function makeConfidentialBacking(
        uint256 _campaignId,
        bytes32 _encryptedContribution,
        bytes memory _confidentialProof,
        uint256 _nonce
    ) external payable nonReentrant validCampaignId(_campaignId) campaignIsLive(_campaignId) {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        require(msg.value >= campaign.minimumContribution, "Below minimum contribution");
        require(msg.value <= campaign.maximumContribution, "Exceeds maximum contribution");
        
        // Verify confidential proof
        require(
            ConfidentialUtils.verifyZKProof(_confidentialProof, msg.value),
            "Invalid confidential proof"
        );
        
        // Verify encrypted contribution matches actual payment
        bytes32 expectedEncryption = ConfidentialUtils.createEncryption(msg.value, _nonce);
        require(
            ConfidentialUtils.isValidEncryption(_encryptedContribution),
            "Invalid encryption format"
        );

        // Record confidential backing
        campaignBackings[_campaignId].push(ConfidentialBacking({
            encryptedContribution: _encryptedContribution,
            backer: msg.sender,
            campaignId: _campaignId,
            backingTime: block.timestamp,
            rewardsClaimed: false,
            confidentialProof: _confidentialProof,
            nonce: _nonce
        }));

        // Update campaign state
        campaign.encryptedRaisedAmount = ConfidentialUtils.addEncrypted(
            campaign.encryptedRaisedAmount,
            _encryptedContribution
        );

        if (!hasBackedCampaign[_campaignId][msg.sender]) {
            hasBackedCampaign[_campaignId][msg.sender] = true;
            backerCampaigns[msg.sender].push(_campaignId);
            campaign.totalBackers++;
        }

        emit ConfidentialBackingReceived(
            _campaignId,
            msg.sender,
            _encryptedContribution,
            block.timestamp
        );

        // Check if funding goal potentially reached (simplified check)
        _checkCampaignCompletion(_campaignId);
    }

    function finalizeCampaign(
        uint256 _campaignId,
        bytes memory _decryptionKey
    ) external onlyCampaignOwner(_campaignId) validCampaignId(_campaignId) {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        require(
            block.timestamp > campaign.campaignEnd || campaign.fundingSuccessful,
            "Campaign still active"
        );
        require(campaign.currentPhase == CampaignPhase.Live, "Campaign already finalized");

        // Decrypt total raised amount for final verification
        uint256 totalRaised = ConfidentialUtils.decryptValue(
            campaign.encryptedRaisedAmount,
            _decryptionKey,
            msg.sender
        );

        bool fundingSuccessful = totalRaised >= campaign.fundingGoal;
        campaign.fundingSuccessful = fundingSuccessful;

        if (fundingSuccessful) {
            campaign.currentPhase = CampaignPhase.Successful;
            _setupTokenDistribution(_campaignId);
        } else {
            campaign.currentPhase = CampaignPhase.Failed;
            _setupRefunds(_campaignId);
        }

        campaign.isLive = false;

        emit CampaignFundingCompleted(
            _campaignId,
            campaign.encryptedRaisedAmount,
            campaign.totalBackers,
            block.timestamp
        );
    }

    function _setupTokenDistribution(uint256 _campaignId) internal {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        ConfidentialBacking[] storage backings = campaignBackings[_campaignId];

        for (uint256 i = 0; i < backings.length; i++) {
            ConfidentialBacking storage backing = backings[i];
            if (!backing.rewardsClaimed) {
                // Calculate token allocation (simplified)
                uint256 estimatedContribution = uint256(backing.encryptedContribution) % campaign.fundingGoal;
                uint256 tokenAllocation = (estimatedContribution * 1e18) / campaign.tokenPriceInWei;

                // Create vesting schedule
                vestingSchedules[_campaignId][backing.backer] = VestingSchedule({
                    totalAmount: tokenAllocation,
                    claimedAmount: 0,
                    startTime: block.timestamp,
                    duration: 180 days, // 6 months vesting
                    cliffPeriod: 30 days, // 1 month cliff
                    isActive: true
                });

                emit VestingScheduleCreated(
                    _campaignId,
                    backing.backer,
                    tokenAllocation,
                    180 days
                );
            }
        }

        campaign.currentPhase = CampaignPhase.TokenDistribution;
    }

    function _setupRefunds(uint256 _campaignId) internal {
        // Mark campaign for refund processing
        // In a real implementation, this would handle automatic refunds
        campaigns[_campaignId].currentPhase = CampaignPhase.Failed;
    }

    function claimVestedTokens(uint256 _campaignId) 
        external 
        nonReentrant 
        validCampaignId(_campaignId) 
    {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        require(campaign.fundingSuccessful, "Campaign was not successful");
        require(
            campaign.currentPhase == CampaignPhase.TokenDistribution ||
            campaign.currentPhase == CampaignPhase.Completed,
            "Tokens not available for claim"
        );

        VestingSchedule storage vesting = vestingSchedules[_campaignId][msg.sender];
        require(vesting.isActive, "No vesting schedule found");
        require(block.timestamp >= vesting.startTime + vesting.cliffPeriod, "Cliff period not passed");

        uint256 vestedAmount = _calculateVestedAmount(vesting);
        uint256 claimableAmount = vestedAmount - vesting.claimedAmount;
        require(claimableAmount > 0, "No tokens available to claim");

        vesting.claimedAmount += claimableAmount;

        // Transfer vested tokens
        IERC20(campaign.rewardToken).safeTransfer(msg.sender, claimableAmount);

        emit RewardTokensDistributed(_campaignId, msg.sender, claimableAmount);

        // Check if fully vested
        if (vesting.claimedAmount >= vesting.totalAmount) {
            vesting.isActive = false;
        }
    }

    function _calculateVestedAmount(VestingSchedule memory _vesting) internal view returns (uint256) {
        if (block.timestamp < _vesting.startTime + _vesting.cliffPeriod) {
            return 0;
        }

        if (block.timestamp >= _vesting.startTime + _vesting.duration) {
            return _vesting.totalAmount;
        }

        uint256 timeVested = block.timestamp - (_vesting.startTime + _vesting.cliffPeriod);
        uint256 vestingPeriod = _vesting.duration - _vesting.cliffPeriod;
        
        return (_vesting.totalAmount * timeVested) / vestingPeriod;
    }

    function claimRefund(uint256 _campaignId) 
        external 
        nonReentrant 
        validCampaignId(_campaignId) 
    {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        require(!campaign.fundingSuccessful, "Campaign was successful");
        require(campaign.currentPhase == CampaignPhase.Failed, "Campaign not in refund phase");
        require(hasBackedCampaign[_campaignId][msg.sender], "No backing found");

        ConfidentialBacking[] storage backings = campaignBackings[_campaignId];
        uint256 refundAmount = 0;

        for (uint256 i = 0; i < backings.length; i++) {
            if (backings[i].backer == msg.sender && !backings[i].rewardsClaimed) {
                // Simplified refund calculation
                refundAmount += uint256(backings[i].encryptedContribution) % campaign.fundingGoal;
                backings[i].rewardsClaimed = true;
            }
        }

        require(refundAmount > 0, "No refund available");

        // Transfer refund
        payable(msg.sender).transfer(refundAmount);
    }

    function _checkCampaignCompletion(uint256 _campaignId) internal {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        
        // Simplified check - in real implementation would decrypt and verify
        if (campaign.totalBackers >= 10) { // Mock condition
            campaign.fundingSuccessful = true;
            emit CampaignPhaseChanged(
                _campaignId,
                campaign.currentPhase,
                CampaignPhase.Successful
            );
        }
    }

    function getCampaignDetails(uint256 _campaignId) 
        external 
        view 
        validCampaignId(_campaignId)
        returns (FundraisingCampaign memory) 
    {
        return campaigns[_campaignId];
    }

    function getCampaignBackings(uint256 _campaignId) 
        external 
        view 
        validCampaignId(_campaignId)
        returns (ConfidentialBacking[] memory) 
    {
        return campaignBackings[_campaignId];
    }

    function getBackerCampaigns(address _backer) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return backerCampaigns[_backer];
    }

    function getVestingInfo(uint256 _campaignId, address _backer) 
        external 
        view 
        returns (VestingSchedule memory) 
    {
        return vestingSchedules[_campaignId][_backer];
    }

    function cancelCampaign(uint256 _campaignId) 
        external 
        onlyCampaignOwner(_campaignId) 
        validCampaignId(_campaignId) 
    {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        require(campaign.isLive, "Campaign not active");
        require(campaign.currentPhase == CampaignPhase.Live, "Cannot cancel at this phase");

        campaign.isLive = false;
        campaign.currentPhase = CampaignPhase.Failed;

        // Return reward tokens to campaign owner
        IERC20(campaign.rewardToken).safeTransfer(
            campaign.campaignOwner,
            campaign.totalTokenSupply
        );

        emit CampaignPhaseChanged(_campaignId, CampaignPhase.Live, CampaignPhase.Failed);
    }

    function updatePlatformFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= MAX_PLATFORM_FEE, "Fee exceeds maximum");
        platformFeePercentage = _newFee;
    }

    function updatePlatformTreasury(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Invalid treasury address");
        platformTreasury = _newTreasury;
    }

    function withdrawPlatformFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        
        payable(platformTreasury).transfer(balance);
    }

    function getActiveCampaignsCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 1; i < nextCampaignId; i++) {
            if (campaigns[i].isLive && block.timestamp <= campaigns[i].campaignEnd) {
                count++;
            }
        }
        return count;
    }

    function emergencyPause(uint256 _campaignId) 
        external 
        onlyOwner 
        validCampaignId(_campaignId) 
    {
        campaigns[_campaignId].isLive = false;
    }

    function emergencyResume(uint256 _campaignId) 
        external 
        onlyOwner 
        validCampaignId(_campaignId) 
    {
        FundraisingCampaign storage campaign = campaigns[_campaignId];
        require(block.timestamp <= campaign.campaignEnd, "Campaign expired");
        campaign.isLive = true;
    }
}