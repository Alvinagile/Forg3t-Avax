import { useWorkspace } from '../hooks/useWorkspace';

export function ProjectSwitcher() {
  const { memberships, activeProjectId, setActiveProjectId } = useWorkspace();

  if (memberships.length <= 1) {
    return null;
  }

  return (
    <div className="px-2 pb-3">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Workspace
      </label>
      <select
        value={activeProjectId ?? ''}
        onChange={(event) => setActiveProjectId(event.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
      >
        {memberships.map((membership) => (
          <option key={membership.project_id} value={membership.project_id}>
            {membership.projects.name} ({membership.role})
          </option>
        ))}
      </select>
    </div>
  );
}
