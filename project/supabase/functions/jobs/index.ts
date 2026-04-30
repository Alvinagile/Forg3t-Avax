import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireUser } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";
import { sha256Bytes32, stableStringify } from "../_shared/crypto.ts";

const BUILD_ROLES = ["owner", "admin", "developer"] as const;
const OPERATE_ROLES = ["owner", "admin", "developer", "compliance"] as const;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function toLimitedString(value: unknown, maxLength: number, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, maxLength);
}

function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeMetadata(input: Record<string, unknown>) {
  const validationSummary = {
    totalChecks: toOptionalNumber(input.totalTests ?? (input.validationSummary as Record<string, unknown> | undefined)?.totalChecks) ?? 0,
    passedChecks: toOptionalNumber(input.passedTests ?? (input.validationSummary as Record<string, unknown> | undefined)?.passedChecks) ?? 0,
    failedChecks: toOptionalNumber(input.failedTests ?? (input.validationSummary as Record<string, unknown> | undefined)?.failedChecks) ?? 0,
    leakScore: toOptionalNumber(input.leakScore ?? (input.validationSummary as Record<string, unknown> | undefined)?.leakScore),
    processingTimeSeconds: toOptionalNumber(input.processingTimeSeconds ?? input.processingTime),
  };

  const metadata: Record<string, JsonValue> = {
    validationSummary,
    integrationMetadata: input.integrationMetadata && typeof input.integrationMetadata === "object"
      ? sanitizeObject(input.integrationMetadata as Record<string, unknown>)
      : null,
    notes: toLimitedString(input.notes, 500) || null,
  };

  return metadata;
}

function sanitizeObject(input: Record<string, unknown>) {
  const sanitized: Record<string, JsonValue> = {};

  for (const [key, value] of Object.entries(input)) {
    if (
      key.toLowerCase().includes("key") ||
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("prompt") ||
      key.toLowerCase().includes("response") ||
      key.toLowerCase().includes("targettext")
    ) {
      continue;
    }

    if (typeof value === "string") {
      sanitized[key] = value.slice(0, 240);
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      sanitized[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 20).map((item) => {
        if (typeof item === "string") {
          return item.slice(0, 120);
        }

        if (typeof item === "number" || typeof item === "boolean" || item === null) {
          return item;
        }

        if (item && typeof item === "object") {
          return sanitizeObject(item as Record<string, unknown>);
        }

        return null;
      });
      continue;
    }

    if (value && typeof value === "object") {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    }
  }

  return sanitized;
}

async function resolveProjectId(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  userId: string,
  explicitProjectId?: string | null,
) {
  if (explicitProjectId) {
    return explicitProjectId;
  }

  const { data, error } = await serviceClient
    .from("project_memberships")
    .select("project_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to resolve project");
  }

  if (!data?.project_id) {
    throw new HttpError(404, "No workspace found for user");
  }

  return data.project_id as string;
}

async function maybeResolveIntegrationSummary(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  projectId: string,
  integrationId?: string | null,
) {
  if (!integrationId) {
    return null;
  }

  const { data, error } = await serviceClient
    .from("integrations")
    .select("id, project_id, name, provider_type, model_identifier, status")
    .eq("id", integrationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to resolve integration");
  }

  if (!data || data.project_id !== projectId) {
    throw new HttpError(404, "Integration not found");
  }

  return data;
}

async function updatePipelineRunArtifacts(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  pipelineRunId: string | null | undefined,
  jobId: string,
  evidenceId: string,
) {
  if (!pipelineRunId) {
    return;
  }

  const { data, error } = await serviceClient
    .from("pipeline_runs")
    .select("created_jobs, created_evidence")
    .eq("id", pipelineRunId)
    .maybeSingle();

  if (error || !data) {
    return;
  }

  const createdJobs = Array.isArray(data.created_jobs) ? data.created_jobs as string[] : [];
  const createdEvidence = Array.isArray(data.created_evidence) ? data.created_evidence as string[] : [];

  if (!createdJobs.includes(jobId)) {
    createdJobs.push(jobId);
  }

  if (!createdEvidence.includes(evidenceId)) {
    createdEvidence.push(evidenceId);
  }

  await serviceClient
    .from("pipeline_runs")
    .update({
      created_jobs: createdJobs,
      created_evidence: createdEvidence,
    })
    .eq("id", pipelineRunId);
}

