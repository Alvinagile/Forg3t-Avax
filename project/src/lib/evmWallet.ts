import { createWalletClient, custom, type WalletClient, type Chain } from "viem";
import { chain } from "../services/clientService";

export async function getBraveWalletClient(chainParam?: Chain): Promise<{
  walletClient: WalletClient;
  address: `0x${string}`;
}> {
  // Check if ethereum provider is available
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    throw new Error("No EVM wallet provider found. Open in Brave with wallet enabled.");
  }

  // Request accounts from the wallet
  const accounts: string[] = await ethereum.request({
    method: "eth_requestAccounts",
  });

  if (!accounts || accounts.length === 0) {
    throw new Error("No account returned from Brave wallet.");
  }

  const address = accounts[0] as `0x${string}`;

  // Use the provided chain or default to the configured chain
  const chainToUse = chainParam || chain;

  const walletClient = createWalletClient({
    account: address,
    chain: chainToUse,
    transport: custom(ethereum),
  });

  return { walletClient, address };
}