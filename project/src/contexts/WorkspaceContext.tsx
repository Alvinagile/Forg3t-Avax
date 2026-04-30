import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { ProjectMembership } from '../types/domain';
import { WorkspaceContext } from './WorkspaceContextStore';

const ACTIVE_PROJECT_STORAGE_KEY = 'forg3t.activeProjectId';

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
      setMemberships([]);
      setLoading(false);
      return;
    }

    const nextMemberships = (data ?? []) as ProjectMembership[];
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
