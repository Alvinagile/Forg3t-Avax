import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireUser } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";

const INTEGRATION_ROLES = ["owner", "admin", "developer"] as const;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function buildOpenAIModelsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/v1") ? `${normalized}/models` : `${normalized}/v1/models`;
}

function buildOpenAIAssistantUrl(baseUrl: string, assistantId: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/v1")
    ? `${normalized}/assistants/${assistantId}`
    : `${normalized}/v1/assistants/${assistantId}`;
}

function sanitizeMetadata(input: unknown) {
  if (!input || typeof input !== "object") {
    return {};
  }

  const metadata = input as Record<string, unknown>;
  return {
    healthcheckPath: typeof metadata.healthcheckPath === "string" ? metadata.healthcheckPath.slice(0, 120) : null,
    assistantId: typeof metadata.assistantId === "string" ? metadata.assistantId.slice(0, 120) : null,
    defaultHeaders: metadata.defaultHeaders && typeof metadata.defaultHeaders === "object"
      ? Object.fromEntries(
        Object.entries(metadata.defaultHeaders as Record<string, unknown>)
          .filter(([key]) => !key.toLowerCase().includes("authorization") && !key.toLowerCase().includes("key"))
          .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 120) : String(value)]),
      )
      : {},
    description: typeof metadata.description === "string" ? metadata.description.slice(0, 240) : null,
  };
}

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

async function listIntegrations(userContext: Awaited<ReturnType<typeof requireUser>>, url: URL) {
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, url.searchParams.get("projectId"));
  await requireProjectMembership(serviceClient, projectId, user.id);

  const { data, error } = await serviceClient
    .from("integrations")
    .select("id, project_id, name, provider_type, base_url, model_identifier, auth_type, auth_header_name, status, last_tested_at, last_error, metadata, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "Failed to load integrations");
  }

  return jsonResponse({
    integrations: data ?? [],
  });
}

async function getIntegration(userContext: Awaited<ReturnType<typeof requireUser>>, integrationId: string) {
  const { user, serviceClient } = userContext;
  const { data, error } = await serviceClient
    .from("integrations")
    .select("id, project_id, name, provider_type, base_url, model_identifier, auth_type, auth_header_name, status, last_tested_at, last_error, metadata, created_at, updated_at")
    .eq("id", integrationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load integration");
  }

  if (!data) {
    throw new HttpError(404, "Integration not found");
  }

  await requireProjectMembership(serviceClient, data.project_id, user.id);

  const { data: secretData } = await serviceClient
    .from("integration_secrets")
    .select("integration_id")
    .eq("integration_id", integrationId)
    .maybeSingle();

  return jsonResponse({
    integration: {
      ...data,
      secretConfigured: Boolean(secretData),
    },
  });
}

async function createIntegration(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, body.projectId ?? null);
  await requireProjectMembership(serviceClient, projectId, user.id, [...INTEGRATION_ROLES]);

  const providerType = body.providerType === "generic_http" ? "generic_http" : "openai_compatible";
  const authType = body.authType === "none" || body.authType === "header" ? body.authType : "bearer";
  const integrationId = crypto.randomUUID();

  const { data, error } = await serviceClient
    .from("integrations")
    .insert({
      id: integrationId,
      project_id: projectId,
      name: String(body.name ?? "Integration").slice(0, 120),
      provider_type: providerType,
      base_url: normalizeBaseUrl(String(body.baseUrl ?? "")),
      model_identifier: typeof body.modelIdentifier === "string" ? body.modelIdentifier.slice(0, 240) : null,
      auth_type: authType,
      auth_header_name: authType === "header"
        ? String(body.authHeaderName ?? "x-api-key").slice(0, 120)
        : authType === "bearer"
        ? "Authorization"
        : null,
      status: "not_tested",
      metadata: sanitizeMetadata(body.metadata),
      created_by: user.id,
    })
    .select("id, project_id, name, provider_type, base_url, model_identifier, auth_type, auth_header_name, status, last_tested_at, last_error, metadata, created_at, updated_at")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new HttpError(409, "An integration with this name already exists in the workspace");
    }

    throw new HttpError(500, "Failed to create integration");
  }

  if (typeof body.secret === "string" && body.secret.trim()) {
    const encrypted = await encryptSecret(body.secret.trim());

    const { error: secretError } = await serviceClient
      .from("integration_secrets")
      .upsert({
        integration_id: integrationId,
        secret_ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
      });

    if (secretError) {
      throw new HttpError(500, "Failed to persist integration secret");
    }
  }

  return jsonResponse({
    integration: {
      ...data,
      secretConfigured: Boolean(body.secret),
    },
  });
}