async function buildEvidenceData(params: {
  evidenceId: string;
  job: Record<string, unknown>;
  project: { id: string; name: string; slug: string };
  integration: Record<string, unknown> | null;
}) {
  const jobHash = await sha256Bytes32(String(params.job.id));
  const metadata = (params.job.metadata ?? {}) as Record<string, unknown>;
  const validationSource = (metadata.validationSummary ?? {}) as Record<string, unknown>;
  const validationSummary = {
    validationScore: params.job.validation_score ?? null,
    processingTimeSeconds: params.job.processing_time_seconds ?? null,
    totalChecks: validationSource.totalChecks ?? 0,
    passedChecks: validationSource.passedChecks ?? 0,
    failedChecks: validationSource.failedChecks ?? 0,
    leakScore: validationSource.leakScore ?? null,
    status: params.job.status,
  };

  const manifest = {
    schemaVersion: "forg3t.evidence-bundle/v1",
    evidenceId: params.evidenceId,
    jobId: params.job.id,
    projectId: params.project.id,
    projectName: params.project.name,
    projectSlug: params.project.slug,
    generatedAt: params.job.completed_at ?? params.job.created_at,
    createdBy: params.job.created_by,
    targetType: params.job.target_type,
    executionLane: params.job.execution_lane,
    requestReasonSummary: params.job.request_reason,
    targetScopeSummary: params.job.target_scope_summary,
    validationSummary,
    integration: params.integration
      ? {
        id: params.integration.id,
        name: params.integration.name,
        providerType: params.integration.provider_type,
        modelIdentifier: params.integration.model_identifier ?? null,
      }
      : null,
    privacy: {
      onChainFields: [
        "evidenceHash",
        "jobHash",
        "network",
        "contractAddress",
        "transactionHash",
        "blockNumber",
        "chainId",
      ],
      excludedFields: [
        "raw customer data",
        "prompts",
        "sensitive target text",
        "model outputs",
      ],
    },
  };

  const evidenceHash = await sha256Bytes32(stableStringify(manifest));
  const reportPayload = {
    title: "Forg3t Evidence Report",
    evidenceId: params.evidenceId,
    jobId: params.job.id,
    projectName: params.project.name,
    generatedAt: params.job.completed_at ?? params.job.created_at,
    status: params.job.status,
    targetType: params.job.target_type,
    executionLane: params.job.execution_lane,
    validationSummary,
    anchorStatus: params.job.anchor_status,
    requestReasonSummary: params.job.request_reason,
    targetScopeSummary: params.job.target_scope_summary,
  };

  return {
    jobHash,
    evidenceHash,
    manifest,
    reportPayload,
  };
}

