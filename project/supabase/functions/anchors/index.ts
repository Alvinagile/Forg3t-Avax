import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { requireUser } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";
import {
  AvalancheNetwork,
  getAvalancheConfig,
  getExplorerUrl,
  getTransactionStatus,
  readAnchoredEvidence,
  submitEvidenceCommitment,
} from "../_shared/avalanche.ts";

const ANCHOR_ROLES = ["owner", "admin", "developer", "compliance"] as const;

async function loadEvidenceContext(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  evidenceId: string,
) {
  const { data, error } = await serviceClient
    .from("evidence_records")
    .select(`
      *,
      unlearning_requests (
        id,
        project_id,
        pipeline_run_id,
        anchor_status,
        blockchain_tx_hash
      ),
      evidence_anchors (
        id,
        project_id,
        job_id,
        evidence_id,
        evidence_hash,
        job_hash,
        bundle_hash,
        network,
        chain_id,
        contract_address,
        transaction_hash,
        block_number,
        status,
        error_message,
        confirmed_at,
        created_at,
        updated_at
      )
    `)
    .eq("id", evidenceId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load evidence record");
  }

  if (!data) {
    throw new HttpError(404, "Evidence not found");
  }

  return data;
}

async function loadAnchorContext(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  anchorId: string,
) {
  const { data, error } = await serviceClient
    .from("evidence_anchors")
    .select(`
      *,
      evidence_records (
        id,
        project_id,
        evidence_hash,
        job_hash,
        bundle_hash
      )
    `)
    .eq("id", anchorId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load anchor");
  }

  if (!data) {
    throw new HttpError(404, "Anchor not found");
  }

  return data;
}

async function syncAnchorStatus(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  anchor: Record<string, unknown>,
) {
  const network = anchor.network as AvalancheNetwork;
  const transactionHash = anchor.transaction_hash as `0x${string}` | null;

  if (!transactionHash) {
    return {
      ...anchor,
      explorerUrl: null,
    };
  }

  const txStatus = await getTransactionStatus(transactionHash, network);
  let nextStatus = anchor.status as string;
  let errorMessage = anchor.error_message as string | null;
  let blockNumber = anchor.block_number as number | string | bigint | null;
  let confirmedAt = anchor.confirmed_at as string | null;

  if (txStatus.found && txStatus.status === "success") {
    const onChain = await readAnchoredEvidence(anchor.job_hash as `0x${string}`, network);
    if (onChain.artifactHash.toLowerCase() !== String(anchor.evidence_hash).toLowerCase()) {
      nextStatus = "failed";
      errorMessage = "On-chain evidence hash mismatch";
    } else {
      nextStatus = "confirmed";
      blockNumber = txStatus.blockNumber;
      confirmedAt = confirmedAt ?? new Date().toISOString();
      errorMessage = null;
    }
  } else if (txStatus.found && txStatus.status === "reverted") {
    nextStatus = "failed";
    errorMessage = errorMessage ?? "Avalanche transaction reverted";
  } else if (nextStatus !== "failed") {
    nextStatus = "pending";
  }

  const updatePayload = {
    status: nextStatus,
    error_message: errorMessage,
    block_number: typeof blockNumber === "bigint" ? Number(blockNumber) : blockNumber,
    confirmed_at: confirmedAt,
  };

  await serviceClient
    .from("evidence_anchors")
    .update(updatePayload)
    .eq("id", anchor.id as string);

  await serviceClient
    .from("unlearning_requests")
    .update({
      anchor_status: nextStatus,
      blockchain_tx_hash: transactionHash,
    })
    .eq("id", anchor.job_id as string);

  return {
    ...anchor,
    ...updatePayload,
    explorerUrl: txStatus.explorerUrl,
  };
}

async function appendAnchorToPipelineRun(
  serviceClient: Awaited<ReturnType<typeof requireUser>>["serviceClient"],
  pipelineRunId: string | null | undefined,
  anchorId: string,
) {
  if (!pipelineRunId) {
    return;
  }

  const { data, error } = await serviceClient
    .from("pipeline_runs")
    .select("created_anchors")
    .eq("id", pipelineRunId)
    .maybeSingle();

  if (error || !data) {
    return;
  }

  const createdAnchors = Array.isArray(data.created_anchors) ? data.created_anchors as string[] : [];
  if (!createdAnchors.includes(anchorId)) {
    createdAnchors.push(anchorId);
    await serviceClient
      .from("pipeline_runs")
      .update({ created_anchors: createdAnchors })
      .eq("id", pipelineRunId);
  }
}