async function updateIntegration(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const integrationId = body.integrationId as string | undefined;

  if (!integrationId) {
    throw new HttpError(400, "integrationId is required");
  }

  const { user, serviceClient } = userContext;
  const { data: current, error: currentError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .maybeSingle();

  if (currentError) {
    throw new HttpError(500, "Failed to load integration");
  }

  if (!current) {
    throw new HttpError(404, "Integration not found");
  }

  await requireProjectMembership(serviceClient, current.project_id, user.id, [...INTEGRATION_ROLES]);

  const nextAuthType = body.authType === "none" || body.authType === "header" ? body.authType : body.authType === "bearer" ? "bearer" : current.auth_type;

  const { data, error } = await serviceClient
    .from("integrations")
    .update({
      name: typeof body.name === "string" ? body.name.slice(0, 120) : current.name,
      provider_type: body.providerType === "generic_http" ? "generic_http" : body.providerType === "openai_compatible" ? "openai_compatible" : current.provider_type,
      base_url: typeof body.baseUrl === "string" ? normalizeBaseUrl(body.baseUrl) : current.base_url,
      model_identifier: typeof body.modelIdentifier === "string" ? body.modelIdentifier.slice(0, 240) : current.model_identifier,
      auth_type: nextAuthType,
      auth_header_name: nextAuthType === "header"
        ? String(body.authHeaderName ?? current.auth_header_name ?? "x-api-key").slice(0, 120)
        : nextAuthType === "bearer"
        ? "Authorization"
        : null,
      metadata: body.metadata ? sanitizeMetadata(body.metadata) : current.metadata,
      status: "not_tested",
      last_error: null,
    })
    .eq("id", integrationId)
    .select("id, project_id, name, provider_type, base_url, model_identifier, auth_type, auth_header_name, status, last_tested_at, last_error, metadata, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new HttpError(500, "Failed to update integration");
  }

  if (typeof body.secret === "string" && body.secret.trim()) {
    const encrypted = await encryptSecret(body.secret.trim());

    const { error: secretError } = await serviceClient
      .from("integration_secrets")
      .upsert({
        integration_id: integrationId,
        secret_ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
      });

    if (secretError) {
      throw new HttpError(500, "Failed to update integration secret");
    }
  }

  const { data: secretData } = await serviceClient
    .from("integration_secrets")
    .select("integration_id")
    .eq("integration_id", integrationId)
    .maybeSingle();

  return jsonResponse({
    integration: {
      ...data,
      secretConfigured: Boolean(secretData),
    },
  });
}

async function testIntegration(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const integrationId = body.integrationId as string | undefined;

  if (!integrationId) {
    throw new HttpError(400, "integrationId is required");
  }

  const { user, serviceClient } = userContext;
  const { data: integration, error: integrationError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .maybeSingle();

  if (integrationError) {
    throw new HttpError(500, "Failed to load integration");
  }

  if (!integration) {
    throw new HttpError(404, "Integration not found");
  }

  await requireProjectMembership(serviceClient, integration.project_id, user.id, [...INTEGRATION_ROLES]);

  const { data: secretRecord, error: secretError } = await serviceClient
    .from("integration_secrets")
    .select("secret_ciphertext, iv")
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (secretError) {
    throw new HttpError(500, "Failed to load integration secret");
  }

  const secret = secretRecord ? await decryptSecret(secretRecord.secret_ciphertext, secretRecord.iv) : null;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (integration.auth_type === "bearer" && secret) {
    headers["Authorization"] = `Bearer ${secret}`;
  }

  if (integration.auth_type === "header" && secret) {
    headers[integration.auth_header_name ?? "x-api-key"] = secret;
  }

  const metadata = (integration.metadata ?? {}) as Record<string, unknown>;
  const healthcheckPath = typeof metadata.healthcheckPath === "string" ? metadata.healthcheckPath : null;
  const assistantId = typeof metadata.assistantId === "string" ? metadata.assistantId : null;
  const defaultHeaders = metadata.defaultHeaders && typeof metadata.defaultHeaders === "object"
    ? metadata.defaultHeaders as Record<string, string>
    : {};

  for (const [key, value] of Object.entries(defaultHeaders)) {
    headers[key] = value;
  }

  if (assistantId) {
    headers["OpenAI-Beta"] = "assistants=v2";
  }

  const targetUrl = integration.provider_type === "openai_compatible"
    ? assistantId
      ? buildOpenAIAssistantUrl(integration.base_url, assistantId)
      : buildOpenAIModelsUrl(integration.base_url)
    : `${normalizeBaseUrl(integration.base_url)}${healthcheckPath ?? ""}`;

  try {
    const response = await fetch(targetUrl, {
      method: integration.provider_type === "openai_compatible" ? "GET" : "GET",
      headers,
    });

    const responseText = await response.text();
    const success = response.ok;
    const now = new Date().toISOString();

    await serviceClient
      .from("integrations")
      .update({
        status: success ? "connected" : "failed",
        last_tested_at: now,
        last_error: success ? null : responseText.slice(0, 400),
      })
      .eq("id", integrationId);

    return jsonResponse({
      test: {
        success,
        status: success ? "connected" : "failed",
        checkedAt: now,
        responseCode: response.status,
        message: success ? "Connection successful" : "Connection failed",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    const now = new Date().toISOString();

    await serviceClient
      .from("integrations")
      .update({
        status: "failed",
        last_tested_at: now,
        last_error: message.slice(0, 400),
      })
      .eq("id", integrationId);

    return jsonResponse({
      test: {
        success: false,
        status: "failed",
        checkedAt: now,
        message,
      },
    });
  }
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
      const integrationId = url.searchParams.get("integrationId");

      if (integrationId) {
        return await getIntegration(userContext, integrationId);
      }

      return await listIntegrations(userContext, url);
    }

    if (req.method === "POST") {
      const clone = req.clone();
      const body = await clone.json().catch(() => ({}));
      const action = body.action ?? "create";

      if (action === "create") {
        return await createIntegration(req, userContext);
      }

      if (action === "update") {
        return await updateIntegration(req, userContext);
      }

      if (action === "test") {
        return await testIntegration(req, userContext);
      }

      throw new HttpError(400, "Unsupported integration action");
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return handleError(error);
  }
});
