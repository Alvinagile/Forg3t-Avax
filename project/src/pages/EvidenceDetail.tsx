import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { CopyButton } from '../components/CopyButton';
import { StatusBadge } from '../components/StatusBadge';
import { reportsApi } from '../lib/api';
import { buildEvidenceBundleFile } from '../lib/hash';
import { downloadTextFile, explorerTxUrl, getAnchorRecord, getEvidenceRecord } from '../lib/domainUtils';
import type { JobRecord } from '../types/domain';

export function EvidenceDetail() {
  const { evidenceId } = useParams<{ evidenceId: string }>();
  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!evidenceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    reportsApi.get({ evidenceId })
      .then((response) => setJob(response.detail))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Failed to load evidence'))
      .finally(() => setLoading(false));
  }, [evidenceId]);

  const evidence = job ? getEvidenceRecord(job) : null;
  const anchor = job ? getAnchorRecord(job) : null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        Loading evidence...
      </div>
    );
  }

  if (!job || !evidence) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error || 'Evidence not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={evidence.artifact_status} />
          <StatusBadge status={anchor?.status ?? job.anchor_status} />
        </div>
        <h1 className="mt-3 text-3xl font-bold text-[#111111]">Evidence {evidence.id}</h1>
        <p className="mt-2 text-[#4B4B4B]">
          Sanitized bundle, report export state, and verification metadata for auditors and compliance teams.
        </p>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.25fr,1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#111111]">Bundle Manifest</h2>
              <button
                type="button"
                onClick={async () => {
                  const file = await buildEvidenceBundleFile(evidence.manifest);
                  downloadTextFile(`forg3t-evidence-${evidence.id}.json`, file, 'application/json');
                }}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
              >
                Download JSON
              </button>
            </div>
            <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">
              {JSON.stringify(evidence.manifest, null, 2)}
            </pre>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#111111]">Report Payload</h2>
            <pre className="mt-4 max-h-[320px] overflow-auto rounded-xl bg-[#F7F7F8] p-4 text-xs text-[#111111]">
              {JSON.stringify(evidence.report_payload, null, 2)}
            </pre>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#111111]">Commitments</h2>
            <div className="mt-4 space-y-4">
              {[
                { label: 'Evidence Hash', value: evidence.evidence_hash },
                { label: 'Job Hash', value: evidence.job_hash },
                { label: 'Report Hash', value: evidence.report_hash },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</div>
                  <div className="mt-2 break-all font-mono text-sm text-[#111111]">{item.value ?? 'N/A'}</div>
                  <div className="mt-3"><CopyButton value={item.value} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#111111]">Verification Access</h2>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-sm font-semibold text-[#111111]">Scoped auditor route</div>
              <a
                href={`/verify/${evidence.public_verification_token}`}
                className="mt-2 inline-flex items-center text-sm font-medium text-[#2F80ED] hover:underline"
              >
                /verify/{evidence.public_verification_token}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#111111]">Avalanche Record</h2>
            <div className="mt-4 space-y-3">
              <StatusBadge status={anchor?.status ?? job.anchor_status} />
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Transaction Hash</div>
                <div className="mt-2 break-all font-mono text-sm text-[#111111]">{anchor?.transaction_hash ?? 'Not submitted'}</div>
                <div className="mt-3 flex items-center gap-3">
                  <CopyButton value={anchor?.transaction_hash} />
                  {explorerTxUrl(anchor?.transaction_hash, anchor?.network ?? null) && (
                    <a
                      href={explorerTxUrl(anchor?.transaction_hash, anchor?.network ?? null) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-semibold text-[#2F80ED] hover:underline"
                    >
                      Open Explorer
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
