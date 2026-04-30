import { createContext } from 'react';
import type { ProjectMembership } from '../types/domain';

export interface WorkspaceContextValue {
  memberships: ProjectMembership[];
  activeProjectId: string | null;
  activeMembership: ProjectMembership | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActiveProjectId: (projectId: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);
