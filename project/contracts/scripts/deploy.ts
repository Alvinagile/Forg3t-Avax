import { network } from "hardhat";
import { formatEther, isAddress } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
    const ownerAddress = process.env.OWNER_ADDRESS;
    if (!ownerAddress) {
        throw new Error("OWNER_ADDRESS is not set in .env");
    }
    if (!isAddress(ownerAddress)) {
        throw new Error(`OWNER_ADDRESS is not a valid address: ${ownerAddress}`);
    }

    const connection = await network.create();
    const { viem } = connection;
    const publicClient = await viem.getPublicClient();
    const [deployer] = await viem.getWalletClients();

    if (!deployer?.account?.address) {
        throw new Error("No deployer account is configured for this network");
    }

    const balance = await publicClient.getBalance({
        address: deployer.account.address,
    });

    console.log("ForgEvidenceAnchor deployment");
    console.log("Network  :", connection.networkName);
    console.log("Deployer :", deployer.account.address);
    console.log("Balance  :", formatEther(balance), "AVAX");
    console.log("Owner    :", ownerAddress);

    const { contract, deploymentTransaction } =
        await viem.sendDeploymentTransaction("ForgEvidenceAnchor", [ownerAddress]);
    const receipt = await publicClient.waitForTransactionReceipt({
        hash: deploymentTransaction.hash,
    });

    console.log("\nContract deployed");
    console.log("Address :", contract.address);
    console.log("Tx hash :", deploymentTransaction.hash);
    console.log("Block   :", receipt.blockNumber.toString());
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("\nAdd to your frontend .env:");
    console.log(`VITE_ANCHOR_CONTRACT_ADDRESS=${contract.address}`);

    if (!["default", "hardhat", "localhost"].includes(connection.networkName)) {
        console.log("\nSnowtrace verification is manual after the Hardhat 3 migration.");
        console.log("Use the deployed address, constructor OWNER_ADDRESS, and the compiled artifact metadata.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
