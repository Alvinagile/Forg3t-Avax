import { PublicClient } from 'viem';

/**
 * Gas estimation utility for Data Haven transactions
 * Dynamically fetches current network base fee and calculates safe transaction fees
 */

export interface GasFees {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    estimatedCost: bigint;
}

/**
 * Estimate gas fees based on current network conditions
 * 
 * @param publicClient - Viem public client instance
 * @param estimatedGasLimit - Optional gas limit for cost calculation
 * @returns Gas fees with safety multiplier applied
 * 
 * Algorithm:
 * 1. Fetch latest block's baseFeePerGas from network
 * 2. Apply smart multiplier based on base fee (lower for )
 * 3. Cap maxPriorityFeePerGas to prevent excessive fees
 * 4. If estimation fails, fallback to conservative 20 Gwei / 10 Gwei
 */
export async function estimateGasFees(
    publicClient: PublicClient,
    estimatedGasLimit: bigint = BigInt(500_000)
): Promise<GasFees> {
    try {
        console.log('[GasEstimation] Fetching current network base fee...');

        // Get the latest block to read the current base fee
        const block = await publicClient.getBlock({ blockTag: 'latest' });

        if (!block.baseFeePerGas) {
            console.warn('[GasEstimation] Block does not contain baseFeePerGas, using fallback');
            return getFallbackGasFees(estimatedGasLimit);
        }

        const baseFeePerGas = block.baseFeePerGas;
        console.log('[GasEstimation] Current base fee:', formatGwei(baseFeePerGas), 'Gwei');

        // Smart multiplier: lower for high base fees , higher for low base fees
        const baseGwei = Number(baseFeePerGas) / 1_000_000_000;
        let multiplier: number;

        if (baseGwei > 500) {
            // Very high base fee : use 1.5x
            multiplier = 1.5;
        } else if (baseGwei > 100) {
            // High base fee: use 2x
            multiplier = 2.0;
        } else {
            // Normal base fee: use 3x
            multiplier = 3.0;
        }

        const maxFeePerGas = BigInt(Math.floor(Number(baseFeePerGas) * multiplier));

        // Cap priority fee: max 50 Gwei or 20% of maxFeePerGas, whichever is lower
        const maxPriorityFeeCap = BigInt(50_000_000_000); // 50 Gwei
        const calculatedPriorityFee = maxFeePerGas / BigInt(5); // 20% of max fee
        const maxPriorityFeePerGas = calculatedPriorityFee < maxPriorityFeeCap
            ? calculatedPriorityFee
            : maxPriorityFeeCap;

        // Calculate estimated total cost
        const estimatedCost = maxFeePerGas * estimatedGasLimit;

        console.log('[GasEstimation] Calculated fees:', {
            baseFee: formatGwei(baseFeePerGas) + ' Gwei',
            maxFeePerGas: formatGwei(maxFeePerGas) + ' Gwei',
            maxPriorityFeePerGas: formatGwei(maxPriorityFeePerGas) + ' Gwei',
            multiplier: `${multiplier}x`,
            estimatedGasLimit: estimatedGasLimit.toString(),
            estimatedCost: formatGwei(estimatedCost) + ' Gwei'
        });

        return {
            maxFeePerGas,
            maxPriorityFeePerGas,
            estimatedCost
        };
    } catch (error) {
        console.error('[GasEstimation] Failed to estimate gas fees from network:', error);
        console.log('[GasEstimation] Using fallback gas fees');
        return getFallbackGasFees(estimatedGasLimit);
    }
}

/**
 * Get conservative fallback gas fees when network estimation fails
 * Uses very high values to ensure transaction acceptance
 */
function getFallbackGasFees(estimatedGasLimit: bigint): GasFees {
    const maxFeePerGas = BigInt(20_000_000_000); // 20 Gwei
    const maxPriorityFeePerGas = BigInt(10_000_000_000); // 10 Gwei
    const estimatedCost = maxFeePerGas * estimatedGasLimit;

    console.log('[GasEstimation] Using fallback fees:', {
        maxFeePerGas: formatGwei(maxFeePerGas) + ' Gwei',
        maxPriorityFeePerGas: formatGwei(maxPriorityFeePerGas) + ' Gwei',
        estimatedCost: formatGwei(estimatedCost) + ' Gwei'
    });

    return {
        maxFeePerGas,
        maxPriorityFeePerGas,
        estimatedCost
    };
}

/**
 * Format wei to Gwei for logging
 */
function formatGwei(wei: bigint): string {
    return (Number(wei) / 1_000_000_000).toFixed(2);
}
