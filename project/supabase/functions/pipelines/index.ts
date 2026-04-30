import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireUser } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";
import { sha256Bytes32 } from "../_shared/crypto.ts";
import { extractPipelineItems } from "../../../shared/workflows.ts";

const PIPELINE_ROLES = ["owner", "admin", "developer", "compliance"] as const;

function sanitizeJson(input: unknown) {
  if (!input || typeof input !== "object") {
    return {};
  }

  return input;
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

async function listPipelines(userContext: Awaited<ReturnType<typeof requireUser>>, url: URL) {
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, url.searchParams.get("projectId"));
  await requireProjectMembership(serviceClient, projectId, user.id);

  const { data, error } = await serviceClient
    .from("verification_pipelines")
    .select(`
      *,
      pipeline_runs (
        id,
        status,
        started_at,
        completed_at,
        created_jobs,
        created_evidence,
        created_anchors,
        created_reports,
        error_message,
        created_at
      )
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "Failed to load pipelines");
  }

  return jsonResponse({
    pipelines: data ?? [],
  });
}

async function getPipeline(userContext: Awaited<ReturnType<typeof requireUser>>, pipelineId: string, includeRuns: boolean) {
  const { user, serviceClient } = userContext;
  const { data, error } = await serviceClient
    .from("verification_pipelines")
    .select(includeRuns
      ? `
        *,
        pipeline_runs (
          id,
          status,
          started_at,
          completed_at,
          created_jobs,
          created_evidence,
          created_anchors,
          created_reports,
          error_message,
          created_at
        )
      `
      : "*")
    .eq("id", pipelineId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load pipeline");
  }

  if (!data) {
    throw new HttpError(404, "Pipeline not found");
  }

  await requireProjectMembership(serviceClient, data.project_id, user.id);

  return jsonResponse({
    pipeline: data,
  });
}

async function createPipeline(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, body.projectId ?? null);
  await requireProjectMembership(serviceClient, projectId, user.id, [...PIPELINE_ROLES]);

  const { data, error } = await serviceClient
    .from("verification_pipelines")
    .insert({
      project_id: projectId,
      name: String(body.name ?? "Verification pipeline").slice(0, 120),
      description: typeof body.description === "string" ? body.description.slice(0, 400) : null,
      target_scope: sanitizeJson(body.targetScope),
      validation_config: sanitizeJson(body.validationConfig),
      evidence_config: sanitizeJson(body.evidenceConfig),
      anchor_required: body.anchorRequired ?? true,
      export_required: body.exportRequired ?? true,
      trigger_mode: body.triggerMode === "scheduled" ? "scheduled" : "manual",
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(500, "Failed to create pipeline");
  }

  return jsonResponse({
    pipeline: data,
  });
}

async function runPipeline(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const pipelineId = body.pipelineId as string | undefined;

  if (!pipelineId) {
    throw new HttpError(400, "pipelineId is required");
  }

  const { user, serviceClient } = userContext;
  const { data: pipeline, error: pipelineError } = await serviceClient
    .from("verification_pipelines")
    .select("*")
    .eq("id", pipelineId)
    .maybeSingle();

  if (pipelineError) {
    throw new HttpError(500, "Failed to load pipeline");
  }

  if (!pipeline) {
    throw new HttpError(404, "Pipeline not found");
  }

  await requireProjectMembership(serviceClient, pipeline.project_id, user.id, [...PIPELINE_ROLES]);

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const createdJobs: string[] = [];
  const createdEvidence: string[] = [];
  const targetScope = (pipeline.target_scope ?? {}) as Record<string, unknown>;
  const scopedItems = extractPipelineItems(targetScope, pipeline.name, pipeline.description);

  const { error: runInsertError } = await serviceClient
    .from("pipeline_runs")
    .insert({
      id: runId,
      pipeline_id: pipeline.id,
      project_id: pipeline.project_id,
      status: "running",
      started_at: startedAt,
      created_jobs: [],
      created_evidence: [],
      created_anchors: [],
      created_reports: [],
      created_by: user.id,
    });

  if (runInsertError) {
    throw new HttpError(500, "Failed to start pipeline run");
  }

  for (const item of scopedItems) {
    const { data: job, error: jobError } = await serviceClient
      .from("unlearning_requests")
      .insert({
        project_id: pipeline.project_id,
        user_id: user.id,
        created_by: user.id,
        pipeline_id: pipeline.id,
        pipeline_run_id: runId,
        request_reason: item.requestReason,
        status: "pending",
        target_type: item.targetType,
        execution_lane: "pipeline",
        target_scope_summary: item.targetScopeSummary,
        evidence_status: "not_generated",
        anchor_status: "not_submitted",
        report_status: "not_generated",
        verification_status: "not_verified",
        metadata: {
          pipelineName: pipeline.name,
          pipelineDescription: pipeline.description,
          scopedItem: item,
        },
      })
      .select("id")
      .single();

    if (jobError || !job) {
      await serviceClient
        .from("pipeline_runs")
        .update({
          status: "failed",
          error_message: "Failed to create pipeline job",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      throw new HttpError(500, "Failed to create pipeline job");
    }

    createdJobs.push(job.id);
    const evidenceId = crypto.randomUUID();
    createdEvidence.push(evidenceId);

    const { error: evidenceError } = await serviceClient
      .from("evidence_records")
      .insert({
        id: evidenceId,
        project_id: pipeline.project_id,
        job_id: job.id,
        pipeline_id: pipeline.id,
        pipeline_run_id: runId,
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
      });

    if (evidenceError) {
      await serviceClient
        .from("pipeline_runs")
        .update({
          status: "failed",
          error_message: "Failed to create pipeline evidence shell",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      throw new HttpError(500, "Failed to create pipeline evidence shell");
    }
  }

  await serviceClient
    .from("pipeline_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      created_jobs: createdJobs,
      created_evidence: createdEvidence,
    })
    .eq("id", runId);

  return jsonResponse({
    run: {
      id: runId,
      pipelineId: pipeline.id,
      status: "completed",
      createdJobs,
      createdEvidence,
      createdAnchors: [],
      createdReports: [],
    },
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
      const pipelineId = url.searchParams.get("pipelineId");

      if (pipelineId) {
        return await getPipeline(userContext, pipelineId, url.searchParams.get("runs") === "true");
      }

      return await listPipelines(userContext, url);
    }

    if (req.method === "POST") {
      const clone = req.clone();
      const body = await clone.json().catch(() => ({}));
      const action = body.action ?? "create";

      if (action === "create") {
        return await createPipeline(req, userContext);
      }

      if (action === "run") {
        return await runPipeline(req, userContext);
      }

      throw new HttpError(400, "Unsupported pipeline action");
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return handleError(error);
  }
});