async function createAnchor(req: Request, userContext: Awaited<ReturnType<typeof requireUser>>) {
  const { user, serviceClient } = userContext;
  const body = await req.json();
  const evidenceId = body.evidenceId as string | undefined;

  if (!evidenceId) {
    throw new HttpError(400, "evidenceId is required");
  }

  const evidenceContext = await loadEvidenceContext(serviceClient, evidenceId);
  const job = Array.isArray(evidenceContext.unlearning_requests)
    ? evidenceContext.unlearning_requests[0]
    : evidenceContext.unlearning_requests;

  if (!job?.project_id) {
    throw new HttpError(500, "Evidence record is missing project context");
  }

  await requireProjectMembership(serviceClient, job.project_id, user.id, [...ANCHOR_ROLES]);

  if (!evidenceContext.evidence_hash || evidenceContext.artifact_status !== "ready") {
    throw new HttpError(409, "Evidence is not ready for anchoring");
  }

  const existingAnchor = Array.isArray(evidenceContext.evidence_anchors)
    ? evidenceContext.evidence_anchors[0]
    : evidenceContext.evidence_anchors;

  if (existingAnchor?.status === "confirmed") {
    return jsonResponse({
      anchor: {
        ...existingAnchor,
        explorerUrl: existingAnchor.transaction_hash
          ? getExplorerUrl(existingAnchor.transaction_hash, existingAnchor.network as AvalancheNetwork)
          : null,
      },
    });
  }

  const network = (body.network ?? getAvalancheConfig().network) as AvalancheNetwork;
  const avalancheConfig = getAvalancheConfig(network);
  const anchorId = existingAnchor?.id ?? crypto.randomUUID();

  await serviceClient
    .from("evidence_anchors")
    .upsert({
      id: anchorId,
      project_id: job.project_id,
      job_id: job.id,
      evidence_id: evidenceContext.id,
      evidence_hash: evidenceContext.evidence_hash,
      job_hash: evidenceContext.job_hash,
      bundle_hash: evidenceContext.bundle_hash,
      network,
      chain_id: avalancheConfig.chainId,
      contract_address: avalancheConfig.contractAddress,
      status: "pending",
      error_message: null,
      created_by: user.id,
    });

  await serviceClient
    .from("unlearning_requests")
    .update({
      anchor_status: "pending",
    })
    .eq("id", job.id);

  try {
    const submission = await submitEvidenceCommitment(
      evidenceContext.job_hash as `0x${string}`,
      evidenceContext.evidence_hash as `0x${string}`,
      network,
    );
    const finalStatus = submission.receipt?.status === "success"
      ? "confirmed"
      : submission.receipt?.status === "reverted"
      ? "failed"
      : "pending";
    const confirmedAt = finalStatus === "confirmed" ? new Date().toISOString() : null;

    const updatePayload = {
      transaction_hash: submission.transactionHash,
      block_number: submission.receipt?.blockNumber ? Number(submission.receipt.blockNumber) : null,
      status: finalStatus,
      error_message: finalStatus === "failed" ? "Avalanche transaction reverted" : null,
      confirmed_at: confirmedAt,
    };

    await serviceClient
      .from("evidence_anchors")
      .update(updatePayload)
      .eq("id", anchorId);

    await serviceClient
      .from("unlearning_requests")
      .update({
        anchor_status: finalStatus,
        blockchain_tx_hash: submission.transactionHash,
      })
      .eq("id", job.id);

    await appendAnchorToPipelineRun(serviceClient, job.pipeline_run_id ?? null, anchorId);

    const anchor = await syncAnchorStatus(serviceClient, {
      id: anchorId,
      project_id: job.project_id,
      job_id: job.id,
      evidence_id: evidenceContext.id,
      evidence_hash: evidenceContext.evidence_hash,
      job_hash: evidenceContext.job_hash,
      bundle_hash: evidenceContext.bundle_hash,
      network,
      chain_id: avalancheConfig.chainId,
      contract_address: avalancheConfig.contractAddress,
      ...updatePayload,
    });

    return jsonResponse({
      anchor,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to anchor evidence";

    await serviceClient
      .from("evidence_anchors")
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("id", anchorId);

    await serviceClient
      .from("unlearning_requests")
      .update({
        anchor_status: "failed",
      })
      .eq("id", job.id);

    throw new HttpError(500, message);
  }
}

async function getAnchor(userContext: Awaited<ReturnType<typeof requireUser>>, url: URL) {
  const { user, serviceClient } = userContext;
  const evidenceId = url.searchParams.get("evidenceId");
  const anchorId = url.searchParams.get("anchorId");

  if (!evidenceId && !anchorId) {
    throw new HttpError(400, "evidenceId or anchorId is required");
  }

  let anchorContext: Record<string, unknown>;
  let projectId: string;

  if (anchorId) {
    anchorContext = await loadAnchorContext(serviceClient, anchorId);
    projectId = anchorContext.project_id as string;
  } else {
    const evidenceContext = await loadEvidenceContext(serviceClient, evidenceId!);
    const anchor = Array.isArray(evidenceContext.evidence_anchors)
      ? evidenceContext.evidence_anchors[0]
      : evidenceContext.evidence_anchors;

    if (!anchor) {
      return jsonResponse({
        anchor: {
          status: "not_submitted",
          evidenceId,
        },
      });
    }

    anchorContext = anchor as Record<string, unknown>;
    projectId = evidenceContext.project_id as string;
  }

  await requireProjectMembership(serviceClient, projectId, user.id);
  const anchor = await syncAnchorStatus(serviceClient, anchorContext);

  return jsonResponse({
    anchor,
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
      return await getAnchor(userContext, url);
    }

    if (req.method === "POST") {
      return await createAnchor(req, userContext);
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return handleError(error);
  }
});
