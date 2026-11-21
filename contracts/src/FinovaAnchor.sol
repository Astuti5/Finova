// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Stores ledger checkpoint hashes only. No personal or financial details go on-chain.
/// Testnet prototype: a single owner wallet is a trust risk and must not guard real funds.
contract FinovaAnchor {
    struct Anchor { bytes32 recordHash; uint64 seq; uint64 timestamp; }
    address public owner;
    address public pendingOwner;
    mapping(bytes32 => Anchor[]) private _anchors; // circleKey => checkpoints

    event Anchored(bytes32 indexed circleKey, uint64 indexed seq, bytes32 recordHash);
    error NotOwner();
    error SeqNotIncreasing();
    error ZeroAddress();
    error NoAnchors();

    constructor() { owner = msg.sender; }
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    function anchor(bytes32 circleKey, uint64 seq, bytes32 recordHash) external onlyOwner {
        Anchor[] storage a = _anchors[circleKey];
        if (a.length > 0 && seq <= a[a.length - 1].seq) revert SeqNotIncreasing();
        a.push(Anchor(recordHash, seq, uint64(block.timestamp)));
        emit Anchored(circleKey, seq, recordHash);
    }
    function count(bytes32 circleKey) external view returns (uint256) { return _anchors[circleKey].length; }
    function latest(bytes32 circleKey) external view returns (Anchor memory) {
        Anchor[] storage a = _anchors[circleKey];
        if (a.length == 0) revert NoAnchors();
        return a[a.length - 1];
    }
    function transferOwnership(address n) external onlyOwner { if (n == address(0)) revert ZeroAddress(); pendingOwner = n; }
    function acceptOwnership() external { if (msg.sender != pendingOwner) revert NotOwner(); owner = msg.sender; pendingOwner = address(0); }
}
