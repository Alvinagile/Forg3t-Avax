import { describe, expect, it } from 'vitest';
import { extractPipelineItems, resolveVerificationState } from './workflows';

describe('shared workflow helpers', () => {
  it('resolves verification states predictably', () => {
    expect(resolveVerificationState({
      expectedHash: '0xabc',
      localHash: '0xabc',
      anchorStatus: 'confirmed',
    })).toBe('valid');

    expect(resolveVerificationState({
      expectedHash: '0xabc',
      localHash: '0xdef',
      anchorStatus: 'confirmed',
    })).toBe('hash_mismatch');

    expect(resolveVerificationState({
      expectedHash: '0xabc',
      anchorStatus: 'pending',
    })).toBe('anchor_pending');

    expect(resolveVerificationState({
      expectedHash: '0xabc',
      anchorStatus: 'confirmed',
    })).toBe('anchor_confirmed');

    expect(resolveVerificationState({
      expectedHash: null,
      anchorStatus: 'not_submitted',
    })).toBe('anchor_not_found');

    expect(resolveVerificationState({
      expectedHash: '0xabc',
      anchorStatus: 'failed',
    })).toBe('anchor_failed');
  });

  it('extracts pipeline scope items for runs', () => {
    const items = extractPipelineItems(
      {
        summary: 'Workspace level review',
        items: [
          {
            requestReason: 'Review assistant data',
            targetScopeSummary: 'Assistant endpoint A',
            targetType: 'assistant',
          },
          {
            targetScopeSummary: 'Endpoint B',
          },
        ],
      },
      'Quarterly review',
      'Review all configured integrations',
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      requestReason: 'Review assistant data',
      targetScopeSummary: 'Assistant endpoint A',
      targetType: 'assistant',
    });
    expect(items[1]).toEqual({
      requestReason: 'Quarterly review',
      targetScopeSummary: 'Endpoint B',
      targetType: 'custom',
    });
  });
});
