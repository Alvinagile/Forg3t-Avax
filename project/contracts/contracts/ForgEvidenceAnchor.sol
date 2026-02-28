// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title  ForgEvidenceAnchor
/// @author Forg3t Protocol
/// @notice Immutable on-chain anchoring of AI suppression evidence on Avalanche C-Chain.
///         Any wallet may submit evidence. Records are permanent and cannot be modified or deleted.
///         Validator attestation is reserved as a future protocol extension.
/// @dev    Gas-optimised via tight struct packing:
///           slot 0 — artifactHash  (bytes32, 32 bytes)
///           slot 1 — submitter     (address, 20 bytes) + timestamp (uint64, 8 bytes) = 28 bytes
///         Uses custom errors, calldata inputs, and eliminates redundant storage slots.
///         Non-upgradeable. Owner may transfer or renounce ownership only.
contract ForgEvidenceAnchor is Ownable {

    // ─── Types ────────────────────────────────────────────────────────────────

    /// @dev Packed into 2 storage slots for minimal SLOAD/SSTORE cost.
    struct EvidenceRecord {
        bytes32 artifactHash; /// @dev keccak256 of the off-chain evidence artifact.
        address submitter;    /// @dev Wallet that anchored the evidence. Zero = not submitted.
        uint64  timestamp;    /// @dev block.timestamp at submission. Valid through year 584,544.
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    /// @dev jobId => EvidenceRecord. A zero submitter address signals absence — no separate
    ///      existence mapping required, saving one SSTORE (21,000 gas) per submission.
    mapping(bytes32 => EvidenceRecord) private _records;

    // ─── Errors ───────────────────────────────────────────────────────────────

    /// @notice jobId must not be zero.
    error InvalidJobId();

    /// @notice artifactHash must not be zero.
    error InvalidArtifactHash();

    /// @notice Evidence for this jobId has already been submitted and is immutable.
    /// @param jobId The duplicate job identifier.
    error EvidenceAlreadyExists(bytes32 jobId);

    /// @notice jobId has no evidence record.
    /// @param jobId The queried job identifier.
    error EvidenceNotFound(bytes32 jobId);

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when new evidence is successfully anchored on-chain.
    /// @param jobId        Unique suppression job identifier (bytes32).
    /// @param artifactHash keccak256 hash of the off-chain evidence artifact.
    /// @param submitter    Wallet address that submitted the evidence.
    /// @param timestamp    Block timestamp at submission (uint64).
    event EvidenceSubmitted(
        bytes32 indexed jobId,
        bytes32 indexed artifactHash,
        address indexed submitter,
        uint64          timestamp
    );

    // Future extension — not active in this version:
    // event ValidatorAttested(bytes32 indexed jobId, address indexed validator, uint64 timestamp);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param initialOwner Address that will own the contract.
    ///                     Owner may transfer ownership or renounce — no other privileged actions.
    constructor(address initialOwner) Ownable(initialOwner) {}

    // ─── External — Write ─────────────────────────────────────────────────────

    /// @notice Anchor AI suppression evidence on Avalanche C-Chain.
    /// @dev    Open to any wallet. Evidence is immutable once written.
    ///         Reverts if jobId or artifactHash is zero, or if the jobId already exists.
    ///         jobId should be derived off-chain as keccak256(requestId).
    ///         artifactHash should be keccak256(evidenceArtifactBytes).
    /// @param jobId        Unique bytes32 identifier for the suppression job.
    /// @param artifactHash keccak256 hash of the off-chain evidence artifact.
    function submitEvidence(bytes32 jobId, bytes32 artifactHash) external {
        if (jobId        == bytes32(0)) revert InvalidJobId();
        if (artifactHash == bytes32(0)) revert InvalidArtifactHash();
        if (_records[jobId].submitter != address(0)) revert EvidenceAlreadyExists(jobId);

        uint64 ts = uint64(block.timestamp);

        _records[jobId] = EvidenceRecord({
            artifactHash: artifactHash,
            submitter:    msg.sender,
            timestamp:    ts
        });

        emit EvidenceSubmitted(jobId, artifactHash, msg.sender, ts);
    }

    // ─── External — Read ──────────────────────────────────────────────────────

    /// @notice Read the on-chain evidence record for a given jobId.
    /// @param  jobId       The suppression job identifier.
    /// @return artifactHash keccak256 hash of the off-chain evidence artifact.
    /// @return submitter    Wallet address that submitted the evidence.
    /// @return timestamp    Block timestamp (unix seconds) when evidence was anchored.
    function readEvidence(bytes32 jobId)
        external
        view
        returns (bytes32 artifactHash, address submitter, uint64 timestamp)
    {
        EvidenceRecord storage rec = _records[jobId];
        if (rec.submitter == address(0)) revert EvidenceNotFound(jobId);
        return (rec.artifactHash, rec.submitter, rec.timestamp);
    }

    /// @notice Check whether evidence has been submitted for a given jobId.
    /// @param  jobId The suppression job identifier.
    /// @return       True if evidence exists, false otherwise.
    function evidenceExists(bytes32 jobId) external view returns (bool) {
        return _records[jobId].submitter != address(0);
    }
}