async function createJob(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, body.projectId ?? null);
  const membership = await requireProjectMembership(serviceClient, projectId, user.id, [...BUILD_ROLES]);
  const integration = await maybeResolveIntegrationSummary(serviceClient, projectId, body.integrationId ?? null);
  const sanitizedMetadata = sanitizeMetadata(body);
  const status = ["pending", "processing", "completed", "failed"].includes(body.status)
    ? body.status
    : "pending";

  const insertPayload = {
    project_id: projectId,
    user_id: user.id,
    created_by: user.id,
    integration_id: integration?.id ?? null,
    pipeline_id: body.pipelineId ?? null,
    pipeline_run_id: body.pipelineRunId ?? null,
    request_reason: toLimitedString(body.requestReason, 240, "AI unlearning job"),
    status,
    processing_time_seconds: toOptionalNumber(body.processingTimeSeconds ?? sanitizedMetadata.validationSummary.processingTimeSeconds),
    blockchain_tx_hash: null,
    audit_trail: {},
    target_type: toLimitedString(body.targetType, 40, "assistant"),
    execution_lane: toLimitedString(body.executionLane, 40, "assistant_black_box"),
    validation_score: toOptionalNumber(body.validationScore ?? sanitizedMetadata.validationSummary.leakScore),
    completed_at: status === "completed" ? new Date().toISOString() : null,
    error_message: status === "failed" ? toLimitedString(body.errorMessage, 400) : null,
    target_scope_summary: toLimitedString(body.targetScopeSummary, 240, toLimitedString(body.requestReason, 240)),
    evidence_status: status === "completed" ? "ready" : "not_generated",
    anchor_status: "not_submitted",
    report_status: "not_generated",
    verification_status: "not_verified",
    metadata: sanitizedMetadata,
  };

  const { data: job, error: insertError } = await serviceClient
    .from("unlearning_requests")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError || !job) {
    throw new HttpError(500, "Failed to create job");
  }

  const evidenceId = crypto.randomUUID();
  let evidencePayload: Record<string, unknown> = {
    id: evidenceId,
    project_id: projectId,
    job_id: job.id,
    pipeline_id: body.pipelineId ?? null,
    pipeline_run_id: body.pipelineRunId ?? null,
    manifest: {},
    report_payload: {},
    evidence_hash: null,
    job_hash: await sha256Bytes32(job.id),
    bundle_hash: null,
    report_hash: null,
    artifact_status: "not_generated",
    report_status: "not_generated",
    verification_status: "not_verified",
    created_by: user.id,
  };

  if (status === "completed") {
    const evidenceData = await buildEvidenceData({
      evidenceId,
      job,
      project: {
        id: membership.projects?.id ?? projectId,
        name: membership.projects?.name ?? "Workspace",
        slug: membership.projects?.slug ?? "workspace",
      },
      integration,
    });

    evidencePayload = {
      ...evidencePayload,
      manifest: evidenceData.manifest,
      report_payload: evidenceData.reportPayload,
      evidence_hash: evidenceData.evidenceHash,
      bundle_hash: evidenceData.evidenceHash,
      job_hash: evidenceData.jobHash,
      artifact_status: "ready",
    };
  }

  const { error: evidenceError } = await serviceClient
    .from("evidence_records")
    .insert(evidencePayload);

  if (evidenceError) {
    throw new HttpError(500, "Failed to create evidence record");
  }

  await updatePipelineRunArtifacts(serviceClient, body.pipelineRunId ?? null, job.id, evidenceId);

  return getJob(userContext, job.id);
}

async function completeJob(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const { user, serviceClient } = userContext;
  const jobId = body.jobId as string | undefined;

  if (!jobId) {
    throw new HttpError(400, "jobId is required");
  }

  const { data: existingJob, error } = await serviceClient
    .from("unlearning_requests")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load job");
  }

  if (!existingJob) {
    throw new HttpError(404, "Job not found");
  }

  const membership = await requireProjectMembership(serviceClient, existingJob.project_id, user.id, [...OPERATE_ROLES]);
  const integration = await maybeResolveIntegrationSummary(serviceClient, existingJob.project_id, existingJob.integration_id);
  const sanitizedMetadata = sanitizeMetadata(body);

  const { data: updatedJob, error: updateError } = await serviceClient
    .from("unlearning_requests")
    .update({
      status: body.status && ["completed", "failed", "processing"].includes(body.status) ? body.status : "completed",
      processing_time_seconds: toOptionalNumber(body.processingTimeSeconds ?? sanitizedMetadata.validationSummary.processingTimeSeconds ?? existingJob.processing_time_seconds),
      validation_score: toOptionalNumber(body.validationScore ?? sanitizedMetadata.validationSummary.leakScore ?? existingJob.validation_score),
      error_message: body.status === "failed" ? toLimitedString(body.errorMessage, 400) : null,
      completed_at: new Date().toISOString(),
      evidence_status: body.status === "failed" ? "invalid" : "ready",
      metadata: {
        ...(existingJob.metadata ?? {}),
        ...sanitizedMetadata,
      },
    })
    .eq("id", jobId)
    .select("*")
    .single();

  if (updateError || !updatedJob) {
    throw new HttpError(500, "Failed to update job");
  }

  const { data: evidence, error: evidenceLoadError } = await serviceClient
    .from("evidence_records")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (evidenceLoadError || !evidence) {
    throw new HttpError(404, "Evidence record not found");
  }

  const evidenceData = await buildEvidenceData({
    evidenceId: evidence.id,
    job: updatedJob,
    project: {
      id: membership.projects?.id ?? updatedJob.project_id,
      name: membership.projects?.name ?? "Workspace",
      slug: membership.projects?.slug ?? "workspace",
    },
    integration,
  });

  const { error: evidenceUpdateError } = await serviceClient
    .from("evidence_records")
    .update({
      manifest: evidenceData.manifest,
      report_payload: evidenceData.reportPayload,
      evidence_hash: evidenceData.evidenceHash,
      bundle_hash: evidenceData.evidenceHash,
      job_hash: evidenceData.jobHash,
      artifact_status: updatedJob.status === "failed" ? "invalid" : "ready",
      verification_status: "not_verified",
    })
    .eq("id", evidence.id);

  if (evidenceUpdateError) {
    throw new HttpError(500, "Failed to finalize evidence record");
  }

  return getJob(userContext, jobId);
}

