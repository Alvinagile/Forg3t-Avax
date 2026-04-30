import { useEffect, useState } from 'react';
import { Play, Plus } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { useWorkspace } from '../hooks/useWorkspace';
import { pipelinesApi } from '../lib/api';
import { roleCanManagePipelines } from '../lib/domainUtils';
import type { VerificationPipeline } from '../types/domain';

export function Pipelines() {
  const { activeMembership } = useWorkspace();
  const [pipelines, setPipelines] = useState<VerificationPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetScopeSummary, setTargetScopeSummary] = useState('');
  const [targetType, setTargetType] = useState('assistant');
  const [anchorRequired, setAnchorRequired] = useState(true);
  const [exportRequired, setExportRequired] = useState(true);
  const [triggerMode, setTriggerMode] = useState<'manual' | 'scheduled'>('manual');

  const canManagePipelines = roleCanManagePipelines(activeMembership?.role);

  const loadPipelines = async () => {
    if (!activeMembership?.project_id) {
      setPipelines([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await pipelinesApi.list(activeMembership.project_id);
      setPipelines(response.pipelines);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPipelines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembership?.project_id]);

  const createPipeline = async () => {
    if (!activeMembership?.project_id) {
      return;
    }

    setCreating(true);
    setError('');

    try {
      await pipelinesApi.create({
        projectId: activeMembership.project_id,
        name,
        description,
        targetScope: {
          summary: targetScopeSummary,
          items: [
            {
              requestReason: name,
              targetScopeSummary,
              targetType,
            },
          ],
        },
        validationConfig: {
          reviewMode: 'manual',
        },
        evidenceConfig: {
          artifact: 'sanitized_bundle',
        },
        anchorRequired,
        exportRequired,
        triggerMode,
      });

      setName('');
      setDescription('');
      setTargetScopeSummary('');
      setTargetType('assistant');
      setAnchorRequired(true);
      setExportRequired(true);
      setTriggerMode('manual');
      await loadPipelines();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to create pipeline');
    } finally {
      setCreating(false);
    }
  };

  const runPipeline = async (pipelineId: string) => {
    setError('');
    try {
      await pipelinesApi.run(pipelineId);
      await loadPipelines();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to run pipeline');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#111111]">Verification Pipelines</h1>
        <p className="mt-2 text-[#4B4B4B]">
          Reuse project-scoped validation and evidence requirements across multiple unlearning jobs.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {canManagePipelines && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#111111]">Create Pipeline</h2>
              <p className="text-sm text-[#4B4B4B]">Define repeatable target scope, validation, evidence, and export requirements.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                placeholder="GDPR Article 17 Review"
              />
            </label>
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
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                placeholder="Reusable workflow for validation, evidence review, anchoring, and reporting."
              />
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Target Scope Summary</span>
              <textarea
                value={targetScopeSummary}
                onChange={(event) => setTargetScopeSummary(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                placeholder="Summarise the affected tenant scope without including raw customer content."
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Trigger Mode</span>
              <select
                value={triggerMode}
                onChange={(event) => setTriggerMode(event.target.value as 'manual' | 'scheduled')}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
              >
                <option value="manual">manual</option>
                <option value="scheduled">scheduled</option>
              </select>
            </label>
            <div className="flex flex-col gap-3 justify-center">
              <label className="flex items-center gap-3 text-sm text-[#111111]">
                <input type="checkbox" checked={anchorRequired} onChange={(event) => setAnchorRequired(event.target.checked)} />
                Anchor required
              </label>
              <label className="flex items-center gap-3 text-sm text-[#111111]">
                <input type="checkbox" checked={exportRequired} onChange={(event) => setExportRequired(event.target.checked)} />
                Export required
              </label>
            </div>
          </div>
          <div className="mt-6">
            <button
              type="button"
              disabled={creating || !name.trim()}
              onClick={createPipeline}
              className="rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2870CE] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create pipeline'}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            Loading pipelines...
          </div>
        ) : pipelines.length ? pipelines.map((pipeline) => (
          <div key={pipeline.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={pipeline.trigger_mode} />
                  <StatusBadge status={pipeline.anchor_required ? 'confirmed' : 'not_submitted'} />
                  <StatusBadge status={pipeline.export_required ? 'ready' : 'not_generated'} />
                </div>
                <h2 className="mt-3 text-2xl font-bold text-[#111111]">{pipeline.name}</h2>
                <p className="mt-2 max-w-3xl text-sm text-[#4B4B4B]">
                  {pipeline.description || 'No description provided'}
                </p>
              </div>
              {canManagePipelines && (
                <button
                  type="button"
                  onClick={() => runPipeline(pipeline.id)}
                  className="inline-flex items-center rounded-xl bg-[#111111] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Run pipeline
                </button>
              )}
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Target Scope</div>
                <pre className="mt-3 overflow-auto text-xs text-[#111111]">
                  {JSON.stringify(pipeline.target_scope, null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent Runs</div>
                <div className="mt-3 space-y-3">
                  {pipeline.pipeline_runs?.length ? pipeline.pipeline_runs.slice(0, 4).map((run) => (
                    <div key={run.id} className="rounded-xl border border-white/70 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-[#111111]">{run.id}</div>
                        <StatusBadge status={run.status} />
                      </div>
                      <div className="mt-2 text-xs text-[#4B4B4B]">
                        Jobs: {run.created_jobs.length} · Evidence: {run.created_evidence.length} · Anchors: {run.created_anchors.length} · Reports: {run.created_reports.length}
                      </div>
                    </div>
                  )) : (
                    <div className="text-sm text-[#4B4B4B]">No runs yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-[#111111]">No pipelines yet</p>
            <p className="mt-2 text-sm text-[#4B4B4B]">Create a pipeline to reuse verification requirements across multiple jobs.</p>
          </div>
        )}
      </section>
    </div>
  );
}
