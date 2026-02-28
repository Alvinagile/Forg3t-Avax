/**
 * avalancheAnchor.ts
 * Forg3t Protocol — Avalanche C-Chain evidence anchoring service.
 *
 * Uses viem to interact with ForgEvidenceAnchor.sol on Avalanche Mainnet.
 * No centralised storage. Evidence is computed locally and anchored purely on-chain.
 */

import {
    createPublicClient,
    createWalletClient,
    custom,
    http,
    keccak256,
} from 'viem';
import { avalanche } from 'viem/chains';

// ─── Contract config ──────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = (
    import.meta.env.VITE_ANCHOR_CONTRACT_ADDRESS ?? ''
) as `0x${string}`;

/** Minimal ABI — only the functions used by this service. */
const ABI = [
    {
        name: 'submitEvidence',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'jobId', type: 'bytes32' },
            { name: 'artifactHash', type: 'bytes32' },
        ],
        outputs: [],
    },
    {
        name: 'readEvidence',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'jobId', type: 'bytes32' }],
        outputs: [
            { name: 'artifactHash', type: 'bytes32' },
            { name: 'submitter', type: 'address' },
            { name: 'timestamp', type: 'uint64' },
        ],
    },
    {
        name: 'evidenceExists',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'jobId', type: 'bytes32' }],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvidenceAnchor {
    /** bytes32 job identifier derived from the request UUID. */
    jobId: `0x${string}`;
    /** keccak256 of the PDF certificate bytes. */
    artifactHash: `0x${string}`;
    /** Avalanche C-Chain transaction hash. */
    txHash: `0x${string}`;
    /** Block number the transaction was included in. */
    blockNumber: bigint;
    /** Wallet address that submitted the evidence. */
    submitter: `0x${string}`;
    /** Unix timestamp (seconds) from block.timestamp on-chain. */
    timestamp: number;
}

export interface VerificationResult {
    /** True when the local hash matches the on-chain hash exactly. */
    verified: boolean;
    /** keccak256 stored on-chain. */
    onChainHash: `0x${string}`;
    /** keccak256 computed locally from the artifact. */
    localHash: `0x${string}`;
    /** Wallet that originally submitted. */
    submitter: `0x${string}`;
    /** On-chain timestamp (unix seconds). */
    timestamp: number;
}

// ─── Internal clients ─────────────────────────────────────────────────────────

function publicClient() {
    return createPublicClient({
        chain: avalanche,
        transport: http('https://api.avax.network/ext/bc/C/rpc'),
    });
}

function walletClient() {
    if (!window.ethereum) {
        throw new Error('No Ethereum provider found. Connect a wallet (e.g. Core, MetaMask).');
    }
    return createWalletClient({
        chain: avalanche,
        transport: custom(window.ethereum),
    });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Compute keccak256 of a Blob (the PDF evidence artifact).
 * This is the value stored on-chain as artifactHash.
 */
export async function computeArtifactHash(blob: Blob): Promise<`0x${string}`> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return keccak256(bytes);
}

/**
 * Derive a deterministic bytes32 jobId from a string identifier (the request UUID).
 * jobId = keccak256(utf8(identifier))
 */
export function deriveJobId(identifier: string): `0x${string}` {
    const encoder = new TextEncoder();
    return keccak256(encoder.encode(identifier));
}

/**
 * Return a Snowtrace explorer URL for a given transaction hash.
 */
export function snowtraceUrl(txHash: `0x${string}`): string {
    return `https://snowtrace.io/tx/${txHash}`;
}

// ─── On-chain actions ─────────────────────────────────────────────────────────

/**
 * Submit evidence to ForgEvidenceAnchor on Avalanche C-Chain.
 * Waits for receipt and returns the full EvidenceAnchor record.
 */
export async function submitEvidence(
    jobId: `0x${string}`,
    artifactHash: `0x${string}`,
): Promise<EvidenceAnchor> {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x') {
        throw new Error(
            'VITE_ANCHOR_CONTRACT_ADDRESS is not configured. Deploy the contract first.',
        );
    }

    const wc = walletClient();
    const pc = publicClient();
    const [account] = await wc.getAddresses();

    const txHash = await wc.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'submitEvidence',
        args: [jobId, artifactHash],
    });

    const receipt = await pc.waitForTransactionReceipt({ hash: txHash });

    // Read back the on-chain timestamp for accuracy
    const [, , onChainTs] = await pc.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'readEvidence',
        args: [jobId],
    }) as [`0x${string}`, `0x${string}`, bigint];

    return {
        jobId,
        artifactHash,
        txHash,
        blockNumber: receipt.blockNumber,
        submitter: account,
        timestamp: Number(onChainTs),
    };
}

/**
 * Verify evidence on-chain by comparing a locally computed hash against the stored record.
 * Does not require a wallet — uses a public read.
 */
export async function verifyEvidence(
    jobId: `0x${string}`,
    localHash: `0x${string}`,
): Promise<VerificationResult> {
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x') {
        throw new Error('VITE_ANCHOR_CONTRACT_ADDRESS is not configured.');
    }

    const pc = publicClient();

    const [onChainHash, submitter, timestampBig] = await pc.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'readEvidence',
        args: [jobId],
    }) as [`0x${string}`, `0x${string}`, bigint];

    return {
        verified: onChainHash.toLowerCase() === localHash.toLowerCase(),
        onChainHash: onChainHash as `0x${string}`,
        localHash,
        submitter: submitter as `0x${string}`,
        timestamp: Number(timestampBig),
    };
}
