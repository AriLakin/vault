// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract CampaignManager is AccessControl, Pausable {
    
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant CAMPAIGN_CREATOR_ROLE = keccak256("CAMPAIGN_CREATOR_ROLE");

    struct CampaignMetadata {
        uint256 campaignId;
        string name;
        string description;
        string websiteUrl;
        string whitepaperUrl;
        string[] socialMediaLinks;
        bytes32 logoHash;
        address creator;
        uint256 createdAt;
        uint256 updatedAt;
        VerificationStatus verification;
        ReputationScore reputation;
        bool isActive;
    }

    struct VerificationStatus {
        bool kycCompleted;
        bool auditCompleted;
        bool legalCompleted;
        address verifiedBy;
        uint256 verificationDate;
        string verificationNotes;
    }

    struct ReputationScore {
        uint256 totalScore;
        uint256 communityVotes;
        uint256 expertReviews;
        uint256 successfulCampaigns;
        uint256 lastUpdated;
    }

    mapping(uint256 => CampaignMetadata) public campaignMetadata;
    mapping(address => uint256[]) public creatorCampaigns;
    mapping(uint256 => bool) public verifiedCampaigns;
    mapping(address => ReputationScore) public creatorReputation;
    
    uint256 public nextCampaignId = 1;
    uint256 public verificationFee = 0.1 ether;
    uint256 public constant MIN_REPUTATION_SCORE = 100;
    uint256 public constant MAX_CAMPAIGNS_PER_CREATOR = 10;

    event CampaignRegistered(
        uint256 indexed campaignId,
        address indexed creator,
        string name,
        uint256 timestamp
    );

    event CampaignVerified(
        uint256 indexed campaignId,
        address indexed verifier,
        VerificationStatus verification
    );

    event ReputationUpdated(
        address indexed creator,
        uint256 oldScore,
        uint256 newScore,
        uint256 timestamp
    );

    event MetadataUpdated(
        uint256 indexed campaignId,
        address indexed updater,
        uint256 timestamp
    );

    modifier onlyCampaignCreator(uint256 _campaignId) {
        require(
            campaignMetadata[_campaignId].creator == msg.sender,
            "Not campaign creator"
        );
        _;
    }

    modifier validCampaignId(uint256 _campaignId) {
        require(
            _campaignId > 0 && _campaignId < nextCampaignId,
            "Invalid campaign ID"
        );
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
        _grantRole(CAMPAIGN_CREATOR_ROLE, msg.sender);
    }

    function registerCampaign(
        string memory _name,
        string memory _description,
        string memory _websiteUrl,
        string memory _whitepaperUrl,
        string[] memory _socialMediaLinks,
        bytes32 _logoHash
    ) external whenNotPaused returns (uint256) {
        require(bytes(_name).length > 0, "Campaign name required");
        require(bytes(_description).length > 0, "Campaign description required");
        require(
            creatorCampaigns[msg.sender].length < MAX_CAMPAIGNS_PER_CREATOR,
            "Max campaigns limit reached"
        );

        uint256 campaignId = nextCampaignId++;

        campaignMetadata[campaignId] = CampaignMetadata({
            campaignId: campaignId,
            name: _name,
            description: _description,
            websiteUrl: _websiteUrl,
            whitepaperUrl: _whitepaperUrl,
            socialMediaLinks: _socialMediaLinks,
            logoHash: _logoHash,
            creator: msg.sender,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            verification: VerificationStatus({
                kycCompleted: false,
                auditCompleted: false,
                legalCompleted: false,
                verifiedBy: address(0),
                verificationDate: 0,
                verificationNotes: ""
            }),
            reputation: ReputationScore({
                totalScore: 50, // Starting score
                communityVotes: 0,
                expertReviews: 0,
                successfulCampaigns: 0,
                lastUpdated: block.timestamp
            }),
            isActive: true
        });

        creatorCampaigns[msg.sender].push(campaignId);
        
        if (!hasRole(CAMPAIGN_CREATOR_ROLE, msg.sender)) {
            _grantRole(CAMPAIGN_CREATOR_ROLE, msg.sender);
        }

        emit CampaignRegistered(campaignId, msg.sender, _name, block.timestamp);
        return campaignId;
    }

    function verifyCampaign(
        uint256 _campaignId,
        bool _kycCompleted,
        bool _auditCompleted,
        bool _legalCompleted,
        string memory _verificationNotes
    ) external onlyRole(VERIFIER_ROLE) validCampaignId(_campaignId) {
        CampaignMetadata storage campaign = campaignMetadata[_campaignId];
        
        campaign.verification = VerificationStatus({
            kycCompleted: _kycCompleted,
            auditCompleted: _auditCompleted,
            legalCompleted: _legalCompleted,
            verifiedBy: msg.sender,
            verificationDate: block.timestamp,
            verificationNotes: _verificationNotes
        });

        campaign.updatedAt = block.timestamp;

        bool fullyVerified = _kycCompleted && _auditCompleted && _legalCompleted;
        verifiedCampaigns[_campaignId] = fullyVerified;

        if (fullyVerified) {
            _updateCreatorReputation(campaign.creator, 50, true);
        }

        emit CampaignVerified(_campaignId, msg.sender, campaign.verification);
    }

    function updateCampaignMetadata(
        uint256 _campaignId,
        string memory _name,
        string memory _description,
        string memory _websiteUrl,
        string memory _whitepaperUrl,
        string[] memory _socialMediaLinks,
        bytes32 _logoHash
    ) external onlyCampaignCreator(_campaignId) validCampaignId(_campaignId) {
        CampaignMetadata storage campaign = campaignMetadata[_campaignId];
        
        campaign.name = _name;
        campaign.description = _description;
        campaign.websiteUrl = _websiteUrl;
        campaign.whitepaperUrl = _whitepaperUrl;
        campaign.socialMediaLinks = _socialMediaLinks;
        campaign.logoHash = _logoHash;
        campaign.updatedAt = block.timestamp;

        emit MetadataUpdated(_campaignId, msg.sender, block.timestamp);
    }

    function updateCreatorReputation(
        address _creator,
        uint256 _scoreChange,
        bool _increase
    ) external onlyRole(VERIFIER_ROLE) {
        _updateCreatorReputation(_creator, _scoreChange, _increase);
    }

    function _updateCreatorReputation(
        address _creator,
        uint256 _scoreChange,
        bool _increase
    ) internal {
        ReputationScore storage reputation = creatorReputation[_creator];
        uint256 oldScore = reputation.totalScore;
        
        if (_increase) {
            reputation.totalScore += _scoreChange;
        } else {
            if (reputation.totalScore >= _scoreChange) {
                reputation.totalScore -= _scoreChange;
            } else {
                reputation.totalScore = 0;
            }
        }
        
        reputation.lastUpdated = block.timestamp;
        
        emit ReputationUpdated(_creator, oldScore, reputation.totalScore, block.timestamp);
    }

    function recordSuccessfulCampaign(address _creator) external onlyRole(VERIFIER_ROLE) {
        ReputationScore storage reputation = creatorReputation[_creator];
        reputation.successfulCampaigns++;
        reputation.totalScore += 100; // Bonus for successful campaign
        reputation.lastUpdated = block.timestamp;
        
        emit ReputationUpdated(_creator, reputation.totalScore - 100, reputation.totalScore, block.timestamp);
    }

    function getCampaignMetadata(uint256 _campaignId) 
        external 
        view 
        validCampaignId(_campaignId)
        returns (CampaignMetadata memory) 
    {
        return campaignMetadata[_campaignId];
    }

    function getCreatorCampaigns(address _creator) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return creatorCampaigns[_creator];
    }

    function getVerifiedCampaigns() external view returns (uint256[] memory) {
        uint256 verifiedCount = 0;
        
        // Count verified campaigns
        for (uint256 i = 1; i < nextCampaignId; i++) {
            if (verifiedCampaigns[i]) {
                verifiedCount++;
            }
        }
        
        // Create array of verified campaign IDs
        uint256[] memory verified = new uint256[](verifiedCount);
        uint256 index = 0;
        
        for (uint256 i = 1; i < nextCampaignId; i++) {
            if (verifiedCampaigns[i]) {
                verified[index] = i;
                index++;
            }
        }
        
        return verified;
    }

    function isCreatorEligible(address _creator) external view returns (bool) {
        return creatorReputation[_creator].totalScore >= MIN_REPUTATION_SCORE;
    }

    function isCampaignVerified(uint256 _campaignId) 
        external 
        view 
        validCampaignId(_campaignId)
        returns (bool) 
    {
        return verifiedCampaigns[_campaignId];
    }

    function pauseCampaign(uint256 _campaignId) 
        external 
        onlyCampaignCreator(_campaignId) 
        validCampaignId(_campaignId) 
    {
        campaignMetadata[_campaignId].isActive = false;
        campaignMetadata[_campaignId].updatedAt = block.timestamp;
    }

    function resumeCampaign(uint256 _campaignId) 
        external 
        onlyCampaignCreator(_campaignId) 
        validCampaignId(_campaignId) 
    {
        campaignMetadata[_campaignId].isActive = true;
        campaignMetadata[_campaignId].updatedAt = block.timestamp;
    }

    function setVerificationFee(uint256 _newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        verificationFee = _newFee;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}