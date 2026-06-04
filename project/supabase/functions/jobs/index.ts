import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { executeAssistantSuppression } from "../_shared/assistantSuppression.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { decryptSecret, sha256Bytes32, stableStringify } from "../_shared/crypto.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";
import { requireUser } from "../_shared/supabase.ts";

const BUILD_ROLES = ["owner", "admin", "developer"] as const;
const OPERATE_ROLES = ["owner", "admin", "developer", "compliance"] as const;
const BLACK_BOX_STALE_AFTER_MS = 6 * 60 * 1000;

type UserContext = Awaited<ReturnType<typeof requireUser>>;
type ServiceClient = UserContext["serviceClient"];

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

function toValidationScore(value: unknown, leakScore: unknown, fallback: number | null = null) {
  const explicit = toOptionalNumber(value);
  if (explicit !== null) {
    return explicit;
  }

  const leak = toOptionalNumber(leakScore);
  if (leak !== null) {
    return Math.max(0, Math.min(1, 1 - leak));
  }

  return fallback;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function sanitizeRuntime(value: unknown) {
  const input = asObject(value);
  const percent = toOptionalNumber(input.percent);

  return {
    mode: toLimitedString(input.mode, 80) || null,
    percent: percent === null ? 0 : Math.max(0, Math.min(100, percent)),
    message: toLimitedString(input.message, 240) || null,
    startedAt: toLimitedString(input.startedAt, 80) || null,
    completedAt: toLimitedString(input.completedAt, 80) || null,
  };
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
    executionSummary: input.executionSummary && typeof input.executionSummary === "object"
      ? sanitizeObject(input.executionSummary as Record<string, unknown>)
      : null,
    notes: toLimitedString(input.notes, 500) || null,
  };

  if (input.runtime && typeof input.runtime === "object") {
    metadata.runtime = sanitizeObject(sanitizeRuntime(input.runtime));
  }

  return metadata;
}

