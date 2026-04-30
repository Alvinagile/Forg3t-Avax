import { useEffect, useMemo, useState } from 'react';
import { Funnel, Search } from 'lucide-react';
import { JobsTable } from '../components/JobsTable';
import { useWorkspace } from '../hooks/useWorkspace';
import { jobsApi } from '../lib/api';
import { getAnchorRecord } from '../lib/domainUtils';
import type { JobRecord } from '../types/domain';

export function Jobs() {
  const {
    memberships,
    activeMembership,
    activeProjectId,
    loading: workspaceLoading,
    setActiveProjectId,
  } = useWorkspace();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [laneFilter, setLaneFilter] = useState('all');
  const [anchorFilter, setAnchorFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (!activeMembership?.project_id) {
      setJobs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    jobsApi.list(activeMembership.project_id)
      .then((response) => setJobs(response.jobs))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Failed to load jobs'))
      .finally(() => setLoading(false));
  }, [activeMembership?.project_id]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const anchorStatus = getAnchorRecord(job)?.status ?? job.anchor_status;
      const searchMatches = !search || [
        job.id,
        job.request_reason,
        job.target_scope_summary,
        job.execution_lane,
        job.target_type,
      ].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase());
      const statusMatches = statusFilter === 'all' || job.status === statusFilter;
      const laneMatches = laneFilter === 'all' || job.execution_lane === laneFilter;
      const anchorMatches = anchorFilter === 'all' || anchorStatus === anchorFilter;
      const fromMatches = !fromDate || new Date(job.created_at) >= new Date(fromDate);
      const toMatches = !toDate || new Date(job.created_at) <= new Date(`${toDate}T23:59:59`);

      return searchMatches && statusMatches && laneMatches && anchorMatches && fromMatches && toMatches;
    });
  }, [anchorFilter, fromDate, jobs, laneFilter, search, statusFilter, toDate]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#111111]">Job History</h1>
        <p className="mt-2 text-[#4B4B4B]">
          Filter unlearning, validation, anchoring, and verification activity across the active workspace.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-7 lg:grid-cols-4">
          <label className="lg:col-span-2">
            <span className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Search className="mr-2 h-3.5 w-3.5" />
              Search
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Job ID, reason, lane, target type"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
            />
          </label>

          <label>
            <span className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Funnel className="mr-2 h-3.5 w-3.5" />
              Project
            </span>
            <select
              value={activeProjectId ?? ''}
              onChange={(event) => setActiveProjectId(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
            >
              {memberships.map((membership) => (
                <option key={membership.project_id} value={membership.project_id}>
                  {membership.projects.name}
                </option>
              ))}
            </select>
          </label>

          {[
            {
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: ['all', 'pending', 'processing', 'completed', 'failed'],
            },
            {
              label: 'Lane',
              value: laneFilter,
              onChange: setLaneFilter,
              options: ['all', 'assistant_black_box', 'manual', 'pipeline', 'api_endpoint', 'white_box'],
            },
            {
              label: 'Anchor',
              value: anchorFilter,
              onChange: setAnchorFilter,
              options: ['all', 'not_submitted', 'pending', 'confirmed', 'failed'],
            },
          ].map((filter) => (
            <label key={filter.label}>
              <span className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                <Funnel className="mr-2 h-3.5 w-3.5" />
                {filter.label}
              </span>
              <select
                value={filter.value}
                onChange={(event) => filter.onChange(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
              >
                {filter.options.map((option) => (
                  <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
          ))}

          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
            />
          </label>

          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
            />
          </label>
        </div>
      </div>

      <JobsTable
        jobs={filteredJobs}
        loading={workspaceLoading || loading}
        emptyMessage="No jobs match the current filters."
      />
    </div>
  );
}
