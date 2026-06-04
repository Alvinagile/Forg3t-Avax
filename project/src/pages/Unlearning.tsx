import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Link2, ShieldCheck } from 'lucide-react';
import { CopyButton } from '../components/CopyButton';
import { StatusBadge } from '../components/StatusBadge';
import { useWorkspace } from '../hooks/useWorkspace';
import { anchorsApi, integrationsApi, jobsApi, reportsApi } from '../lib/api';
import { buildEvidenceBundleFile, sha256Bytes32 } from '../lib/hash';
import {
  downloadTextFile,
  getAnchorRecord,
  getEvidenceRecord,
  getIntegrationAssistantId,
  getJobRuntimeState,
  integrationSupportsAssistantSuppression,
  roleCanCreateJobs,
  roleCanManageIntegrations,
} from '../lib/domainUtils';
import { PDFGenerator } from '../lib/pdfGenerator';
import type { Integration, JobRecord } from '../types/domain';

interface UnlearningProps {
  mode?: 'general' | 'blackBox';
}

export function Unlearning({ mode = 'general' }: UnlearningProps) {
  const { activeMembership } = useWorkspace();
  const isBlackBoxMode = mode === 'blackBox';
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
  const [sensitiveTargetText, setSensitiveTargetText] = useState('');
  const [notes, setNotes] = useState('');
  const [quickIntegrationName, setQuickIntegrationName] = useState('OpenAI Assistant');
  const [quickAssistantId, setQuickAssistantId] = useState('');
  const [quickApiKey, setQuickApiKey] = useState('');
  const [quickIntegrationLoading, setQuickIntegrationLoading] = useState(false);
  const [quickIntegrationMessage, setQuickIntegrationMessage] = useState('');

  const canCreateJobs = roleCanCreateJobs(activeMembership?.role);
  const canManageIntegrations = roleCanManageIntegrations(activeMembership?.role);

  const loadIntegrations = async () => {
    if (!activeMembership?.project_id) {
      setIntegrations([]);
      return;
    }

    try {
      const response = await integrationsApi.list(activeMembership.project_id);
      setIntegrations(response.integrations);
    } catch {
      setIntegrations([]);
    }
  };

  useEffect(() => {
    void loadIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembership?.project_id]);

  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.id === integrationId) ?? null,
    [integrationId, integrations],
  );
  const selectedAssistantId = useMemo(() => getIntegrationAssistantId(selectedIntegration), [selectedIntegration]);
  const assistantIntegrations = useMemo(
    () => integrations.filter((integration) => integrationSupportsAssistantSuppression(integration)),
    [integrations],
  );
  const liveSuppressionEnabled = executionLane === 'assistant_black_box' && integrationSupportsAssistantSuppression(selectedIntegration);

  const evidence = createdJob ? getEvidenceRecord(createdJob) : null;
  const anchor = createdJob ? getAnchorRecord(createdJob) : null;
  const runtimeState = createdJob ? getJobRuntimeState(createdJob) : null;
  const anchorStatus = anchor?.status ?? createdJob?.anchor_status ?? 'not_submitted';
  const canAnchorEvidence = Boolean(
    evidence &&
    createdJob?.status === 'completed' &&
    !['pending', 'confirmed'].includes(anchorStatus),
  );

  useEffect(() => {
    if (!isBlackBoxMode) {
      return;
    }

    setExecutionLane('assistant_black_box');
    setTargetType('assistant');
  }, [isBlackBoxMode]);

  useEffect(() => {
    if (!isBlackBoxMode || !assistantIntegrations.length) {
      return;
    }

    const selectedIsValid = assistantIntegrations.some((integration) => integration.id === integrationId);
    if (!selectedIsValid) {
      setIntegrationId(assistantIntegrations[0].id);
    }
  }, [assistantIntegrations, integrationId, isBlackBoxMode]);

  const loadCreatedJob = async (jobId: string) => {
    const response = await jobsApi.get(jobId);
    setCreatedJob(response.job);
  };

  const createQuickAssistantIntegration = async () => {
    if (!activeMembership?.project_id) {
      return;
    }

    if (!quickAssistantId.trim() || !quickApiKey.trim()) {
      setError('Assistant ID and API key are required.');
      return;
    }

    setQuickIntegrationLoading(true);
    setError('');
    setQuickIntegrationMessage('');

    try {
      const desiredName = quickIntegrationName.trim() || 'OpenAI Assistant';
      const existingIntegration = integrations.find(
        (integration) => integration.name.trim().toLowerCase() === desiredName.toLowerCase(),
      );
      const payload = {
        projectId: activeMembership.project_id,
        name: desiredName,
        providerType: 'openai_compatible',
        baseUrl: 'https://api.openai.com/v1',
        modelIdentifier: '',
        authType: 'bearer',
        authHeaderName: 'Authorization',
        secret: quickApiKey.trim(),
        metadata: {
          assistantId: quickAssistantId.trim(),
          healthcheckPath: '',
          createdFrom: 'black_box_quick_setup',
        },
      };
      const response = existingIntegration
        ? await integrationsApi.update({
          integrationId: existingIntegration.id,
          ...payload,
        })
        : await integrationsApi.create(payload);

      setIntegrations((current) => [response.integration, ...current.filter((integration) => integration.id !== response.integration.id)]);
      setIntegrationId(response.integration.id);
      setQuickAssistantId('');
      setQuickApiKey('');
      setQuickIntegrationName('OpenAI Assistant');
      setQuickIntegrationMessage(existingIntegration ? 'Assistant integration updated and selected.' : 'Assistant integration saved and selected.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to save assistant integration');
    } finally {
      setQuickIntegrationLoading(false);
    }
  };

  const createJob = async () => {
    if (!activeMembership?.project_id) {
      return;
    }

    if (liveSuppressionEnabled && !sensitiveTargetText.trim()) {
      setError('Sensitive target text is required for black-box suppression runs.');
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
        validationScore: liveSuppressionEnabled ? undefined : Number(validationScore),
        processingTimeSeconds: liveSuppressionEnabled ? undefined : Number(processingTimeSeconds),
        status: liveSuppressionEnabled ? 'processing' : 'completed',
        runBlackBox: liveSuppressionEnabled,
        targetText: liveSuppressionEnabled ? sensitiveTargetText : undefined,
        notes,
        integrationMetadata: selectedIntegration
          ? {
            integrationId: selectedIntegration.id,
            name: selectedIntegration.name,
            providerType: selectedIntegration.provider_type,
            modelIdentifier: selectedIntegration.model_identifier,
            assistantId: selectedAssistantId,
          }
          : null,
      });

      setCreatedJob(response.job);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!createdJob?.id || createdJob.status !== 'processing') {
      return;
    }

    const interval = window.setInterval(() => {
      void loadCreatedJob(createdJob.id).catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [createdJob?.id, createdJob?.status]);

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
          {isBlackBoxMode ? 'Black-box Suppression' : 'Evidence Job Creation'}
        </div>
        <h1 className="mt-3 text-3xl font-bold text-[#111111]">
          {isBlackBoxMode ? 'Run Black-box Suppression' : 'Run Unlearning Workflow'}
        </h1>
        <p className="mt-2 max-w-3xl text-[#4B4B4B]">
          {isBlackBoxMode
            ? 'Run a real suppression attempt against an assistant-backed OpenAI-compatible integration. Forg3t measures the observed behavior, computes validation score and processing time automatically, and keeps raw target text out of evidence and Avalanche data.'
            : 'Run a real black-box suppression job against an assistant-backed integration or create a manual review record, then generate sanitized evidence and optionally anchor commitments on Avalanche.'}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.1fr,1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-[#111111]">
            {isBlackBoxMode ? 'Suppression Input' : 'Job Input'}
          </h2>
          <div className="mt-6 grid gap-4">
            {isBlackBoxMode && canManageIntegrations && (
              <div className="rounded-xl border border-blue-100 bg-[#F8FBFF] p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-[#111111]">Quick OpenAI Assistant Setup</h3>
                    <p className="mt-1 text-sm text-[#4B4B4B]">
                      Save an Assistant ID and API key here, then run suppression from the same screen.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#2F80ED]">
                    Encrypted secret
                  </span>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,1.2fr,1.2fr]">
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Integration Name</span>
                    <input
                      value={quickIntegrationName}
                      onChange={(event) => setQuickIntegrationName(event.target.value)}
                      placeholder="OpenAI Assistant"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                    />
                  </label>
                  <label>
                    <span className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <span>OpenAI Assistant ID</span>
                      <a
                        href="https://platform.openai.com/assistants"
                        target="_blank"
                        rel="noreferrer"
                        className="normal-case tracking-normal text-[#2F80ED] underline"
                      >
                        Open Assistants
                      </a>
                    </span>
                    <input
                      value={quickAssistantId}
                      onChange={(event) => setQuickAssistantId(event.target.value)}
                      placeholder="asst_..."
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                    />
                  </label>
                  <label>
                    <span className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <span>OpenAI API Key</span>
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noreferrer"
                        className="normal-case tracking-normal text-[#2F80ED] underline"
                      >
                        Open API keys
                      </a>
                    </span>
                    <input
                      type="password"
                      value={quickApiKey}
                      onChange={(event) => setQuickApiKey(event.target.value)}
                      placeholder="sk-..."
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={createQuickAssistantIntegration}
                    disabled={quickIntegrationLoading || !quickAssistantId.trim() || !quickApiKey.trim()}
                    className="rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2B2B2B] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {quickIntegrationLoading ? 'Saving assistant...' : 'Save and select assistant'}
                  </button>
                  <p className="text-xs text-[#4B4B4B]">
                    Base URL is set to https://api.openai.com/v1. Use the OpenAI links above to find the Assistant ID and create an API key.
                  </p>
                </div>
                {quickIntegrationMessage && (
                  <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    {quickIntegrationMessage}
                  </div>
                )}
              </div>
            )}
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
            {!isBlackBoxMode && (
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
            )}
            <div className={`grid gap-4 ${isBlackBoxMode ? 'md:grid-cols-1' : 'md:grid-cols-3'}`}>
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {isBlackBoxMode ? 'OpenAI Assistant Integration' : 'Integration'}
                </span>
                <select
                  value={integrationId}
                  onChange={(event) => setIntegrationId(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                >
                  <option value="">{isBlackBoxMode ? 'Select an assistant-backed integration' : 'No integration'}</option>
                  {(isBlackBoxMode ? assistantIntegrations : integrations).map((integration) => (
                    <option key={integration.id} value={integration.id}>
                      {integration.name} ({integration.status})
                    </option>
                  ))}
                </select>
              </label>
              {!liveSuppressionEnabled && !isBlackBoxMode && (
                <>
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Manual Validation Score</span>
                    <input
                      value={validationScore}
                      onChange={(event) => setValidationScore(event.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                    />
                    <p className="mt-2 text-xs text-[#4B4B4B]">
                      Manual records only. Black-box runs calculate this from observed suppression checks.
                    </p>
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Manual Processing Time (s)</span>
                    <input
                      value={processingTimeSeconds}
                      onChange={(event) => setProcessingTimeSeconds(event.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                    />
                    <p className="mt-2 text-xs text-[#4B4B4B]">
                      Manual records only. Black-box runs measure this server-side.
                    </p>
                  </label>
                </>
              )}
            </div>
            {executionLane === 'assistant_black_box' && (
              liveSuppressionEnabled ? (
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Sensitive Target Text (runtime only)</span>
                  <textarea
                    value={sensitiveTargetText}
                    onChange={(event) => setSensitiveTargetText(event.target.value)}
                    rows={4}
                    placeholder="Enter the exact phrase or sensitive material to suppress. This is used at runtime only and is not written to the database or chain."
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                  />
                  <p className="mt-2 text-sm text-[#4B4B4B]">
                    Stored integration secret + Assistant ID `{selectedAssistantId}` will be used server-side. Raw target text stays out of evidence manifests and Avalanche data.
                  </p>
                </label>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Select an OpenAI-compatible integration with an Assistant ID in Settings to run live black-box suppression.
                  {isBlackBoxMode && (
                    <Link to="/settings" className="ml-1 font-semibold text-amber-900 underline">
                      Open Settings
                    </Link>
                  )}
                </div>
              )
            )}
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
              {loading
                ? liveSuppressionEnabled ? 'Starting suppression...' : 'Creating...'
                : liveSuppressionEnabled ? 'Run black-box suppression' : 'Create job and evidence'}
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
                {createdJob.status === 'processing' && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-[#111111]">
                    <div className="font-semibold">Suppression run in progress</div>
                    <div className="mt-1 text-[#4B4B4B]">
                      {runtimeState?.message ?? 'Processing black-box suppression through the configured integration.'}
                    </div>
                    {typeof runtimeState?.percent === 'number' && (
                      <div className="mt-3">
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
                {createdJob.status === 'failed' && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    <div className="font-semibold">Suppression run failed</div>
                    <div className="mt-1">
                      {createdJob.error_message ?? runtimeState?.message ?? 'The assistant run did not complete. Check the integration and retry.'}
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Evidence Hash</div>
                  <div className="mt-2 break-all font-mono text-sm text-[#111111]">{evidence?.evidence_hash ?? 'Pending'}</div>
                  <div className="mt-3"><CopyButton value={evidence?.evidence_hash} /></div>
                </div>
                <div className="grid gap-3">
                  <button
                    type="button"
                    onClick={anchorEvidence}
                    disabled={loading || !canAnchorEvidence}
                    className="inline-flex items-center justify-center rounded-xl bg-[#E84142] px-4 py-3 text-sm font-semibold text-white hover:bg-[#c73435] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    {anchorStatus === 'confirmed'
                      ? 'Anchored on Avalanche'
                      : anchorStatus === 'pending'
                      ? 'Anchor pending'
                      : 'Anchor on Avalanche'}
                  </button>
                  <button
                    type="button"
                    onClick={downloadBundle}
                    disabled={!evidence || createdJob.status !== 'completed'}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
                  >
                    Download Evidence Bundle
                  </button>
                  <button
                    type="button"
                    onClick={exportPdf}
                    disabled={loading || createdJob.status !== 'completed'}
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
