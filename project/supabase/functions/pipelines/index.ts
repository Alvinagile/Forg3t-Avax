import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireUser } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";
import { sha256Bytes32, stableStringify } from "../_shared/crypto.ts";
import {
  AvalancheNetwork,
  getAvalancheConfig,
  readAnchoredEvidence,
  submitEvidenceCommitment,
} from "../_shared/avalanche.ts";
import { extractPipelineItems } from "../../../shared/workflows.ts";

const PIPELINE_ROLES = ["owner", "admin", "developer", "compliance"] as const;

function sanitizeJson(input: unknown) {
  if (!input || typeof input !== "object") {
    return {};
  }

  return input;
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(1, value));
}

function buildReportRow(params: {
  projectName: string;
  jobId: string;
  evidenceId: string;
  targetScopeSummary: string;
  status: string;
  anchorStatus: string;
  evidenceHash: string | null;
  transactionHash: string | null;
  timestamp: string;
  generatedBy: string;
  generatedAt: string;
}) {
  return {
    projectName: params.projectName,
    jobId: params.jobId,
    evidenceId: params.evidenceId,
    targetScopeSummary: params.targetScopeSummary,
    validationStatus: params.status,
    anchorStatus: params.anchorStatus,
    evidenceHash: params.evidenceHash,
    transactionHash: params.transactionHash,
    timestamp: params.timestamp,
    exportGeneratedBy: params.generatedBy,
    exportGeneratedAt: params.generatedAt,
  };
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => {
      const value = row[header];
      return `"${String(value ?? "").replaceAll(`"`, `""`)}"`;
    }).join(",")),
  ].join("\n");
}

async function buildPipelineEvidenceData(params: {
  evidenceId: string;
  jobId: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  createdBy: string;
  generatedAt: string;
  targetType: string;
  targetScopeSummary: string;
  requestReason: string;
  validationScore: number;
  pipelineName: string;
  pipelineId: string;
  pipelineRunId: string;
}) {
  const jobHash = await sha256Bytes32(params.jobId);
  const manifest = {
    schemaVersion: "forg3t.evidence-bundle/v1",
    evidenceId: params.evidenceId,
    jobId: params.jobId,
    projectId: params.projectId,
    projectName: params.projectName,
    projectSlug: params.projectSlug,
    generatedAt: params.generatedAt,
    createdBy: params.createdBy,
    targetType: params.targetType,
    executionLane: "pipeline",
    requestReasonSummary: params.requestReason,
    targetScopeSummary: params.targetScopeSummary,
    validationSummary: {
      validationScore: params.validationScore,
      totalChecks: 1,
      passedChecks: params.validationScore >= 0.5 ? 1 : 0,
      failedChecks: params.validationScore >= 0.5 ? 0 : 1,
      leakScore: clampScore(1 - params.validationScore),
      status: "completed",
    },
    pipeline: {
      id: params.pipelineId,
      runId: params.pipelineRunId,
      name: params.pipelineName,
    },
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

  return {
    jobHash,
    evidenceHash,
    manifest,
    reportPayload: {
      title: "Forg3t Pipeline Evidence Report",
      evidenceId: params.evidenceId,
      jobId: params.jobId,
      projectName: params.projectName,
      generatedAt: params.generatedAt,
      status: "completed",
      targetType: params.targetType,
      executionLane: "pipeline",
      validationSummary: manifest.validationSummary,
      anchorStatus: "not_submitted",
      requestReasonSummary: params.requestReason,
      targetScopeSummary: params.targetScopeSummary,
      pipeline: manifest.pipeline,
    },
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
  const createdAnchors: string[] = [];
  const createdReports: string[] = [];
  const validationConfig = asObject(pipeline.validation_config);
  const evidenceConfig = asObject(pipeline.evidence_config);
  const shouldCompleteJobs = toBoolean(body.completeJobs, toBoolean(evidenceConfig.generateOnRun, true));
  const shouldAnchor = toBoolean(body.anchor, toBoolean(evidenceConfig.anchorOnRun, false));
  const shouldExport = toBoolean(body.exportReports, pipeline.export_required);
  const requestedFormats = Array.isArray(body.exportFormats) && body.exportFormats.length
    ? body.exportFormats
    : Array.isArray(evidenceConfig.exportFormats)
    ? evidenceConfig.exportFormats
    : ["json"];
  const exportFormats = requestedFormats
    .filter((format) => ["json", "csv", "pdf"].includes(String(format)))
    .map((format) => String(format)) as Array<"json" | "csv" | "pdf">;
  const validationScore = clampScore(toNumber(body.validationScore ?? validationConfig.defaultValidationScore, 1));
  const network = (body.network ?? evidenceConfig.network ?? undefined) as AvalancheNetwork | undefined;
  const targetScope = (pipeline.target_scope ?? {}) as Record<string, unknown>;
  const scopedItems = extractPipelineItems(targetScope, pipeline.name, pipeline.description);
  const { data: project } = await serviceClient
    .from("projects")
    .select("id, name, slug")
    .eq("id", pipeline.project_id)
    .maybeSingle();
  const projectName = project?.name ?? "Workspace";
  const projectSlug = project?.slug ?? "workspace";

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

  try {
    for (const item of scopedItems) {
      const now = new Date().toISOString();
      const { data: job, error: jobError } = await serviceClient
        .from("unlearning_requests")
        .insert({
          project_id: pipeline.project_id,
          user_id: user.id,
          created_by: user.id,
          pipeline_id: pipeline.id,
          pipeline_run_id: runId,
          request_reason: item.requestReason,
          status: shouldCompleteJobs ? "completed" : "pending",
          processing_time_seconds: shouldCompleteJobs ? 1 : null,
          target_type: item.targetType,
          execution_lane: "pipeline",
          validation_score: shouldCompleteJobs ? validationScore : null,
          completed_at: shouldCompleteJobs ? now : null,
          target_scope_summary: item.targetScopeSummary,
          evidence_status: shouldCompleteJobs ? "ready" : "not_generated",
          anchor_status: "not_submitted",
          report_status: "not_generated",
          verification_status: "not_verified",
          metadata: {
            pipelineName: pipeline.name,
            pipelineDescription: pipeline.description,
            scopedItem: item,
            verificationMode: shouldCompleteJobs ? "pipeline_deterministic_smoke" : "pipeline_shell",
          },
        })
        .select("id, created_at, completed_at")
        .single();

      if (jobError || !job) {
        throw new HttpError(500, "Failed to create pipeline job");
      }

      createdJobs.push(job.id);
      const evidenceId = crypto.randomUUID();
      createdEvidence.push(evidenceId);
      const evidenceData = shouldCompleteJobs
        ? await buildPipelineEvidenceData({
          evidenceId,
          jobId: job.id,
          projectId: pipeline.project_id,
          projectName,
          projectSlug,
          createdBy: user.id,
          generatedAt: job.completed_at ?? now,
          targetType: item.targetType,
          targetScopeSummary: item.targetScopeSummary,
          requestReason: item.requestReason,
          validationScore,
          pipelineName: pipeline.name,
          pipelineId: pipeline.id,
          pipelineRunId: runId,
        })
        : {
          jobHash: await sha256Bytes32(job.id),
          evidenceHash: null,
          manifest: {},
          reportPayload: {},
        };

      const { error: evidenceError } = await serviceClient
        .from("evidence_records")
        .insert({
          id: evidenceId,
          project_id: pipeline.project_id,
          job_id: job.id,
          pipeline_id: pipeline.id,
          pipeline_run_id: runId,
          manifest: evidenceData.manifest,
          report_payload: evidenceData.reportPayload,
          evidence_hash: evidenceData.evidenceHash,
          job_hash: evidenceData.jobHash,
          bundle_hash: evidenceData.evidenceHash,
          report_hash: null,
          artifact_status: shouldCompleteJobs ? "ready" : "not_generated",
          report_status: "not_generated",
          verification_status: "not_verified",
          created_by: user.id,
        });

      if (evidenceError) {
        throw new HttpError(500, "Failed to create pipeline evidence");
      }

      let anchorStatus = "not_submitted";
      let transactionHash: string | null = null;

      if (shouldAnchor && evidenceData.evidenceHash) {
        const anchorId = crypto.randomUUID();
        const avalancheConfig = getAvalancheConfig(network);
        createdAnchors.push(anchorId);

        const { error: anchorInsertError } = await serviceClient
          .from("evidence_anchors")
          .insert({
            id: anchorId,
            project_id: pipeline.project_id,
            job_id: job.id,
            evidence_id: evidenceId,
            evidence_hash: evidenceData.evidenceHash,
            job_hash: evidenceData.jobHash,
            bundle_hash: evidenceData.evidenceHash,
            network: avalancheConfig.network,
            chain_id: avalancheConfig.chainId,
            contract_address: avalancheConfig.contractAddress,
            status: "pending",
            created_by: user.id,
          });

        if (anchorInsertError) {
          throw new HttpError(500, "Failed to create pipeline anchor record");
        }

        try {
          const submission = await submitEvidenceCommitment(
            evidenceData.jobHash as `0x${string}`,
            evidenceData.evidenceHash as `0x${string}`,
            avalancheConfig.network,
          );
          transactionHash = submission.transactionHash;
          anchorStatus = submission.receipt?.status === "success"
            ? "confirmed"
            : submission.receipt?.status === "reverted"
            ? "failed"
            : "pending";

          if (anchorStatus === "confirmed") {
            const onChain = await readAnchoredEvidence(evidenceData.jobHash as `0x${string}`, avalancheConfig.network);
            if (onChain.artifactHash.toLowerCase() !== evidenceData.evidenceHash.toLowerCase()) {
              anchorStatus = "failed";
            }
          }

          await serviceClient
            .from("evidence_anchors")
            .update({
              transaction_hash: submission.transactionHash,
              block_number: submission.receipt?.blockNumber ? Number(submission.receipt.blockNumber) : null,
              status: anchorStatus,
              error_message: anchorStatus === "failed" ? "Avalanche transaction failed or commitment mismatch" : null,
              confirmed_at: anchorStatus === "confirmed" ? new Date().toISOString() : null,
            })
            .eq("id", anchorId);
        } catch (error) {
          anchorStatus = "failed";
          await serviceClient
            .from("evidence_anchors")
            .update({
              status: "failed",
              error_message: error instanceof Error ? error.message : "Failed to anchor pipeline evidence",
            })
            .eq("id", anchorId);
        }

        await serviceClient
          .from("unlearning_requests")
          .update({
            anchor_status: anchorStatus,
            blockchain_tx_hash: transactionHash,
          })
          .eq("id", job.id);
      }

      if (shouldExport && shouldCompleteJobs && exportFormats.length) {
        const generatedAt = new Date().toISOString();
        const row = buildReportRow({
          projectName,
          jobId: job.id,
          evidenceId,
          targetScopeSummary: item.targetScopeSummary,
          status: "completed",
          anchorStatus,
          evidenceHash: evidenceData.evidenceHash,
          transactionHash,
          timestamp: job.completed_at ?? now,
          generatedBy: user.email ?? user.id,
          generatedAt,
        });

        for (const format of exportFormats) {
          const exportId = crypto.randomUUID();
          createdReports.push(exportId);
          const payload = format === "csv"
            ? { row, csv: toCsv([row]) }
            : { row, detail: { jobId: job.id, evidenceId, manifest: evidenceData.manifest } };

          const { error: reportError } = await serviceClient
            .from("report_exports")
            .insert({
              id: exportId,
              project_id: pipeline.project_id,
              job_id: job.id,
              evidence_id: evidenceId,
              format,
              status: "generated",
              download_name: `forg3t-pipeline-${runId}-${job.id}.${format}`,
              payload,
              generated_by: user.id,
              generated_at: generatedAt,
            });

          if (reportError) {
            throw new HttpError(500, "Failed to create pipeline report export");
          }
        }

        const { error: evidenceReportError } = await serviceClient
          .from("evidence_records")
          .update({ report_status: "ready" })
          .eq("id", evidenceId);

        if (evidenceReportError) {
          throw new HttpError(500, "Failed to mark pipeline evidence report ready");
        }

        const { error: jobReportError } = await serviceClient
          .from("unlearning_requests")
          .update({ report_status: "ready" })
          .eq("id", job.id);

        if (jobReportError) {
          throw new HttpError(500, "Failed to mark pipeline job report ready");
        }
      }
    }

    await serviceClient
      .from("pipeline_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        created_jobs: createdJobs,
        created_evidence: createdEvidence,
        created_anchors: createdAnchors,
        created_reports: createdReports,
      })
      .eq("id", runId);

    return jsonResponse({
      run: {
        id: runId,
        pipelineId: pipeline.id,
        status: "completed",
        createdJobs,
        createdEvidence,
        createdAnchors,
        createdReports,
        anchorRequested: shouldAnchor,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline run failed";
    await serviceClient
      .from("pipeline_runs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
        created_jobs: createdJobs,
        created_evidence: createdEvidence,
        created_anchors: createdAnchors,
        created_reports: createdReports,
      })
      .eq("id", runId);

    throw new HttpError(500, message);
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
