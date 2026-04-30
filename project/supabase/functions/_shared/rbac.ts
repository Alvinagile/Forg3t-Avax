import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./errors.ts";

export const projectRoles = [
  "owner",
  "admin",
  "compliance",
  "auditor",
  "developer",
  "viewer",
] as const;

export type ProjectRole = typeof projectRoles[number];

export interface Membership {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  projects?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  } | null;
}

export function hasRole(role: string | null | undefined, allowed: ProjectRole[]) {
  return Boolean(role && allowed.includes(role as ProjectRole));
}

export async function requireProjectMembership(
  serviceClient: SupabaseClient,
  projectId: string,
  userId: string,
  allowedRoles?: ProjectRole[],
) {
  const { data, error } = await serviceClient
    .from("project_memberships")
    .select(`
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
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to resolve project membership");
  }

  if (!data) {
    throw new HttpError(403, "Project access denied");
  }

  if (allowedRoles && !hasRole(data.role, allowedRoles)) {
    throw new HttpError(403, "Insufficient permissions");
  }

  return data as Membership;
}
