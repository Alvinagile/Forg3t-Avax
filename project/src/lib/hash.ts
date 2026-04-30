function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(sortValue(value), null, 2);
}

async function toArrayBuffer(value: string | ArrayBuffer | Blob | Uint8Array) {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value).buffer;
  }

  if (value instanceof Blob) {
    return await value.arrayBuffer();
  }

  if (value instanceof Uint8Array) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }

  return value;
}

export async function sha256Hex(value: string | ArrayBuffer | Blob | Uint8Array) {
  const buffer = await toArrayBuffer(value);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Bytes32(value: string | ArrayBuffer | Blob | Uint8Array) {
  return `0x${await sha256Hex(value)}`;
}

export async function buildEvidenceBundleFile(manifest: Record<string, unknown>) {
  return `${stableStringify(manifest)}\n`;
}

export function parseEvidenceBundle(text: string) {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.schemaVersion === 'forg3t.evidence-bundle/v1' &&
      typeof parsed.evidenceId === 'string' &&
      typeof parsed.jobId === 'string'
    ) {
      return {
        valid: true as const,
        bundle: parsed,
      };
    }

    return {
      valid: false as const,
      error: 'invalid_bundle',
    };
  } catch {
    return {
      valid: false as const,
      error: 'invalid_bundle',
    };
  }
}
