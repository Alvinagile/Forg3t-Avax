import { Link } from 'react-router-dom';
import type { JobRecord } from '../types/domain';
import { formatDate, getAnchorRecord, getEvidenceRecord, shortHash } from '../lib/domainUtils';
import { StatusBadge } from './StatusBadge';

interface JobsTableProps {
  jobs: JobRecord[];
  loading?: boolean;
  emptyMessage?: string;
}

export function JobsTable({ jobs, loading, emptyMessage = 'No jobs yet.' }: JobsTableProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-[#4B4B4B] shadow-sm">
        Loading jobs...
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-[#111111]">Nothing to review yet</p>
        <p className="mt-2 text-sm text-[#4B4B4B]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Job', 'Status', 'Created', 'Completed', 'Target', 'Lane', 'Integration', 'Validation', 'Evidence', 'Anchor', 'Tx'].map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jobs.map((job) => {
              const evidence = getEvidenceRecord(job);
              const anchor = getAnchorRecord(job);

              return (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <Link to={`/dashboard/jobs/${job.id}`} className="block">
                      <div className="font-semibold text-[#111111]">{shortHash(job.id, 8, 6)}</div>
                      <div className="mt-1 max-w-xs text-sm text-[#4B4B4B]">
                        {job.target_scope_summary || job.request_reason}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-4"><StatusBadge status={job.status} /></td>
                  <td className="px-4 py-4 text-sm text-[#4B4B4B]">{formatDate(job.created_at)}</td>
                  <td className="px-4 py-4 text-sm text-[#4B4B4B]">{formatDate(job.completed_at)}</td>
                  <td className="px-4 py-4 text-sm text-[#111111]">{job.target_type}</td>
                  <td className="px-4 py-4 text-sm text-[#111111]">{job.execution_lane}</td>
                  <td className="px-4 py-4 text-sm text-[#111111]">
                    {job.integrations ? (
                      <div>
                        <div className="font-medium text-[#111111]">{job.integrations.name}</div>
                        <div className="text-xs text-[#4B4B4B]">
                          {job.integrations.provider_type.replaceAll('_', ' ')}
                          {job.integrations.model_identifier ? ` · ${job.integrations.model_identifier}` : ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#4B4B4B]">Direct workflow</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-[#111111]">
                    {job.validation_score !== null && job.validation_score !== undefined ? Number(job.validation_score).toFixed(2) : 'N/A'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={job.evidence_status} />
                      {evidence && (
                        <Link
                          to={`/dashboard/evidence/${evidence.id}`}
                          className="text-xs font-medium text-[#2F80ED] hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4"><StatusBadge status={anchor?.status ?? job.anchor_status} /></td>
                  <td className="px-4 py-4 text-sm text-[#4B4B4B] font-mono">
                    {shortHash(anchor?.transaction_hash ?? job.blockchain_tx_hash, 10, 6)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
