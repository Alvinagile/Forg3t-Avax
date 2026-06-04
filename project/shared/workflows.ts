export interface VerificationStateInput {
  expectedHash?: string | null;
  localHash?: string | null;
  anchorStatus?: string | null;
}

export function resolveVerificationState(input: VerificationStateInput) {
  if (!input.expectedHash) {
    return 'anchor_not_found' as const;
  }

  if (input.localHash && input.localHash.toLowerCase() !== input.expectedHash.toLowerCase()) {
    return 'hash_mismatch' as const;
  }

  if (!input.anchorStatus || input.anchorStatus === 'not_submitted') {
    return 'anchor_not_found' as const;
  }

  if (input.anchorStatus === 'pending') {
    return 'anchor_pending' as const;
  }

  if (input.anchorStatus === 'confirmed') {
    return input.localHash ? 'valid' as const : 'anchor_confirmed' as const;
  }

  if (input.anchorStatus === 'failed') {
    return 'anchor_failed' as const;
  }

  return 'anchor_not_found' as const;
}

export interface PipelineScopeItem {
  requestReason: string;
  targetScopeSummary: string;
  targetType: string;
}

export function extractPipelineItems(
  targetScope: Record<string, unknown>,
  pipelineName: string,
  pipelineDescription?: string | null,
): PipelineScopeItem[] {
  const scopedItems = Array.isArray(targetScope.items) && targetScope.items.length
    ? targetScope.items as Array<Record<string, unknown>>
    : [targetScope];

  return scopedItems.map((item) => ({
    requestReason: String(item.requestReason ?? pipelineName).slice(0, 240),
    targetScopeSummary: String(
      item.targetScopeSummary ??
      targetScope.summary ??
      pipelineDescription ??
      pipelineName,
    ).slice(0, 240),
    targetType: String(item.targetType ?? 'custom').slice(0, 40),
  }));
}
