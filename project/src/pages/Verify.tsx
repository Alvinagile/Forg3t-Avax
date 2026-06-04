import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileUp, ShieldCheck, UploadCloud } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { verifyApi } from '../lib/api';
import { parseEvidenceBundle, sha256Bytes32 } from '../lib/hash';
import type { VerificationResponse } from '../types/domain';

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function Verify() {
  const { evidenceId } = useParams<{ evidenceId: string }>();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
    type: string;
    localHash: string;
  } | null>(null);
  const [bundleMetadata, setBundleMetadata] = useState<Record<string, unknown> | null>(null);

  const paramLooksLikeUuid = useMemo(
    () => Boolean(evidenceId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidenceId)),
    [evidenceId],
  );

  useEffect(() => {
    if (!evidenceId) {
      setResult(null);
      return;
    }

    setLoading(true);
    setError('');

    const request = user && paramLooksLikeUuid
      ? verifyApi.getEvidence(evidenceId)
      : verifyApi.getPublic(evidenceId);

    request
      .then((response) => setResult(response.verification))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Failed to load verification state'))
      .finally(() => setLoading(false));
  }, [evidenceId, paramLooksLikeUuid, user]);

  const handleFile = async (file: File) => {
    const isJson = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (!isJson && !isPdf) {
      setResult({
        verificationStatus: 'unsupported_file',
      });
      setBundleMetadata(null);
      setFileInfo({
        name: file.name,
        size: file.size,
        type: file.type || 'unknown',
        localHash: '',
      });
      return;
    }

    setLoading(true);
    setError('');

    try {
      const localHash = await sha256Bytes32(file);
      setFileInfo({
        name: file.name,
        size: file.size,
        type: file.type || (isJson ? 'application/json' : 'application/pdf'),
        localHash,
      });

      if (isJson) {
        const text = await file.text();
        const parsed = parseEvidenceBundle(text);
        setBundleMetadata(parsed.valid ? parsed.bundle : null);

        const response = await verifyApi.verifyUpload({
          artifactType: 'json',
          localHash,
          evidenceId: parsed.valid ? parsed.bundle.evidenceId : undefined,
          verificationToken: !paramLooksLikeUuid ? evidenceId : undefined,
          invalidBundle: !parsed.valid,
        }, Boolean(user));

        setResult(response.verification);
      } else {
        setBundleMetadata(null);
        const response = await verifyApi.verifyUpload({
          artifactType: 'pdf',
          localHash,
          verificationToken: !paramLooksLikeUuid ? evidenceId : undefined,
        }, Boolean(user));
        setResult(response.verification);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#2F80ED]">
          Auditor Verify Desk
        </div>
        <h1 className="mt-3 text-3xl font-bold text-[#111111]">Verify Evidence Bundle</h1>
        <p className="mt-2 max-w-3xl text-[#4B4B4B]">
          Upload a JSON evidence bundle or a previously exported PDF report. Forg3t computes a local SHA-256 hash,
          compares it against stored commitments, and checks Avalanche confirmation state through the backend.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) {
            void handleFile(file);
          }
        }}
        className={`rounded-[28px] border border-dashed p-8 text-center shadow-sm transition-colors ${
          dragging
            ? 'border-[#2F80ED] bg-gradient-to-br from-[#F7FBFF] via-white to-[#E9F4FF]'
            : 'border-[#B6D5FF] bg-gradient-to-br from-white via-[#F8FBFF] to-[#EEF6FF]'
        }`}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#2F80ED] shadow-sm">
          <UploadCloud className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-[#111111]">Drag and drop an evidence file</h2>
        <p className="mt-2 text-sm text-[#4B4B4B]">
          Supported files: `.json` evidence bundles and `.pdf` evidence reports
        </p>
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2870CE]"
          >
            <FileUp className="mr-2 h-4 w-4" />
            Choose file
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.pdf,application/json,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />
      </section>

      {(loading || result || fileInfo || bundleMetadata) && (
        <section className="grid gap-6 xl:grid-cols-[1.1fr,1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#111111]">Verification Result</h2>
                {loading ? (
                  <span className="text-sm text-[#4B4B4B]">Checking...</span>
                ) : (
                  <StatusBadge status={result?.verificationStatus ?? 'not_verified'} />
                )}
              </div>
              {result && (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-sm text-[#4B4B4B]">Project</div>
                      <div className="mt-2 text-lg font-semibold text-[#111111]">{result.projectName ?? 'Unknown'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-sm text-[#4B4B4B]">Anchor State</div>
                      <div className="mt-2"><StatusBadge status={result.anchorStatus ?? 'not_submitted'} /></div>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-sm text-[#4B4B4B]">Expected Hash</div>
                      <div className="mt-2 break-all font-mono text-sm text-[#111111]">{result.expectedHash ?? 'N/A'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-sm text-[#4B4B4B]">Local Hash</div>
                      <div className="mt-2 break-all font-mono text-sm text-[#111111]">{result.localHash ?? 'N/A'}</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-[#111111]">
                    {result.verificationStatus === 'valid' && 'Valid: the uploaded artifact matches the stored commitment and the Avalanche anchor is confirmed.'}
                    {result.verificationStatus === 'hash_mismatch' && 'Hash mismatch: the uploaded artifact does not match the stored evidence commitment.'}
                    {result.verificationStatus === 'anchor_not_found' && 'Anchor not found: no matching evidence or anchor record could be located.'}
                    {result.verificationStatus === 'anchor_pending' && 'Anchor pending: the evidence commitment was submitted but Avalanche confirmation is still in progress.'}
                    {result.verificationStatus === 'anchor_confirmed' && 'Anchor confirmed: a valid Avalanche commitment exists for this evidence.'}
                    {result.verificationStatus === 'anchor_failed' && 'Anchor failed: an anchor record exists, but the Avalanche transaction failed or did not match the stored commitment.'}
                    {result.verificationStatus === 'invalid_bundle' && 'Invalid bundle: the uploaded JSON does not match the Forg3t evidence bundle schema.'}
                    {result.verificationStatus === 'unsupported_file' && 'Unsupported file: only JSON bundles and PDF reports are accepted.'}
                  </div>
                  {(result.transactionHash || result.explorerUrl || result.network || result.blockNumber || result.contractAddress) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="text-sm text-[#4B4B4B]">Network</div>
                        <div className="mt-2 font-semibold text-[#111111]">{result.network ?? 'N/A'}</div>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="text-sm text-[#4B4B4B]">Block Number</div>
                        <div className="mt-2 font-semibold text-[#111111]">{result.blockNumber ?? 'Pending'}</div>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 sm:col-span-2">
                        <div className="text-sm text-[#4B4B4B]">Transaction Hash</div>
                        <div className="mt-2 break-all font-mono text-sm text-[#111111]">{result.transactionHash ?? 'N/A'}</div>
                        {result.explorerUrl && (
                          <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block break-all text-sm font-medium text-[#2F80ED] hover:underline">
                            {result.explorerUrl}
                          </a>
                        )}
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 sm:col-span-2">
                        <div className="text-sm text-[#4B4B4B]">Contract Address</div>
                        <div className="mt-2 break-all font-mono text-sm text-[#111111]">{result.contractAddress ?? 'N/A'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {bundleMetadata && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-[#111111]">Bundle Metadata</h2>
                <pre className="mt-4 max-h-[320px] overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">
                  {JSON.stringify(bundleMetadata, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#111111]">Uploaded Artifact</h2>
                  <p className="text-sm text-[#4B4B4B]">Local file metadata used for verification.</p>
                </div>
              </div>
              {fileInfo ? (
                <div className="mt-4 space-y-3">
                  {[
                    { label: 'Name', value: fileInfo.name },
                    { label: 'Type', value: fileInfo.type },
                    { label: 'Size', value: formatBytes(fileInfo.size) },
                    { label: 'Local Hash', value: fileInfo.localHash },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</div>
                      <div className={`mt-2 ${item.label === 'Local Hash' ? 'break-all font-mono text-sm text-[#111111]' : 'text-sm text-[#111111]'}`}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-gray-200 p-4 text-sm text-[#4B4B4B]">
                  No file uploaded yet.
                </div>
              )}
            </div>

            {result?.transaction && (
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-[#111111]">Transaction Check</h2>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="text-sm text-[#4B4B4B]">Status</div>
                    <div className="mt-2"><StatusBadge status={result.transaction.status} /></div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <div className="text-sm text-[#4B4B4B]">Explorer</div>
                    <a href={result.transaction.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-sm font-medium text-[#2F80ED] hover:underline">
                      {result.transaction.explorerUrl}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
