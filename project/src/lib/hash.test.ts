import { describe, expect, it } from 'vitest';
import { buildEvidenceBundleFile, parseEvidenceBundle, sha256Bytes32, stableStringify } from './hash';

describe('hash helpers', () => {
  it('stableStringify sorts object keys recursively', () => {
    const left = stableStringify({
      b: 2,
      a: {
        d: 4,
        c: 3,
      },
    });

    const right = stableStringify({
      a: {
        c: 3,
        d: 4,
      },
      b: 2,
    });

    expect(left).toBe(right);
  });

  it('produces deterministic sha256 bytes32 hashes', async () => {
    const input = stableStringify({
      schemaVersion: 'forg3t.evidence-bundle/v1',
      evidenceId: 'evidence-1',
      jobId: 'job-1',
    });

    const first = await sha256Bytes32(input);
    const second = await sha256Bytes32(input);

    expect(first).toBe(second);
    expect(first).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('builds and parses evidence bundles', async () => {
    const manifest = {
      schemaVersion: 'forg3t.evidence-bundle/v1',
      evidenceId: 'evidence-1',
      jobId: 'job-1',
      projectId: 'project-1',
    };

    const file = await buildEvidenceBundleFile(manifest);
    const parsed = parseEvidenceBundle(file);

    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      expect(parsed.bundle.evidenceId).toBe('evidence-1');
      expect(parsed.bundle.jobId).toBe('job-1');
    }
  });

  it('rejects invalid bundle payloads', () => {
    const parsed = parseEvidenceBundle('{"hello":"world"}');
    expect(parsed.valid).toBe(false);
  });
});