function sanitizeObject(input: Record<string, unknown>) {
  const sanitized: Record<string, JsonValue> = {};

  for (const [key, value] of Object.entries(input)) {
    const loweredKey = key.toLowerCase();

    if (
      loweredKey.includes("key") ||
      loweredKey.includes("token") ||
      loweredKey.includes("secret") ||
      loweredKey.includes("prompt") ||
      loweredKey.includes("response") ||
      loweredKey.includes("targettext")
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

function isStaleBlackBoxJob(job: Record<string, unknown>) {
  if (job.status !== "processing" || job.execution_lane !== "assistant_black_box") {
    return false;
  }

  const updatedAt = typeof job.updated_at === "string" ? Date.parse(job.updated_at) : NaN;
  if (!Number.isFinite(updatedAt)) {
    return false;
  }

  return Date.now() - updatedAt > BLACK_BOX_STALE_AFTER_MS;
}

function processingSecondsFromJob(job: Record<string, unknown>) {
  const metadata = asObject(job.metadata);
  const runtime = asObject(metadata.runtime);
  const startedAt = typeof runtime.startedAt === "string"
    ? Date.parse(runtime.startedAt)
    : typeof job.created_at === "string"
    ? Date.parse(job.created_at)
    : NaN;

  if (!Number.isFinite(startedAt)) {
    return null;
  }

  return Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
}

async function resolveProjectId(
  serviceClient: ServiceClient,
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
  serviceClient: ServiceClient,
  projectId: string,
  integrationId?: string | null,
) {
  if (!integrationId) {
    return null;
  }

  const { data, error } = await serviceClient
    .from("integrations")
    .select("id, project_id, name, provider_type, model_identifier, status, metadata")
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
  serviceClient: ServiceClient,
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

async function loadProjectSummary(serviceClient: ServiceClient, projectId: string) {
  const { data, error } = await serviceClient
    .from("projects")
    .select("id, name, slug")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(500, "Failed to load project");
  }

  return data;
}

async function buildEvidenceData(params: {
  evidenceId: string;
  job: Record<string, unknown>;
  project: { id: string; name: string; slug: string };
  integration: Record<string, unknown> | null;
}) {
  const jobHash = await sha256Bytes32(String(params.job.id));
  const metadata = asObject(params.job.metadata);
  const validationSource = asObject(metadata.validationSummary);
  const integrationMetadata = params.integration ? asObject(params.integration.metadata) : {};

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
        assistantId: typeof integrationMetadata.assistantId === "string" ? integrationMetadata.assistantId : null,
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

async function completeJobRecord(params: {
  serviceClient: ServiceClient;
  existingJob: Record<string, unknown>;
  project: { id: string; name: string; slug: string };
  integration: Record<string, unknown> | null;
  status: "processing" | "completed" | "failed";
  processingTimeSeconds?: number | null;
  validationScore?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, JsonValue>;
  auditTrail?: Record<string, JsonValue>;
}) {
  const currentMetadata = sanitizeObject(asObject(params.existingJob.metadata));
  const nextMetadata = {
    ...currentMetadata,
    ...(params.metadata ?? {}),
  };

  const updatePayload: Record<string, unknown> = {
    status: params.status,
    processing_time_seconds: params.processingTimeSeconds ?? params.existingJob.processing_time_seconds ?? null,
    validation_score: params.validationScore ?? params.existingJob.validation_score ?? null,
    error_message: params.status === "failed" ? toLimitedString(params.errorMessage, 400, "Black-box suppression failed") : null,
    metadata: nextMetadata,
    audit_trail: params.auditTrail ?? params.existingJob.audit_trail ?? {},
  };

  if (params.status === "completed" || params.status === "failed") {
    updatePayload.completed_at = new Date().toISOString();
    updatePayload.evidence_status = params.status === "failed" ? "invalid" : "ready";
  }

  const { data: updatedJob, error: updateError } = await params.serviceClient
    .from("unlearning_requests")
    .update(updatePayload)
    .eq("id", params.existingJob.id)
    .select("*")
    .single();

  if (updateError || !updatedJob) {
    throw new HttpError(500, "Failed to update job");
  }

  if (params.status === "processing") {
    return updatedJob;
  }

  const { data: evidence, error: evidenceLoadError } = await params.serviceClient
    .from("evidence_records")
    .select("id")
    .eq("job_id", params.existingJob.id)
    .maybeSingle();

  if (evidenceLoadError || !evidence) {
    throw new HttpError(404, "Evidence record not found");
  }

  const evidenceData = await buildEvidenceData({
    evidenceId: evidence.id,
    job: updatedJob,
    project: params.project,
    integration: params.integration,
  });

  const { error: evidenceUpdateError } = await params.serviceClient
    .from("evidence_records")
    .update({
      manifest: evidenceData.manifest,
      report_payload: evidenceData.reportPayload,
      evidence_hash: evidenceData.evidenceHash,
      bundle_hash: evidenceData.evidenceHash,
      job_hash: evidenceData.jobHash,
      artifact_status: params.status === "failed" ? "invalid" : "ready",
      verification_status: "not_verified",
    })
    .eq("id", evidence.id);

  if (evidenceUpdateError) {
    throw new HttpError(500, "Failed to finalize evidence record");
  }

  return updatedJob;
}

function queueBackgroundTask(task: Promise<unknown>) {
  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: {
      waitUntil?: (promise: Promise<unknown>) => void;
    };
  }).EdgeRuntime;

  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
    return;
  }

  task.catch((error) => {
    console.error("Background job execution failed", error);
  });
}

async function loadBlackBoxIntegrationContext(
  serviceClient: ServiceClient,
  integrationId: string,
  projectId: string,
) {
  const { data: integration, error: integrationError } = await serviceClient
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .maybeSingle();

  if (integrationError) {
    throw new Error("Failed to load integration");
  }

  if (!integration || integration.project_id !== projectId) {
    throw new Error("Integration not found");
  }

  if (integration.provider_type !== "openai_compatible") {
    throw new Error("Black-box suppression requires an OpenAI-compatible integration");
  }

  const metadata = asObject(integration.metadata);
  const assistantId = typeof metadata.assistantId === "string" ? metadata.assistantId.trim() : "";

  if (!assistantId) {
    throw new Error("Integration is missing an Assistant ID");
  }

  const { data: secretRecord, error: secretError } = await serviceClient
    .from("integration_secrets")
    .select("secret_ciphertext, iv")
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (secretError) {
    throw new Error("Failed to load integration secret");
  }

  if (!secretRecord) {
    throw new Error("Integration secret is not configured");
  }

  const apiKey = await decryptSecret(secretRecord.secret_ciphertext, secretRecord.iv);

  return {
    integration,
    assistantId,
    apiKey,
  };
}

async function updateRuntimeState(
  serviceClient: ServiceClient,
  job: Record<string, unknown>,
  runtime: Record<string, unknown>,
) {
  return completeJobRecord({
    serviceClient,
    existingJob: job,
    project: await loadProjectSummary(serviceClient, String(job.project_id)),
    integration: await maybeResolveIntegrationSummary(serviceClient, String(job.project_id), job.integration_id as string | null),
    status: "processing",
    metadata: {
      runtime: sanitizeObject(sanitizeRuntime(runtime)),
    },
  });
}

async function failStaleBlackBoxJob(
  serviceClient: ServiceClient,
  job: Record<string, unknown>,
) {
  if (!isStaleBlackBoxJob(job)) {
    return job;
  }

  const completedAt = new Date().toISOString();
  const existingMetadata = sanitizeObject(asObject(job.metadata));
  let integration = null;

  if (job.integration_id) {
    try {
      integration = await maybeResolveIntegrationSummary(
        serviceClient,
        String(job.project_id),
        String(job.integration_id),
      );
    } catch {
      integration = null;
    }
  }

  return completeJobRecord({
    serviceClient,
    existingJob: job,
    project: await loadProjectSummary(serviceClient, String(job.project_id)),
    integration,
    status: "failed",
    processingTimeSeconds: processingSecondsFromJob(job),
    validationScore: 0,
    errorMessage: "Black-box suppression timed out before completion. Please retry; live runs now use a shorter bounded smoke set.",
    metadata: {
      ...existingMetadata,
      executionSummary: sanitizeObject({
        mode: "assistant_black_box",
        suppressionInjected: false,
        failedAt: completedAt,
        reason: "timeout",
      }),
      runtime: sanitizeObject(sanitizeRuntime({
        mode: "assistant_black_box",
        percent: 100,
        message: "Suppression run timed out",
        startedAt: asObject(existingMetadata.runtime).startedAt,
        completedAt,
      })),
    },
    auditTrail: sanitizeObject({
      mode: "assistant_black_box",
      suppressionInjected: false,
      failedAt: completedAt,
      error: "Black-box suppression timed out before completion",
    }),
  });
}

async function executeBlackBoxJob(params: {
  serviceClient: ServiceClient;
  jobId: string;
  project: { id: string; name: string; slug: string };
  targetText: string;
}) {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  const { data: initialJob, error: jobError } = await params.serviceClient
    .from("unlearning_requests")
    .select("*")
    .eq("id", params.jobId)
    .maybeSingle();

  if (jobError || !initialJob) {
    console.error("Unable to load job for black-box execution", jobError);
    return;
  }

  let currentJob = initialJob as Record<string, unknown>;

  try {
    currentJob = await updateRuntimeState(params.serviceClient, currentJob, {
      mode: "assistant_black_box",
      percent: 2,
      message: "Preparing black-box suppression run",
      startedAt,
    });

    if (!currentJob.integration_id) {
      throw new Error("Black-box suppression requires a configured integration");
    }

    const { integration, assistantId, apiKey } = await loadBlackBoxIntegrationContext(
      params.serviceClient,
      String(currentJob.integration_id),
      String(currentJob.project_id),
    );

    const result = await executeAssistantSuppression({
      apiKey,
      baseUrl: String(integration.base_url),
      assistantId,
      targetText: params.targetText,
      reinforcementPromptLimit: 6,
      validationPromptLimit: 4,
      maxRunPollAttempts: 12,
      onProgress: async (progress) => {
        currentJob = await updateRuntimeState(params.serviceClient, currentJob, {
          mode: "assistant_black_box",
          percent: progress.percent,
          message: progress.message,
          startedAt,
        });
      },
    });

    const completedAt = new Date().toISOString();
    const existingMetadata = sanitizeObject(asObject(currentJob.metadata));
    const integrationMetadata = sanitizeObject({
      id: integration.id,
      name: integration.name,
      providerType: integration.provider_type,
      modelIdentifier: integration.model_identifier ?? null,
      assistantId,
      status: integration.status,
    });

    await completeJobRecord({
      serviceClient: params.serviceClient,
      existingJob: currentJob,
      project: params.project,
      integration,
      status: "completed",
      processingTimeSeconds: result.processingTimeSeconds,
      validationScore: result.validationScore,
      metadata: {
        ...existingMetadata,
        validationSummary: sanitizeObject({
          totalChecks: result.totalTests,
          passedChecks: result.passedTests,
          failedChecks: result.failedTests,
          leakScore: result.leakScore,
          processingTimeSeconds: result.processingTimeSeconds,
        }),
        integrationMetadata,
        executionSummary: sanitizeObject({
          mode: "assistant_black_box",
          assistantId: result.assistantId,
          suppressionInjected: result.suppressionInjected,
          phase1: result.phase1,
          phase2: result.phase2,
          completedAt,
        }),
        runtime: sanitizeObject(sanitizeRuntime({
          mode: "assistant_black_box",
          percent: 100,
          message: "Suppression run completed",
          startedAt,
          completedAt,
        })),
      },
      auditTrail: sanitizeObject({
        mode: "assistant_black_box",
        assistantId: result.assistantId,
        suppressionInjected: result.suppressionInjected,
        totalTests: result.totalTests,
        passedTests: result.passedTests,
        failedTests: result.failedTests,
        leakScore: result.leakScore,
        completedAt,
      }),
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const processingTimeSeconds = Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000));
    const message = error instanceof Error ? error.message : "Black-box suppression failed";
    const existingMetadata = sanitizeObject(asObject(currentJob.metadata));
    let integration = null;

    if (currentJob.integration_id) {
      try {
        integration = await maybeResolveIntegrationSummary(
          params.serviceClient,
          String(currentJob.project_id),
          String(currentJob.integration_id),
        );
      } catch {
        integration = null;
      }
    }

    await completeJobRecord({
      serviceClient: params.serviceClient,
      existingJob: currentJob,
      project: params.project,
      integration,
      status: "failed",
      processingTimeSeconds,
      validationScore: 0,
      errorMessage: message,
      metadata: {
        ...existingMetadata,
        executionSummary: sanitizeObject({
          mode: "assistant_black_box",
          suppressionInjected: false,
          failedAt: completedAt,
        }),
        runtime: sanitizeObject(sanitizeRuntime({
          mode: "assistant_black_box",
          percent: 100,
          message: "Suppression run failed",
          startedAt,
          completedAt,
        })),
      },
      auditTrail: sanitizeObject({
        mode: "assistant_black_box",
        suppressionInjected: false,
        failedAt: completedAt,
        error: message,
      }),
    });
  }
}

async function createJob(req: Request, userContext: UserContext) {
  const body = await req.json();
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, body.projectId ?? null);
  const membership = await requireProjectMembership(serviceClient, projectId, user.id, [...BUILD_ROLES]);
  const integration = await maybeResolveIntegrationSummary(serviceClient, projectId, body.integrationId ?? null);
  const sanitizedMetadata = sanitizeMetadata(body);
  const runBlackBox = body.runBlackBox === true;
  const status = runBlackBox
    ? "processing"
    : ["pending", "processing", "completed", "failed"].includes(body.status)
    ? body.status
    : "pending";

  if (runBlackBox && !integration) {
    throw new HttpError(400, "Black-box suppression requires an integration");
  }

  if (runBlackBox && !toLimitedString(body.targetText, 4)) {
    throw new HttpError(400, "Sensitive target text is required for black-box suppression");
  }

  const runtime = runBlackBox
    ? sanitizeObject(sanitizeRuntime({
      mode: "assistant_black_box",
      percent: 0,
      message: "Queued for execution",
      startedAt: new Date().toISOString(),
    }))
    : null;

  const insertPayload = {
    project_id: projectId,
    user_id: user.id,
    created_by: user.id,
    integration_id: integration?.id ?? null,
    pipeline_id: body.pipelineId ?? null,
    pipeline_run_id: body.pipelineRunId ?? null,
    request_reason: toLimitedString(body.requestReason, 240, "AI unlearning job"),
    status,
    processing_time_seconds: runBlackBox ? null : toOptionalNumber(body.processingTimeSeconds ?? sanitizedMetadata.validationSummary.processingTimeSeconds),
    blockchain_tx_hash: null,
    audit_trail: runBlackBox ? sanitizeObject({ mode: "assistant_black_box", queuedAt: new Date().toISOString() }) : {},
    target_type: toLimitedString(body.targetType, 40, "assistant"),
    execution_lane: toLimitedString(body.executionLane, 40, "assistant_black_box"),
    validation_score: runBlackBox
      ? null
      : toValidationScore(body.validationScore, sanitizedMetadata.validationSummary.leakScore),
    completed_at: status === "completed" ? new Date().toISOString() : null,
    error_message: status === "failed" ? toLimitedString(body.errorMessage, 400) : null,
    target_scope_summary: toLimitedString(body.targetScopeSummary, 240, toLimitedString(body.requestReason, 240)),
    evidence_status: status === "completed" ? "ready" : "not_generated",
    anchor_status: "not_submitted",
    report_status: "not_generated",
    verification_status: "not_verified",
    metadata: {
      ...sanitizedMetadata,
      ...(runtime ? { runtime } : {}),
    },
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

  if (runBlackBox) {
    queueBackgroundTask(executeBlackBoxJob({
      serviceClient,
      jobId: job.id,
      project: {
        id: membership.projects?.id ?? projectId,
        name: membership.projects?.name ?? "Workspace",
        slug: membership.projects?.slug ?? "workspace",
      },
      targetText: String(body.targetText),
    }));
  }

  return getJob(userContext, job.id);
}

async function completeJob(req: Request, userContext: UserContext) {
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
  const status = body.status && ["completed", "failed", "processing"].includes(body.status) ? body.status : "completed";

  await completeJobRecord({
    serviceClient,
    existingJob,
    project: {
      id: membership.projects?.id ?? existingJob.project_id,
      name: membership.projects?.name ?? "Workspace",
      slug: membership.projects?.slug ?? "workspace",
    },
    integration,
    status,
    processingTimeSeconds: toOptionalNumber(body.processingTimeSeconds ?? sanitizedMetadata.validationSummary.processingTimeSeconds ?? existingJob.processing_time_seconds),
    validationScore: toValidationScore(body.validationScore, sanitizedMetadata.validationSummary.leakScore, existingJob.validation_score),
    errorMessage: status === "failed" ? toLimitedString(body.errorMessage, 400) : null,
    metadata: sanitizedMetadata,
  });

  return getJob(userContext, jobId);
}

async function listJobs(userContext: UserContext, projectId: string | null) {
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
        status,
        metadata
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

async function getJob(userContext: UserContext, jobId: string) {
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
        last_tested_at,
        metadata
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
  const job = await failStaleBlackBoxJob(serviceClient, data as Record<string, unknown>);

  return jsonResponse({
    job,
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
