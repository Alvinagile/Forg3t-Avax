import { defineConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY: string = process.env.DEPLOYER_PRIVATE_KEY ?? "";
export default defineConfig({
    plugins: [hardhatViem],
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: {
                enabled: true,
                runs: 10_000, // High runs — optimise for execution cost (low ongoing gas)
            },
            viaIR: true,   // IR pipeline: enables cross-function optimizations
        },
    },

    networks: {
        // Avalanche C-Chain Mainnet
        avalanche: {
            type: "http",
            url: "https://api.avax.network/ext/bc/C/rpc",
            chainId: 43114,
            accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
        },
        // Fuji testnet (for pre-flight checks)
        fuji: {
            type: "http",
            url: "https://api.avax-test.network/ext/bc/C/rpc",
            chainId: 43113,
            accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
        },
        hardhat: {
            type: "edr-simulated",
        },
    },
});
