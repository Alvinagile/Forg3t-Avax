import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { CopyButton } from '../components/CopyButton';
import { StatusBadge } from '../components/StatusBadge';
import { anchorsApi, jobsApi, reportsApi } from '../lib/api';
import { buildEvidenceBundleFile, sha256Bytes32 } from '../lib/hash';
import { downloadTextFile, explorerTxUrl, formatDate, getAnchorRecord, getEvidenceRecord, getJobRuntimeState } from '../lib/domainUtils';
import { PDFGenerator } from '../lib/pdfGenerator';
import type { JobRecord } from '../types/domain';

export function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');

  const loadJob = async () => {
    if (!jobId) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await jobsApi.get(jobId);
      setJob(response.job);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const evidence = useMemo(() => (job ? getEvidenceRecord(job) : null), [job]);
  const anchor = useMemo(() => (job ? getAnchorRecord(job) : null), [job]);
  const runtimeState = useMemo(() => getJobRuntimeState(job), [job]);
  const validationSummary = useMemo(() => {
    if (!job?.metadata || typeof job.metadata !== 'object' || Array.isArray(job.metadata)) {
      return null;
    }

    const candidate = (job.metadata as Record<string, unknown>).validationSummary;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return null;
    }

    return candidate as {
      leakScore?: number | null;
      totalChecks?: number | null;
      passedChecks?: number | null;
      failedChecks?: number | null;
    };
  }, [job]);

  const exportReport = async (format: 'json' | 'csv' | 'pdf') => {
    if (!job) {
      return;
    }

    setActionLoading(format);
    setError('');

    try {
      const response = await reportsApi.export({ jobId: job.id, format });
      if (format === 'csv') {
        downloadTextFile(
          `forg3t-report-${job.id}.csv`,
          response.export.payload.csv ?? '',
          'text/csv',
        );
      } else if (format === 'json') {
        downloadTextFile(
          `forg3t-report-${job.id}.json`,
          JSON.stringify(response.export.payload.detail ?? response.export.payload.row, null, 2),
          'application/json',
        );
      } else {
        const blob = PDFGenerator.generateEvidenceReport(
          response.export.payload.row,
          response.export.payload.detail as JobRecord | undefined,
        );
        const reportHash = await sha256Bytes32(blob);
        await reportsApi.commitPdfHash({
          jobId: job.id,
          evidenceId: response.export.payload.row.evidenceId ?? evidence?.id ?? undefined,
          exportId: response.export.id,
          reportHash,
        });
        PDFGenerator.downloadPDF(blob, `forg3t-report-${job.id}.pdf`);
      }
      await loadJob();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to export report');
    } finally {
      setActionLoading('');
    }
  };

  const anchorEvidence = async () => {
    if (!evidence?.id) {
      return;
    }

    setActionLoading('anchor');
    setError('');

    try {
      await anchorsApi.create(evidence.id);
      await loadJob();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to anchor evidence');
    } finally {
      setActionLoading('');
    }
  };

  const downloadBundle = async () => {
    if (!evidence?.manifest) {
      return;
    }

    const file = await buildEvidenceBundleFile(evidence.manifest);
    downloadTextFile(`forg3t-evidence-${evidence.id}.json`, file, 'application/json');
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        Loading job details...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error || 'Job not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={job.status} />
            <StatusBadge status={anchor?.status ?? job.anchor_status} />
          </div>
          <h1 className="mt-3 text-3xl font-bold text-[#111111]">Job {job.id}</h1>
          <p className="mt-2 max-w-3xl text-[#4B4B4B]">
            {job.target_scope_summary || job.request_reason}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadJob}
            className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={anchorEvidence}
            disabled={!evidence || actionLoading === 'anchor'}
            className="rounded-xl bg-[#E84142] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c73435] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actionLoading === 'anchor' ? 'Anchoring...' : 'Anchor on Avalanche'}
          </button>
          {evidence && (
            <Link
              to={`/dashboard/evidence/${evidence.id}`}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
            >
              Open Evidence
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {job.status === 'processing' && runtimeState && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm text-[#111111]">
          <div className="font-semibold">Black-box suppression is running</div>
          <div className="mt-1 text-[#4B4B4B]">{runtimeState.message ?? 'Processing job execution.'}</div>
          {typeof runtimeState.percent === 'number' && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-blue-100">
                <div
                  className="h-2 rounded-full bg-[#2F80ED] transition-all"
                  style={{ width: `${runtimeState.percent}%` }}
                />
              </div>
              <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                {Math.round(runtimeState.percent)}% complete
              </div>
            </div>
          )}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-4">
        {[
          { label: 'Created', value: formatDate(job.created_at) },
          { label: 'Completed', value: formatDate(job.completed_at) },
          { label: 'Target Type', value: job.target_type },
          { label: 'Execution Lane', value: job.execution_lane },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-[#4B4B4B]">{item.label}</p>
            <p className="mt-2 text-lg font-semibold text-[#111111]">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr,1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#111111]">Validation Results</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-sm text-[#4B4B4B]">Validation Score</div>
                <div className="mt-2 text-2xl font-bold text-[#111111]">
                  {job.validation_score !== null && job.validation_score !== undefined ? Number(job.validation_score).toFixed(2) : 'N/A'}
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-sm text-[#4B4B4B]">Processing Time</div>
                <div className="mt-2 text-2xl font-bold text-[#111111]">
                  {job.processing_time_seconds ? `${job.processing_time_seconds}s` : 'N/A'}
                </div>
              </div>
            </div>
            {validationSummary && (
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-sm text-[#4B4B4B]">Leak Score</div>
                  <div className="mt-2 text-lg font-semibold text-[#111111]">
                    {validationSummary.leakScore !== null && validationSummary.leakScore !== undefined
                      ? Number(validationSummary.leakScore).toFixed(2)
                      : 'N/A'}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-sm text-[#4B4B4B]">Checks Passed</div>
                  <div className="mt-2 text-lg font-semibold text-[#111111]">
                    {validationSummary.passedChecks ?? 'N/A'}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-sm text-[#4B4B4B]">Checks Failed</div>
                  <div className="mt-2 text-lg font-semibold text-[#111111]">
                    {validationSummary.failedChecks ?? 'N/A'}
                  </div>
                </div>
              </div>
            )}
            {job.error_message && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {job.error_message}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#111111]">Evidence Bundle</h2>
              {evidence && (
                <button
                  type="button"
                  onClick={downloadBundle}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
                >
                  Download JSON
                </button>
              )}
            </div>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={job.evidence_status} />
                <StatusBadge status={evidence?.verification_status ?? job.verification_status} />
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Evidence Hash</div>
                <div className="mt-2 break-all font-mono text-sm text-[#111111]">{evidence?.evidence_hash ?? 'Not generated yet'}</div>
                <div className="mt-3"><CopyButton value={evidence?.evidence_hash} /></div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Job Hash</div>
                <div className="mt-2 break-all font-mono text-sm text-[#111111]">{evidence?.job_hash ?? 'Not generated yet'}</div>
                <div className="mt-3"><CopyButton value={evidence?.job_hash} /></div>
              </div>
              {evidence?.public_verification_token && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <div className="text-sm font-semibold text-[#111111]">Public Verify Link</div>
                  <a
                    href={`/verify/${evidence.public_verification_token}`}
                    className="mt-2 inline-flex items-center text-sm font-medium text-[#2F80ED] hover:underline"
                  >
                    /verify/{evidence.public_verification_token}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#111111]">Avalanche Anchor</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={anchor?.status ?? job.anchor_status} />
                <StatusBadge status={job.report_status} />
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Transaction Hash</div>
                <div className="mt-2 break-all font-mono text-sm text-[#111111]">{anchor?.transaction_hash ?? job.blockchain_tx_hash ?? 'Not submitted'}</div>
                <div className="mt-3 flex items-center gap-3">
                  <CopyButton value={anchor?.transaction_hash ?? job.blockchain_tx_hash} />
                  {explorerTxUrl(anchor?.transaction_hash ?? job.blockchain_tx_hash, anchor?.network ?? null) && (
                    <a
                      href={explorerTxUrl(anchor?.transaction_hash ?? job.blockchain_tx_hash, anchor?.network ?? null) ?? '#'}
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Network</div>
                  <div className="mt-2 text-sm font-semibold text-[#111111]">{anchor?.network ?? 'N/A'}</div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Block Number</div>
                  <div className="mt-2 text-sm font-semibold text-[#111111]">{anchor?.block_number ?? 'Pending'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#111111]">Reporting Exports</h2>
            {job.integrations && (
              <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Integration</div>
                <div className="mt-2 text-sm font-semibold text-[#111111]">
                  {job.integrations.name}
                </div>
                <div className="mt-1 text-sm text-[#4B4B4B]">
                  {job.integrations.provider_type.replaceAll('_', ' ')}
                  {job.integrations.model_identifier ? ` · ${job.integrations.model_identifier}` : ''}
                </div>
              </div>
            )}
            <div className="mt-4 grid gap-3">
              {(['json', 'csv', 'pdf'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => exportReport(format)}
                  disabled={actionLoading === format}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading === format ? `Preparing ${format.toUpperCase()}...` : `Export ${format.toUpperCase()} report`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
