import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
    // ── Validate inputs ──────────────────────────────────────────────────────
    const ownerAddress = process.env.OWNER_ADDRESS;
    if (!ownerAddress) {
        throw new Error("OWNER_ADDRESS is not set in .env");
    }
    if (!ethers.isAddress(ownerAddress)) {
        throw new Error(`OWNER_ADDRESS is not a valid address: ${ownerAddress}`);
    }

    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);

    console.log("─────────────────────────────────────────");
    console.log("  ForgEvidenceAnchor — Deployment");
    console.log("─────────────────────────────────────────");
    console.log("  Deployer :", deployer.address);
    console.log("  Balance  :", ethers.formatEther(balance), "AVAX");
    console.log("  Owner    :", ownerAddress);
    console.log("─────────────────────────────────────────");

    // ── Deploy ───────────────────────────────────────────────────────────────
    const Factory = await ethers.getContractFactory("ForgEvidenceAnchor");
    const contract = await Factory.deploy(ownerAddress);
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    const deployTx = contract.deploymentTransaction();
    const receipt = await deployTx?.wait();

    console.log("\n  ✔  Contract deployed");
    console.log("  Address     :", address);
    console.log("  Tx hash     :", deployTx?.hash);
    console.log("  Block       :", receipt?.blockNumber);
    console.log("  Gas used    :", receipt?.gasUsed?.toString());
    console.log("\n─────────────────────────────────────────");
    console.log("  Add to your frontend .env:");
    console.log(`  VITE_ANCHOR_CONTRACT_ADDRESS=${address}`);
    console.log("─────────────────────────────────────────\n");

    // ── Snowtrace verification hint ───────────────────────────────────────────
    const network = (await ethers.provider.getNetwork()).name;
    if (network !== "hardhat" && network !== "localhost") {
        console.log("  To verify on Snowtrace, run:");
        console.log(`  npx hardhat verify --network ${network} ${address} "${ownerAddress}"\n`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