async function listJobs(userContext: Awaited<ReturnType<typeof requireUser>>, projectId: string | null) {
  const { user, serviceClient } = userContext;
  const resolvedProjectId = await resolveProjectId(serviceClient, user.id, projectId);
  await requireProjectMembership(serviceClient, resolvedProjectId, user.id);

  const { data, error } = await serviceClient
    .from("unlearning_requests")
    .select(`
      *,
      integrations (
        id,
        name,
        provider_type,
        model_identifier,
        status
      ),
      evidence_records (
        id,
        evidence_hash,
        job_hash,
        bundle_hash,
        report_hash,
        artifact_status,
        report_status,
        verification_status,
        public_verification_token,
        created_at,
        updated_at,
        evidence_anchors (
          id,
          status,
          network,
          chain_id,
          transaction_hash,
          block_number,
          confirmed_at
        )
      )
    `)
    .eq("project_id", resolvedProjectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "Failed to load jobs");
  }

  return jsonResponse({
    jobs: data ?? [],
  });
}

async function getJob(userContext: Awaited<ReturnType<typeof requireUser>>, jobId: string) {
  const { user, serviceClient } = userContext;
  const { data, error } = await serviceClient
    .from("unlearning_requests")
    .select(`
      *,
      integrations (
        id,
        name,
        provider_type,
        model_identifier,
        status,
        last_tested_at
      ),
      verification_pipelines (
        id,
        name,
        trigger_mode
      ),
      pipeline_runs (
        id,
        status,
        started_at,
        completed_at
      ),
      evidence_records (
        id,
        manifest,
        report_payload,
        evidence_hash,
        job_hash,
        bundle_hash,
        report_hash,
        artifact_status,
        report_status,
        verification_status,
        public_verification_token,
        created_at,
        updated_at,
        evidence_anchors (
          id,
          status,
          network,
          chain_id,
          contract_address,
          transaction_hash,
          block_number,
          error_message,
          confirmed_at,
          created_at,
          updated_at
        )
      )
    `)
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load job");
  }

  if (!data) {
    throw new HttpError(404, "Job not found");
  }

  await requireProjectMembership(serviceClient, data.project_id, user.id);

  return jsonResponse({
    job: data,
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
      const jobId = url.searchParams.get("jobId");
      const projectId = url.searchParams.get("projectId");

      if (jobId) {
        return await getJob(userContext, jobId);
      }

      return await listJobs(userContext, projectId);
    }

    if (req.method === "POST") {
      const clone = req.clone();
      const body = await clone.json().catch(() => ({}));
      const action = body.action ?? "create";

      if (action === "create") {
        return await createJob(req, userContext);
      }

      if (action === "complete") {
        return await completeJob(req, userContext);
      }

      throw new HttpError(400, "Unsupported job action");
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return handleError(error);
  }
});
