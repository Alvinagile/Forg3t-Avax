import {
  createPublicClient,
  createWalletClient,
  http,
} from "npm:viem@2.41.2";
import { privateKeyToAccount } from "npm:viem@2.41.2/accounts";
import { avalanche, avalancheFuji } from "npm:viem@2.41.2/chains";
import { HttpError } from "./errors.ts";

export type AvalancheNetwork = "fuji" | "mainnet";

const evidenceAnchorAbi = [
  {
    name: "submitEvidence",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "artifactHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "readEvidence",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      { name: "artifactHash", type: "bytes32" },
      { name: "submitter", type: "address" },
      { name: "timestamp", type: "uint64" },
    ],
  },
  {
    name: "evidenceExists",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

interface AvalancheConfig {
  network: AvalancheNetwork;
  chainId: number;
  rpcUrl: string;
  contractAddress: `0x${string}`;
  explorerBaseUrl: string;
  confirmations: number;
}

function getSelectedNetwork(override?: AvalancheNetwork): AvalancheNetwork {
  const value = override ?? (Deno.env.get("AVALANCHE_ANCHOR_NETWORK") as AvalancheNetwork | null) ?? "fuji";

  if (value !== "fuji" && value !== "mainnet") {
    throw new HttpError(500, "Unsupported Avalanche network configuration");
  }

  return value;
}

export function getAvalancheConfig(override?: AvalancheNetwork): AvalancheConfig {
  const network = getSelectedNetwork(override);
  const rpcUrl = network === "mainnet"
    ? Deno.env.get("AVALANCHE_MAINNET_RPC_URL") ?? "https://api.avax.network/ext/bc/C/rpc"
    : Deno.env.get("AVALANCHE_FUJI_RPC_URL") ?? "https://api.avax-test.network/ext/bc/C/rpc";
  const contractAddress = network === "mainnet"
    ? Deno.env.get("AVALANCHE_MAINNET_CONTRACT_ADDRESS")
    : Deno.env.get("AVALANCHE_FUJI_CONTRACT_ADDRESS");
  const chainId = network === "mainnet"
    ? Number(Deno.env.get("AVALANCHE_MAINNET_CHAIN_ID") ?? "43114")
    : Number(Deno.env.get("AVALANCHE_FUJI_CHAIN_ID") ?? "43113");
  const confirmations = Number(Deno.env.get("AVALANCHE_CONFIRMATIONS_REQUIRED") ?? "1");

  if (!contractAddress) {
    throw new HttpError(500, `Missing contract address for Avalanche ${network}`);
  }

  return {
    network,
    chainId,
    rpcUrl,
    contractAddress: contractAddress as `0x${string}`,
    explorerBaseUrl: network === "mainnet" ? "https://snowtrace.io" : "https://testnet.snowtrace.io",
    confirmations,
  };
}

function getChain(config: AvalancheConfig) {
  return config.network === "mainnet" ? avalanche : avalancheFuji;
}

function getAccount() {
  const privateKey = Deno.env.get("AVALANCHE_ANCHOR_PRIVATE_KEY");

  if (!privateKey) {
    throw new HttpError(500, "Missing AVALANCHE_ANCHOR_PRIVATE_KEY");
  }

  return privateKeyToAccount(privateKey as `0x${string}`);
}

export function getExplorerUrl(transactionHash: string, override?: AvalancheNetwork) {
  const config = getAvalancheConfig(override);
  return `${config.explorerBaseUrl}/tx/${transactionHash}`;
}

function createClients(override?: AvalancheNetwork) {
  const config = getAvalancheConfig(override);
  const chain = getChain(config);
  const account = getAccount();

  return {
    config,
    account,
    publicClient: createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    }),
    walletClient: createWalletClient({
      account,
      chain,
      transport: http(config.rpcUrl),
    }),
  };
}

export async function submitEvidenceCommitment(
  jobHash: `0x${string}`,
  evidenceHash: `0x${string}`,
  override?: AvalancheNetwork,
) {
  const { config, account, publicClient, walletClient } = createClients(override);
  const transactionHash = await walletClient.writeContract({
    address: config.contractAddress,
    abi: evidenceAnchorAbi,
    functionName: "submitEvidence",
    args: [jobHash, evidenceHash],
  });

  const receipt = await (async () => {
    try {
    const settled = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: config.confirmations,
      timeout: 25_000,
    });

    return {
      blockNumber: settled.blockNumber,
      status: settled.status,
    };
    } catch {
      return null;
    }
  })();

  return {
    config,
    account,
    transactionHash,
    receipt,
  };
}

export async function getTransactionStatus(
  transactionHash: `0x${string}`,
  override?: AvalancheNetwork,
) {
  const { config, publicClient } = createClients(override);

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: transactionHash,
    });

    return {
      found: true,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      chainId: config.chainId,
      network: config.network,
      explorerUrl: getExplorerUrl(transactionHash, config.network),
    };
  } catch {
    return {
      found: false,
      status: "pending" as const,
      blockNumber: null,
      chainId: config.chainId,
      network: config.network,
      explorerUrl: getExplorerUrl(transactionHash, config.network),
    };
  }
}

export async function readAnchoredEvidence(
  jobHash: `0x${string}`,
  override?: AvalancheNetwork,
) {
  const { config, publicClient } = createClients(override);

  const [artifactHash, submitter, timestamp] = await publicClient.readContract({
    address: config.contractAddress,
    abi: evidenceAnchorAbi,
    functionName: "readEvidence",
    args: [jobHash],
  }) as [`0x${string}`, `0x${string}`, bigint];

  return {
    artifactHash,
    submitter,
    timestamp: Number(timestamp),
    chainId: config.chainId,
    network: config.network,
    contractAddress: config.contractAddress,
  };
}
