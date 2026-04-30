import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Link2, ShieldCheck } from 'lucide-react';
import { CopyButton } from '../components/CopyButton';
import { StatusBadge } from '../components/StatusBadge';
import { useWorkspace } from '../hooks/useWorkspace';
import { anchorsApi, integrationsApi, jobsApi, reportsApi } from '../lib/api';
import { buildEvidenceBundleFile, sha256Bytes32 } from '../lib/hash';
import { downloadTextFile, getAnchorRecord, getEvidenceRecord, roleCanCreateJobs } from '../lib/domainUtils';
import { PDFGenerator } from '../lib/pdfGenerator';
import type { Integration, JobRecord } from '../types/domain';

export function Unlearning() {
  const { activeMembership } = useWorkspace();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdJob, setCreatedJob] = useState<JobRecord | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [targetScopeSummary, setTargetScopeSummary] = useState('');
  const [targetType, setTargetType] = useState('assistant');
  const [executionLane, setExecutionLane] = useState('assistant_black_box');
  const [validationScore, setValidationScore] = useState('0.92');
  const [processingTimeSeconds, setProcessingTimeSeconds] = useState('180');
  const [integrationId, setIntegrationId] = useState('');
  const [notes, setNotes] = useState('');

  const canCreateJobs = roleCanCreateJobs(activeMembership?.role);

  useEffect(() => {
    if (!activeMembership?.project_id) {
      setIntegrations([]);
      return;
    }

    integrationsApi.list(activeMembership.project_id)
      .then((response) => setIntegrations(response.integrations))
      .catch(() => setIntegrations([]));
  }, [activeMembership?.project_id]);

  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.id === integrationId) ?? null,
    [integrationId, integrations],
  );

  const evidence = createdJob ? getEvidenceRecord(createdJob) : null;
  const anchor = createdJob ? getAnchorRecord(createdJob) : null;

  const loadCreatedJob = async (jobId: string) => {
    const response = await jobsApi.get(jobId);
    setCreatedJob(response.job);
  };

  const createJob = async () => {
    if (!activeMembership?.project_id) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await jobsApi.create({
        projectId: activeMembership.project_id,
        integrationId: integrationId || null,
        requestReason,
        targetScopeSummary,
        targetType,
        executionLane,
        validationScore: Number(validationScore),
        processingTimeSeconds: Number(processingTimeSeconds),
        status: 'completed',
        metadata: {
          notes,
          integrationMetadata: selectedIntegration
            ? {
              integrationId: selectedIntegration.id,
              name: selectedIntegration.name,
              providerType: selectedIntegration.provider_type,
              modelIdentifier: selectedIntegration.model_identifier,
            }
            : null,
        },
      });

      setCreatedJob(response.job);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  const anchorEvidence = async () => {
    if (!evidence?.id || !createdJob) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await anchorsApi.create(evidence.id);
      await loadCreatedJob(createdJob.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to anchor evidence');
    } finally {
      setLoading(false);
    }
  };

  const downloadBundle = async () => {
    if (!evidence?.manifest) {
      return;
    }

    const file = await buildEvidenceBundleFile(evidence.manifest);
    downloadTextFile(`forg3t-evidence-${evidence.id}.json`, file, 'application/json');
  };

  const exportPdf = async () => {
    if (!createdJob) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await reportsApi.export({
        jobId: createdJob.id,
        format: 'pdf',
      });
      const blob = PDFGenerator.generateEvidenceReport(
        response.export.payload.row,
        response.export.payload.detail as JobRecord | undefined,
      );
      const reportHash = await sha256Bytes32(blob);
      await reportsApi.commitPdfHash({
        jobId: createdJob.id,
        evidenceId: response.export.payload.row.evidenceId ?? evidence?.id ?? undefined,
        exportId: response.export.id,
        reportHash,
      });
      PDFGenerator.downloadPDF(blob, `forg3t-report-${createdJob.id}.pdf`);
      await loadCreatedJob(createdJob.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to export PDF report');
    } finally {
      setLoading(false);
    }
  };

  if (!canCreateJobs) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        Your role is read-only for job creation in this workspace. Developers, admins, and owners can create jobs here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#2F80ED]">
          Production Job Creation
        </div>
        <h1 className="mt-3 text-3xl font-bold text-[#111111]">Run Unlearning Workflow</h1>
        <p className="mt-2 max-w-3xl text-[#4B4B4B]">
          Create a production-grade job record, generate a sanitized evidence bundle, and optionally anchor the
          resulting commitment on Avalanche. Raw customer data and prompts stay off-chain.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.1fr,1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#111111]">Job Input</h2>
          <div className="mt-6 grid gap-4">
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Request Reason</span>
              <input
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
                placeholder="GDPR erasure / retention minimisation / model suppression request"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Target Scope Summary</span>
              <textarea
                value={targetScopeSummary}
                onChange={(event) => setTargetScopeSummary(event.target.value)}
                rows={4}
                placeholder="Summarise the tenant scope without pasting raw targets, prompts, or model outputs."
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Target Type</span>
                <select
                  value={targetType}
                  onChange={(event) => setTargetType(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                >
                  {['assistant', 'api_endpoint', 'model', 'document', 'dataset', 'custom'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Execution Lane</span>
                <select
                  value={executionLane}
                  onChange={(event) => setExecutionLane(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                >
                  {['assistant_black_box', 'api_endpoint', 'manual', 'pipeline', 'white_box'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Validation Score</span>
                <input
                  value={validationScore}
                  onChange={(event) => setValidationScore(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Processing Time (s)</span>
                <input
                  value={processingTimeSeconds}
                  onChange={(event) => setProcessingTimeSeconds(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Integration</span>
                <select
                  value={integrationId}
                  onChange={(event) => setIntegrationId(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                >
                  <option value="">No integration</option>
                  {integrations.map((integration) => (
                    <option key={integration.id} value={integration.id}>
                      {integration.name} ({integration.status})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Operational Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Optional notes. Avoid copying raw prompts, targets, or private outputs."
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-6">
            <button
              type="button"
              disabled={loading || !requestReason.trim() || !targetScopeSummary.trim()}
              onClick={createJob}
              className="rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2870CE] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Creating...' : 'Create job and evidence'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#111111]">On-chain Privacy</h2>
                <p className="text-sm text-[#4B4B4B]">Only non-sensitive commitments are anchored.</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-[#111111]">
              Forg3t stores only commitments like `evidenceHash`, `jobHash`, network, contract address, transaction hash,
              block number, and chain ID on-chain. Raw customer data, prompts, targets, evidence contents, and model outputs remain off-chain.
            </div>
          </div>

          {createdJob && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#111111]">Latest Job</h2>
                  <p className="mt-1 text-sm text-[#4B4B4B]">{createdJob.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={createdJob.status} />
                  <StatusBadge status={anchor?.status ?? createdJob.anchor_status} />
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Evidence Hash</div>
                  <div className="mt-2 break-all font-mono text-sm text-[#111111]">{evidence?.evidence_hash ?? 'Pending'}</div>
                  <div className="mt-3"><CopyButton value={evidence?.evidence_hash} /></div>
                </div>
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={anchorEvidence}
                    disabled={loading || !evidence}
                    className="inline-flex items-center justify-center rounded-xl bg-[#E84142] px-4 py-3 text-sm font-semibold text-white hover:bg-[#c73435] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Anchor on Avalanche
                  </button>
                  <button
                    type="button"
                    onClick={downloadBundle}
                    disabled={!evidence}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
                  >
                    Download Evidence Bundle
                  </button>
                  <button
                    type="button"
                    onClick={exportPdf}
                    disabled={loading}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
                  >
                    Export PDF Report
                  </button>
                  <Link
                    to={`/dashboard/jobs/${createdJob.id}`}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
                  >
                    View Job Detail
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
