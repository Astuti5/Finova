// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Stores ledger checkpoint hashes only. No personal or financial details go on-chain.
///
/// Two roles, so that the key which lives on a server is not the key that controls the contract:
///   owner     - cold key (ideally a multisig). Can replace the anchorer and hand over ownership. Cannot anchor.
///   anchorer  - hot key used by the backend. Can only publish checkpoints. If it leaks, the owner swaps it.
///
/// Anchors are append-only and can never be edited or deleted. Anyone can read every checkpoint (anchorAt),
/// which is what lets a third party detect a database that was truncated or rewritten.
contract FinovaAnchor {
    struct Anchor { bytes32 recordHash; uint64 seq; uint64 timestamp; }

    address public owner;
    address public pendingOwner;
    address public anchorer;
    mapping(bytes32 => Anchor[]) private _anchors; // circleKey => checkpoints, oldest first

    event Anchored(bytes32 indexed circleKey, uint64 indexed seq, bytes32 recordHash);
    event AnchorerChanged(address indexed previousAnchorer, address indexed newAnchorer);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotAnchorer();
    error SeqNotIncreasing();
    error ZeroAddress();
    error ZeroHash();
    error NoAnchors();
    error IndexOutOfRange();

    constructor(address initialAnchorer) {
        if (initialAnchorer == address(0)) revert ZeroAddress();
        owner = msg.sender;
        anchorer = initialAnchorer;
        emit AnchorerChanged(address(0), initialAnchorer);
    }

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    function anchor(bytes32 circleKey, uint64 seq, bytes32 recordHash) external {
        if (msg.sender != anchorer) revert NotAnchorer();
        if (recordHash == bytes32(0)) revert ZeroHash();
        Anchor[] storage a = _anchors[circleKey];
        if (a.length > 0 && seq <= a[a.length - 1].seq) revert SeqNotIncreasing();
        a.push(Anchor(recordHash, seq, uint64(block.timestamp)));
        emit Anchored(circleKey, seq, recordHash);
    }

    function count(bytes32 circleKey) external view returns (uint256) { return _anchors[circleKey].length; }

    function anchorAt(bytes32 circleKey, uint256 index) external view returns (Anchor memory) {
        Anchor[] storage a = _anchors[circleKey];
        if (index >= a.length) revert IndexOutOfRange();
        return a[index];
    }

    function latest(bytes32 circleKey) external view returns (Anchor memory) {
        Anchor[] storage a = _anchors[circleKey];
        if (a.length == 0) revert NoAnchors();
        return a[a.length - 1];
    }

    function setAnchorer(address newAnchorer) external onlyOwner {
        if (newAnchorer == address(0)) revert ZeroAddress();
        emit AnchorerChanged(anchorer, newAnchorer);
        anchorer = newAnchorer;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
