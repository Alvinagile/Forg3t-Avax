import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireUser } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";

const REPORT_ROLES = ["owner", "admin", "developer", "compliance"] as const;

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => {
      const value = row[header];
      const stringValue = value === null || value === undefined ? "" : String(value);
      return `"${stringValue.replaceAll(`"`, `""`)}"`;
    }).join(",")),
  ];

  return lines.join("\n");
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

async function loadDetailedRecord(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  filters: { evidenceId?: string | null; jobId?: string | null },
) {
  let resolvedJobId = filters.jobId ?? null;

  if (filters.evidenceId) {
    const { data: evidenceRecord, error: evidenceError } = await serviceClient
      .from("evidence_records")
      .select("id, job_id")
      .eq("id", filters.evidenceId)
      .maybeSingle();

    if (evidenceError) {
      throw new HttpError(500, "Failed to load evidence record");
    }

    if (!evidenceRecord?.job_id) {
      throw new HttpError(404, "Evidence record not found");
    }

    resolvedJobId = evidenceRecord.job_id as string;
  }

  let query = serviceClient
    .from("unlearning_requests")
    .select(`
      *,
      projects (
        id,
        name,
        slug
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
        evidence_anchors (
          id,
          status,
          network,
          chain_id,
          contract_address,
          transaction_hash,
          block_number,
          confirmed_at,
          error_message
        )
      )
    `);

  if (resolvedJobId) {
    query = query.eq("id", resolvedJobId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load report data");
  }

  if (!data) {
    throw new HttpError(404, "Report target not found");
  }

  if (filters.evidenceId && Array.isArray(data.evidence_records)) {
    data.evidence_records = data.evidence_records.filter((record) => record.id === filters.evidenceId);
  }

  return data;
}

function buildReportRow(record: Record<string, unknown>, generatedBy: string, generatedAt: string) {
  const project = Array.isArray(record.projects) ? record.projects[0] : record.projects;
  const evidence = Array.isArray(record.evidence_records) ? record.evidence_records[0] : record.evidence_records;
  const anchor = evidence?.evidence_anchors
    ? Array.isArray(evidence.evidence_anchors)
      ? evidence.evidence_anchors[0]
      : evidence.evidence_anchors
    : null;

  return {
    projectName: project?.name ?? "Workspace",
    jobId: record.id,
    evidenceId: evidence?.id ?? null,
    targetScopeSummary: record.target_scope_summary ?? null,
    validationStatus: record.status,
    anchorStatus: anchor?.status ?? record.anchor_status,
    evidenceHash: evidence?.evidence_hash ?? null,
    transactionHash: anchor?.transaction_hash ?? record.blockchain_tx_hash ?? null,
    timestamp: record.completed_at ?? record.created_at,
    exportGeneratedBy: generatedBy,
    exportGeneratedAt: generatedAt,
  };
}

async function appendReportToPipelineRun(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  pipelineRunId: string | null | undefined,
  exportId: string,
) {
  if (!pipelineRunId) {
    return;
  }

  const { data, error } = await serviceClient
    .from("pipeline_runs")
    .select("created_reports")
    .eq("id", pipelineRunId)
    .maybeSingle();

  if (error || !data) {
    return;
  }

  const createdReports = Array.isArray(data.created_reports) ? data.created_reports as string[] : [];
  if (!createdReports.includes(exportId)) {
    createdReports.push(exportId);
    await serviceClient
      .from("pipeline_runs")
      .update({ created_reports: createdReports })
      .eq("id", pipelineRunId);
  }
}

async function getSingleReport(userContext: Awaited<ReturnType<typeof requireUser>>, url: URL) {
  const { user, serviceClient } = userContext;
  const evidenceId = url.searchParams.get("evidenceId");
  const jobId = url.searchParams.get("jobId");

  if (!evidenceId && !jobId) {
    throw new HttpError(400, "evidenceId or jobId is required");
  }

  const record = await loadDetailedRecord(serviceClient, {
    evidenceId,
    jobId,
  });

  await requireProjectMembership(serviceClient, record.project_id as string, user.id);

  return jsonResponse({
    report: buildReportRow(record, user.email ?? user.id, new Date().toISOString()),
    detail: record,
  });
}

async function listJobReports(userContext: Awaited<ReturnType<typeof requireUser>>, url: URL) {
  const { user, serviceClient } = userContext;
  const projectId = await resolveProjectId(serviceClient, user.id, url.searchParams.get("projectId"));
  await requireProjectMembership(serviceClient, projectId, user.id);

  const { data, error } = await serviceClient
    .from("unlearning_requests")
    .select(`
      id,
      project_id,
      status,
      target_scope_summary,
      anchor_status,
      blockchain_tx_hash,
      created_at,
      completed_at,
      evidence_records (
        id,
        evidence_hash,
        evidence_anchors (
          id,
          status,
          transaction_hash
        )
      ),
      projects (
        name
      )
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "Failed to load job reports");
  }

  const generatedAt = new Date().toISOString();
  const rows = (data ?? []).map((record) => buildReportRow(record as Record<string, unknown>, user.email ?? user.id, generatedAt));

  if (url.searchParams.get("format") === "csv") {
    return jsonResponse({
      rows,
      csv: toCsv(rows),
    });
  }

  return jsonResponse({
    rows,
  });
}

