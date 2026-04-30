import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Link2,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { JobsTable } from '../components/JobsTable';
import { StatusBadge } from '../components/StatusBadge';
import { useWorkspace } from '../hooks/useWorkspace';
import { integrationsApi, jobsApi, pipelinesApi } from '../lib/api';
import { getAnchorRecord } from '../lib/domainUtils';
import type { Integration, JobRecord, VerificationPipeline } from '../types/domain';

export function Dashboard() {
  const { activeMembership, loading: workspaceLoading } = useWorkspace();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [pipelines, setPipelines] = useState<VerificationPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeMembership?.project_id) {
      setJobs([]);
      setIntegrations([]);
      setPipelines([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    Promise.all([
      jobsApi.list(activeMembership.project_id),
      integrationsApi.list(activeMembership.project_id),
      pipelinesApi.list(activeMembership.project_id),
    ])
      .then(([jobsResponse, integrationsResponse, pipelinesResponse]) => {
        setJobs(jobsResponse.jobs);
        setIntegrations(integrationsResponse.integrations);
        setPipelines(pipelinesResponse.pipelines);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : 'Failed to load dashboard');
      })
      .finally(() => setLoading(false));
  }, [activeMembership?.project_id]);

  const stats = useMemo(() => {
    const confirmedAnchors = jobs.filter((job) => (getAnchorRecord(job)?.status ?? job.anchor_status) === 'confirmed').length;
    const readyEvidence = jobs.filter((job) => job.evidence_status === 'ready').length;

    return {
      totalJobs: jobs.length,
      completedJobs: jobs.filter((job) => job.status === 'completed').length,
      pendingJobs: jobs.filter((job) => ['pending', 'processing'].includes(job.status)).length,
      readyEvidence,
      confirmedAnchors,
    };
  }, [jobs]);

  if (workspaceLoading || loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-[#F5F9FF] to-[#EEF6FF] p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2F80ED]">
              Forg3t Control Plane
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#111111]">
              {activeMembership?.projects.name}
            </h1>
            <p className="mt-3 max-w-2xl text-base text-[#4B4B4B]">
              Operate unlearning jobs, generate sanitized evidence bundles, anchor commitments on Avalanche,
              and hand auditors a verification flow without exposing private tenant data.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              to="/unlearning"
              className="inline-flex items-center justify-center rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2870CE]"
            >
              Create Job
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              to="/dashboard/verify"
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-[#111111] transition-colors hover:border-[#2F80ED] hover:text-[#2F80ED]"
            >
              Open Verify Desk
            </Link>
          </div>
        </div>
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Total Jobs', value: stats.totalJobs, icon: BriefcaseBusiness },
          { label: 'Completed Jobs', value: stats.completedJobs, icon: CheckCircle2 },
          { label: 'Pending Jobs', value: stats.pendingJobs, icon: Route },
          { label: 'Evidence Ready', value: stats.readyEvidence, icon: ShieldCheck },
          { label: 'Anchors Confirmed', value: stats.confirmedAnchors, icon: Link2 },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#4B4B4B]">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold text-[#111111]">{card.value}</p>
                </div>
                <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.7fr,1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#111111]">Recent Jobs</h2>
              <p className="text-sm text-[#4B4B4B]">Latest unlearning and verification activity in this workspace.</p>
            </div>
            <Link to="/dashboard/jobs" className="text-sm font-semibold text-[#2F80ED] hover:underline">
              View all jobs
            </Link>
          </div>
          <JobsTable jobs={jobs.slice(0, 6)} emptyMessage="Create a job to generate evidence and anchor metadata." />
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#111111]">Integrations</h3>
                <p className="mt-1 text-sm text-[#4B4B4B]">Hosted AI systems and endpoint connectivity.</p>
              </div>
              <Link to="/settings" className="text-sm font-semibold text-[#2F80ED] hover:underline">
                Manage
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {integrations.length ? integrations.slice(0, 4).map((integration) => (
                <div key={integration.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-[#111111]">{integration.name}</div>
                      <div className="mt-1 text-sm text-[#4B4B4B]">
                        {integration.provider_type.replaceAll('_', ' ')}{integration.model_identifier ? ` · ${integration.model_identifier}` : ''}
                      </div>
                    </div>
                    <StatusBadge status={integration.status} />
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-[#4B4B4B]">
                  No integrations configured yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#111111]">Verification Pipelines</h3>
                <p className="mt-1 text-sm text-[#4B4B4B]">Reusable project-scoped orchestration for repeated jobs.</p>
              </div>
              <Link to="/dashboard/pipelines" className="text-sm font-semibold text-[#2F80ED] hover:underline">
                Open
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {pipelines.length ? pipelines.slice(0, 3).map((pipeline) => (
                <div key={pipeline.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="font-semibold text-[#111111]">{pipeline.name}</div>
                  <div className="mt-1 text-sm text-[#4B4B4B]">
                    {pipeline.description || 'No description provided'}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <StatusBadge status={pipeline.trigger_mode} />
                    <span className="text-xs text-gray-500">
                      {pipeline.pipeline_runs?.length ?? 0} runs
                    </span>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-[#4B4B4B]">
                  No verification pipelines configured yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
