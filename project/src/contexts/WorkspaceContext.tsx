import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { jobsApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import type { ProjectMembership } from '../types/domain';
import { WorkspaceContext } from './WorkspaceContextStore';

const ACTIVE_PROJECT_STORAGE_KEY = 'forg3t.activeProjectId';

async function recoverMembershipFromJobs(userId: string): Promise<ProjectMembership[]> {
  const jobsResponse = await jobsApi.list();
  const firstJob = jobsResponse.jobs[0];

  if (!firstJob?.project_id) {
    return [];
  }

  let projectName = 'Recovered Workspace';
  let projectSlug = `workspace-${firstJob.project_id.slice(0, 8)}`;

  try {
    const jobResponse = await jobsApi.get(firstJob.id);
    const evidence = Array.isArray(jobResponse.job.evidence_records)
      ? jobResponse.job.evidence_records[0]
      : jobResponse.job.evidence_records;
    const manifest = evidence?.manifest;

    if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
      const projectNameValue = (manifest as Record<string, unknown>).projectName;
      const projectSlugValue = (manifest as Record<string, unknown>).projectSlug;
      if (typeof projectNameValue === 'string' && projectNameValue.trim()) {
        projectName = projectNameValue;
      }
      if (typeof projectSlugValue === 'string' && projectSlugValue.trim()) {
        projectSlug = projectSlugValue;
      }
    }
  } catch {
    // Keep the fallback workspace if detailed evidence metadata is unavailable.
  }

  return [{
    id: `recovered-${firstJob.project_id}`,
    project_id: firstJob.project_id,
    user_id: userId,
    role: 'owner',
    projects: {
      id: firstJob.project_id,
      name: projectName,
      slug: projectSlug,
      description: 'Recovered from verified workspace activity while membership policies are unavailable.',
    },
  }];
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<ProjectMembership[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(
    localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setActiveProjectIdState(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    let nextMemberships: ProjectMembership[];

    try {
      const { data, error } = await supabase
        .from('project_memberships')
        .select(`
          id,
          project_id,
          user_id,
          role,
          projects (
            id,
            name,
            slug,
            description
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      nextMemberships = (data ?? []) as ProjectMembership[];
    } catch {
      nextMemberships = await recoverMembershipFromJobs(user.id).catch(() => []);
    }

    setMemberships(nextMemberships);

    const nextActiveProjectId = activeProjectId && nextMemberships.some((membership) => membership.project_id === activeProjectId)
      ? activeProjectId
      : nextMemberships[0]?.project_id ?? null;

    setActiveProjectIdState(nextActiveProjectId);
    if (nextActiveProjectId) {
      localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, nextActiveProjectId);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    }

    setLoading(false);
  }, [activeProjectId, user]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setActiveProjectId = (projectId: string) => {
    setActiveProjectIdState(projectId);
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
  };

  const value = useMemo(() => {
    const activeMembership = memberships.find((membership) => membership.project_id === activeProjectId) ?? memberships[0] ?? null;

    return {
      memberships,
      activeProjectId: activeMembership?.project_id ?? null,
      activeMembership,
      loading,
      refresh,
      setActiveProjectId,
    };
  }, [activeProjectId, loading, memberships, refresh]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