async function exportReport(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const { user, serviceClient } = userContext;
  const body = await req.json();
  const format = body.format as "json" | "csv" | "pdf" | undefined;

  if (!format || !["json", "csv", "pdf"].includes(format)) {
    throw new HttpError(400, "format must be json, csv, or pdf");
  }

  const record = await loadDetailedRecord(serviceClient, {
    evidenceId: body.evidenceId ?? null,
    jobId: body.jobId ?? null,
  });

  await requireProjectMembership(serviceClient, record.project_id as string, user.id, [...REPORT_ROLES]);

  const generatedAt = new Date().toISOString();
  const row = buildReportRow(record, user.email ?? user.id, generatedAt);
  const exportId = crypto.randomUUID();
  const payload = format === "csv"
    ? { row, csv: toCsv([row]) }
    : {
      row,
      detail: record,
    };

  const { error } = await serviceClient
    .from("report_exports")
    .insert({
      id: exportId,
      project_id: record.project_id,
      job_id: record.id,
      evidence_id: Array.isArray(record.evidence_records) ? record.evidence_records[0]?.id ?? null : record.evidence_records?.id ?? null,
      format,
      status: "generated",
      download_name: format === "csv"
        ? `forg3t-report-${record.id}.csv`
        : format === "json"
        ? `forg3t-report-${record.id}.json`
        : `forg3t-report-${record.id}.pdf`,
      payload,
      generated_by: user.id,
      generated_at: generatedAt,
    });

  if (error) {
    throw new HttpError(500, "Failed to record report export");
  }

  await serviceClient
    .from("evidence_records")
    .update({
      report_status: "ready",
    })
    .eq("id", Array.isArray(record.evidence_records) ? record.evidence_records[0]?.id ?? null : record.evidence_records?.id ?? null);

  await serviceClient
    .from("unlearning_requests")
    .update({
      report_status: "ready",
    })
    .eq("id", record.id);

  await appendReportToPipelineRun(serviceClient, record.pipeline_run_id as string | null | undefined, exportId);

  return jsonResponse({
    export: {
      id: exportId,
      format,
      generatedAt,
      payload,
    },
  });
}

async function commitPdfHash(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const body = await req.json();
  const { user, serviceClient } = userContext;
  const reportHash = body.reportHash as string | undefined;

  if (!reportHash) {
    throw new HttpError(400, "reportHash is required");
  }

  const record = await loadDetailedRecord(serviceClient, {
    evidenceId: body.evidenceId ?? null,
    jobId: body.jobId ?? null,
  });

  await requireProjectMembership(serviceClient, record.project_id as string, user.id, [...REPORT_ROLES]);
  const evidenceId = Array.isArray(record.evidence_records) ? record.evidence_records[0]?.id ?? null : record.evidence_records?.id ?? null;

  if (!evidenceId) {
    throw new HttpError(404, "Evidence record not found");
  }

  await serviceClient
    .from("evidence_records")
    .update({
      report_hash: reportHash,
      report_status: "ready",
    })
    .eq("id", evidenceId);

  await serviceClient
    .from("unlearning_requests")
    .update({
      report_status: "ready",
    })
    .eq("id", record.id);

  if (body.exportId) {
    const { data: reportExport } = await serviceClient
      .from("report_exports")
      .select("payload")
      .eq("id", body.exportId)
      .maybeSingle();

    await serviceClient
      .from("report_exports")
      .update({
        payload: {
          ...(reportExport?.payload ?? {}),
          reportHash,
        },
      })
      .eq("id", body.exportId);
  }

  return jsonResponse({
    success: true,
    reportHash,
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
      if (url.searchParams.get("jobId") || url.searchParams.get("evidenceId")) {
        return await getSingleReport(userContext, url);
      }

      return await listJobReports(userContext, url);
    }

    if (req.method === "POST") {
      const clone = req.clone();
      const body = await clone.json().catch(() => ({}));
      const action = body.action ?? "export";

      if (action === "commit_pdf_hash") {
        return await commitPdfHash(req, userContext);
      }

      return await exportReport(req, userContext);
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return handleError(error);
  }
});
