// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract STOV_Ledger {
    // This creates a mathematical dictionary mapping a Receipt ID to the Encrypted TenSEAL Ballot
    mapping(bytes32 => string) private secureBallots;

    // This broadcasts an alert to the blockchain network whenever a vote is cast
    event VoteRecorded(bytes32 receiptId, uint256 timestamp);

    // Function 1: Saving the vote (This costs "Gas" to run)
    function recordVote(bytes32 receiptId, string memory encryptedData) public {
        secureBallots[receiptId] = encryptedData;
        
        // "block.timestamp" is the exact, un-forgeable time the block was mined
        emit VoteRecorded(receiptId, block.timestamp);
    }

    // Function 2: Verifying the vote (This is free to run)
    function verifyVote(bytes32 receiptId) public view returns (string memory) {
        return secureBallots[receiptId];
    }
}