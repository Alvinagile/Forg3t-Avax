import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY: string = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const SNOWTRACE_API_KEY: string = process.env.SNOWTRACE_API_KEY ?? "nokey";

const config: HardhatUserConfig = {
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
            url: "https://api.avax.network/ext/bc/C/rpc",
            chainId: 43114,
            accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
        },
        // Fuji testnet (for pre-flight checks)
        fuji: {
            url: "https://api.avax-test.network/ext/bc/C/rpc",
            chainId: 43113,
            accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY}`] : [],
        },
        hardhat: {},
    },

    etherscan: {
        apiKey: {
            avalanche: SNOWTRACE_API_KEY,
        },
        customChains: [
            {
                network: "avalanche",
                chainId: 43114,
                urls: {
                    apiURL: "https://api.snowtrace.io/api",
                    browserURL: "https://snowtrace.io",
                },
            },
        ],
    },

    gasReporter: {
        enabled: true,
        currency: "USD",
    },
};

export default config;
