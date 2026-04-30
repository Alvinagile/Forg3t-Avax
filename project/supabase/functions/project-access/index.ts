import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireUser } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";

const ADMIN_ROLES = ["owner", "admin"] as const;

async function resolveProjectId(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  userId: string,
  projectId?: string | null,
) {
  if (projectId) {
    return projectId;
  }

  const { data, error } = await serviceClient
    .from("project_memberships")
    .select("project_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.project_id) {
    throw new HttpError(404, "No workspace found for user");
  }

  return data.project_id as string;
}

async function listMemberships(userContext: Awaited<ReturnType<typeof requireUser>>, url: URL) {
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, url.searchParams.get("projectId"));
  await requireProjectMembership(serviceClient, projectId, user.id);

  const { data, error } = await serviceClient
    .from("project_memberships")
    .select(`
      id,
      project_id,
      user_id,
      role,
      created_at,
      updated_at,
      users (
        id,
        email,
        package_type,
        created_at,
        updated_at
      )
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new HttpError(500, "Failed to load project memberships");
  }

  return jsonResponse({
    memberships: data ?? [],
  });
}

async function addMembership(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, body.projectId ?? null);
  await requireProjectMembership(serviceClient, projectId, user.id, [...ADMIN_ROLES]);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = ["owner", "admin", "compliance", "auditor", "developer", "viewer"].includes(body.role)
    ? body.role
    : "viewer";

  if (!email) {
    throw new HttpError(400, "email is required");
  }

  const { data: userRecord, error: userError } = await serviceClient
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (userError) {
    throw new HttpError(500, "Failed to resolve user");
  }

  if (!userRecord) {
    throw new HttpError(404, "User not found. Ask them to sign up first.");
  }

  const { data, error } = await serviceClient
    .from("project_memberships")
    .upsert({
      project_id: projectId,
      user_id: userRecord.id,
      role,
      created_by: user.id,
    })
    .select(`
      id,
      project_id,
      user_id,
      role,
      created_at,
      updated_at,
      users (
        id,
        email,
        package_type,
        created_at,
        updated_at
      )
    `)
    .single();

  if (error || !data) {
    throw new HttpError(500, "Failed to add project member");
  }

  return jsonResponse({
    membership: data,
  });
}

async function updateMembership(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const membershipId = body.membershipId as string | undefined;

  if (!membershipId) {
    throw new HttpError(400, "membershipId is required");
  }

  const { user, serviceClient } = userContext;
  const { data: existingMembership, error: membershipError } = await serviceClient
    .from("project_memberships")
    .select("id, project_id, user_id, role")
    .eq("id", membershipId)
    .maybeSingle();

  if (membershipError) {
    throw new HttpError(500, "Failed to load membership");
  }

  if (!existingMembership) {
    throw new HttpError(404, "Membership not found");
  }

  await requireProjectMembership(serviceClient, existingMembership.project_id, user.id, [...ADMIN_ROLES]);
  const role = ["owner", "admin", "compliance", "auditor", "developer", "viewer"].includes(body.role)
    ? body.role
    : existingMembership.role;

  const { data, error } = await serviceClient
    .from("project_memberships")
    .update({
      role,
    })
    .eq("id", membershipId)
    .select(`
      id,
      project_id,
      user_id,
      role,
      created_at,
      updated_at,
      users (
        id,
        email,
        package_type,
        created_at,
        updated_at
      )
    `)
    .single();

  if (error || !data) {
    throw new HttpError(500, "Failed to update membership");
  }

  return jsonResponse({
    membership: data,
  });
}

async function removeMembership(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const membershipId = body.membershipId as string | undefined;

  if (!membershipId) {
    throw new HttpError(400, "membershipId is required");
  }

  const { user, serviceClient } = userContext;
  const { data: existingMembership, error: membershipError } = await serviceClient
    .from("project_memberships")
    .select("id, project_id, user_id, role")
    .eq("id", membershipId)
    .maybeSingle();

  if (membershipError) {
    throw new HttpError(500, "Failed to load membership");
  }

  if (!existingMembership) {
    throw new HttpError(404, "Membership not found");
  }

  await requireProjectMembership(serviceClient, existingMembership.project_id, user.id, [...ADMIN_ROLES]);

  if (existingMembership.role === "owner" && existingMembership.user_id === user.id) {
    throw new HttpError(409, "Project owner cannot remove themselves");
  }

  const { error } = await serviceClient
    .from("project_memberships")
    .delete()
    .eq("id", membershipId);

  if (error) {
    throw new HttpError(500, "Failed to remove membership");
  }

  return jsonResponse({
    success: true,
  });
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const userContext = await requireUser(req);
    const url = new URL(req.url);

    if (req.method === "GET") {
      return await listMemberships(userContext, url);
    }

    if (req.method === "POST") {
      const clone = req.clone();
      const body = await clone.json().catch(() => ({}));
      const action = body.action ?? "add";

      if (action === "add") {
        return await addMembership(req, userContext);
      }

      if (action === "update") {
        return await updateMembership(req, userContext);
      }

      if (action === "remove") {
        return await removeMembership(req, userContext);
      }

      throw new HttpError(400, "Unsupported access action");
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return handleError(error);
  }
});
