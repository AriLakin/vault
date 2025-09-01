// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

library ConfidentialUtils {
    
    struct EncryptedData {
        bytes32 data;
        bytes proof;
        uint256 nonce;
        bool isValid;
    }

    struct RangeProof {
        bytes32 commitment;
        bytes proof;
        uint256 minValue;
        uint256 maxValue;
    }

    event EncryptionPerformed(
        address indexed user,
        bytes32 encryptedData,
        uint256 timestamp
    );

    event ProofVerified(
        bytes32 indexed dataHash,
        bool isValid,
        uint256 timestamp
    );

    function createEncryption(
        uint256 _value,
        uint256 _nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_value, _nonce, block.timestamp));
    }

    function verifyEncryptedValue(
        bytes32 _encryptedData,
        bytes memory _proof,
        address _verifier
    ) internal pure returns (bool) {
        bytes32 proofHash = keccak256(abi.encodePacked(_proof, _verifier));
        return proofHash != bytes32(0) && _encryptedData != bytes32(0);
    }

    function createRangeProof(
        uint256 _value,
        uint256 _min,
        uint256 _max,
        uint256 _nonce
    ) internal pure returns (RangeProof memory) {
        require(_value >= _min && _value <= _max, "Value out of range");
        
        bytes32 commitment = keccak256(abi.encodePacked(_value, _nonce));
        bytes memory proof = abi.encodePacked(_min, _max, _value, _nonce);
        
        return RangeProof({
            commitment: commitment,
            proof: proof,
            minValue: _min,
            maxValue: _max
        });
    }

    function verifyRangeProof(
        RangeProof memory _rangeProof
    ) internal pure returns (bool) {
        return _rangeProof.commitment != bytes32(0) && 
               _rangeProof.proof.length > 0 &&
               _rangeProof.maxValue >= _rangeProof.minValue;
    }

    function addEncrypted(
        bytes32 _encrypted1,
        bytes32 _encrypted2
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_encrypted1, _encrypted2));
    }

    function subtractEncrypted(
        bytes32 _encrypted1,
        bytes32 _encrypted2
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_encrypted1, _encrypted2, "subtract"));
    }

    function multiplyEncrypted(
        bytes32 _encrypted,
        uint256 _scalar
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_encrypted, _scalar, "multiply"));
    }

    function compareEncrypted(
        bytes32 _encrypted1,
        bytes32 _encrypted2
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_encrypted1, _encrypted2, "compare"));
    }

    function decryptValue(
        bytes32 _encryptedData,
        bytes memory _privateKey,
        address _authorizedUser
    ) internal view returns (uint256) {
        require(msg.sender == _authorizedUser, "Unauthorized decryption");
        
        uint256 mockDecrypted = uint256(keccak256(abi.encodePacked(
            _encryptedData,
            _privateKey,
            _authorizedUser,
            block.timestamp
        ))) % 1000000;
        
        return mockDecrypted;
    }

    function generateZKProof(
        uint256 _value,
        uint256 _secret
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            keccak256(abi.encodePacked(_value, _secret)),
            _value,
            _secret
        );
    }

    function verifyZKProof(
        bytes memory _proof,
        uint256 _publicValue
    ) internal pure returns (bool) {
        if (_proof.length < 96) return false;
        
        bytes32 hash;
        uint256 value;
        uint256 secret;
        
        assembly {
            hash := mload(add(_proof, 32))
            value := mload(add(_proof, 64))
            secret := mload(add(_proof, 96))
        }
        
        bytes32 expectedHash = keccak256(abi.encodePacked(value, secret));
        return hash == expectedHash && value == _publicValue;
    }

    function batchEncrypt(
        uint256[] memory _values,
        uint256 _nonce
    ) internal pure returns (bytes32[] memory) {
        bytes32[] memory encrypted = new bytes32[](_values.length);
        
        for (uint256 i = 0; i < _values.length; i++) {
            encrypted[i] = createEncryption(_values[i], _nonce + i);
        }
        
        return encrypted;
    }

    function computeEncryptedSum(
        bytes32[] memory _encryptedValues
    ) internal pure returns (bytes32) {
        bytes32 sum = _encryptedValues[0];
        
        for (uint256 i = 1; i < _encryptedValues.length; i++) {
            sum = addEncrypted(sum, _encryptedValues[i]);
        }
        
        return sum;
    }

    function isValidEncryption(
        bytes32 _encryptedData
    ) internal pure returns (bool) {
        return _encryptedData != bytes32(0);
    }

    function createTimestampedProof(
        bytes32 _data,
        uint256 _timestamp
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(_data, _timestamp, keccak256(abi.encodePacked(_data, _timestamp)));
    }

    function verifyTimestampedProof(
        bytes memory _proof,
        uint256 _maxAge
    ) internal view returns (bool) {
        if (_proof.length != 96) return false;
        
        bytes32 data;
        uint256 timestamp;
        bytes32 hash;
        
        assembly {
            data := mload(add(_proof, 32))
            timestamp := mload(add(_proof, 64))
            hash := mload(add(_proof, 96))
        }
        
        bytes32 expectedHash = keccak256(abi.encodePacked(data, timestamp));
        bool validHash = hash == expectedHash;
        bool validTime = (block.timestamp - timestamp) <= _maxAge;
        
        return validHash && validTime;
    }
}