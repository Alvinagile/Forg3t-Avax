import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { handleError, HttpError } from "../_shared/errors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { requireProjectMembership } from "../_shared/rbac.ts";
import {
  AvalancheNetwork,
  getExplorerUrl,
  getTransactionStatus,
} from "../_shared/avalanche.ts";
import { resolveVerificationState } from "../../../shared/workflows.ts";

type ArtifactType = "json" | "pdf";
type VerificationStatus =
  | "valid"
  | "hash_mismatch"
  | "anchor_not_found"
  | "anchor_pending"
  | "anchor_confirmed"
  | "invalid_bundle"
  | "unsupported_file";

async function maybeGetUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const serviceClient = createServiceClient();

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      user: null,
      serviceClient,
    };
  }

  try {
    const token = authHeader.replace("Bearer ", "").trim();
    const {
      data: { user },
    } = await serviceClient.auth.getUser(token);

    return {
      user: user ?? null,
      serviceClient,
    };
  } catch {
    return {
      user: null,
      serviceClient,
    };
  }
}

async function loadEvidenceById(
  serviceClient: ReturnType<typeof createServiceClient>,
  evidenceId: string,
) {
  const { data, error } = await serviceClient
    .from("evidence_records")
    .select(`
      id,
      project_id,
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
      unlearning_requests (
        id,
        status,
        validation_score,
        target_type,
        execution_lane,
        anchor_status,
        report_status,
        verification_status,
        blockchain_tx_hash,
        created_at,
        completed_at
      ),
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
      ),
      projects (
        id,
        name,
        slug
      )
    `)
    .eq("id", evidenceId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load evidence");
  }

  return data;
}

async function loadEvidenceByToken(
  serviceClient: ReturnType<typeof createServiceClient>,
  token: string,
) {
  const { data, error } = await serviceClient
    .from("evidence_records")
    .select(`
      id,
      project_id,
      evidence_hash,
      bundle_hash,
      report_hash,
      artifact_status,
      report_status,
      verification_status,
      public_verification_token,
      created_at,
      updated_at,
      unlearning_requests (
        id,
        status,
        validation_score,
        target_type,
        execution_lane,
        anchor_status,
        report_status,
        verification_status,
        created_at,
        completed_at
      ),
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
      ),
      projects (
        id,
        name,
        slug
      )
    `)
    .eq("public_verification_token", token)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load evidence");
  }

  return data;
}

async function loadEvidenceByHash(
  serviceClient: ReturnType<typeof createServiceClient>,
  localHash: string,
  artifactType: ArtifactType,
) {
  const hashColumn = artifactType === "pdf" ? "report_hash" : "evidence_hash";

  const { data, error } = await serviceClient
    .from("evidence_records")
    .select(`
      id,
      project_id,
      evidence_hash,
      bundle_hash,
      report_hash,
      artifact_status,
      report_status,
      verification_status,
      public_verification_token,
      created_at,
      updated_at,
      unlearning_requests (
        id,
        status,
        validation_score,
        target_type,
        execution_lane,
        anchor_status,
        report_status,
        verification_status,
        created_at,
        completed_at
      ),
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
      ),
      projects (
        id,
        name,
        slug
      )
    `)
    .eq(hashColumn, localHash)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to verify evidence");
  }

  return data;
}

async function syncAnchorVerification(
  serviceClient: ReturnType<typeof createServiceClient>,
  evidenceRecord: Record<string, unknown>,
) {
  const anchor = Array.isArray(evidenceRecord.evidence_anchors)
    ? evidenceRecord.evidence_anchors[0]
    : evidenceRecord.evidence_anchors;

  if (!anchor?.transaction_hash || !anchor.network) {
    return anchor ?? null;
  }

  const txStatus = await getTransactionStatus(
    anchor.transaction_hash as `0x${string}`,
    anchor.network as AvalancheNetwork,
  );
  const nextStatus = txStatus.found && txStatus.status === "success"
    ? "confirmed"
    : txStatus.found && txStatus.status === "reverted"
    ? "failed"
    : anchor.status === "failed"
    ? "failed"
    : "pending";

  const updatePayload = {
    status: nextStatus,
    block_number: txStatus.blockNumber ? Number(txStatus.blockNumber) : anchor.block_number,
    confirmed_at: nextStatus === "confirmed" ? anchor.confirmed_at ?? new Date().toISOString() : anchor.confirmed_at,
  };

  await serviceClient
    .from("evidence_anchors")
    .update(updatePayload)
    .eq("id", anchor.id as string);

  await serviceClient
    .from("unlearning_requests")
    .update({
      anchor_status: nextStatus,
      blockchain_tx_hash: anchor.transaction_hash,
    })
    .eq("id", (Array.isArray(evidenceRecord.unlearning_requests)
      ? evidenceRecord.unlearning_requests[0]?.id
      : evidenceRecord.unlearning_requests?.id) as string);

  return {
    ...anchor,
    ...updatePayload,
    explorerUrl: txStatus.explorerUrl,
  };
}

function getExpectedHash(evidenceRecord: Record<string, unknown>, artifactType: ArtifactType) {
  if (artifactType === "pdf") {
    return evidenceRecord.report_hash as string | null;
  }

  return (evidenceRecord.bundle_hash as string | null) ?? (evidenceRecord.evidence_hash as string | null);
}

function buildVerificationResponse(params: {
  evidenceRecord: Record<string, unknown>;
  artifactType: ArtifactType;
  localHash?: string | null;
  bundleState?: VerificationStatus | null;
  anchor?: Record<string, unknown> | null;
  publicMode: boolean;
}) {
  const job = Array.isArray(params.evidenceRecord.unlearning_requests)
    ? params.evidenceRecord.unlearning_requests[0]
    : params.evidenceRecord.unlearning_requests;
  const project = Array.isArray(params.evidenceRecord.projects)
    ? params.evidenceRecord.projects[0]
    : params.evidenceRecord.projects;
  const expectedHash = getExpectedHash(params.evidenceRecord, params.artifactType);
  let verificationStatus: VerificationStatus = params.bundleState ?? "anchor_not_found";

  if (params.bundleState) {
    verificationStatus = params.bundleState;
  } else {
    verificationStatus = resolveVerificationState({
      expectedHash,
      localHash: params.localHash,
      anchorStatus: params.anchor?.status ?? null,
    }) as VerificationStatus;
  }

  const baseResponse = {
    evidenceId: params.evidenceRecord.id,
    projectName: project?.name ?? "Forg3t Project",
    generatedAt: job?.completed_at ?? params.evidenceRecord.created_at,
    targetType: job?.target_type ?? null,
    executionLane: job?.execution_lane ?? null,
    validationScore: job?.validation_score ?? null,
    expectedHash,
    localHash: params.localHash ?? null,
    verificationStatus,
    anchorStatus: params.anchor?.status ?? "not_submitted",
    transactionHash: params.anchor?.transaction_hash ?? null,
    explorerUrl: params.anchor?.transaction_hash && params.anchor?.network
      ? getExplorerUrl(params.anchor.transaction_hash as string, params.anchor.network as AvalancheNetwork)
      : null,
    network: params.anchor?.network ?? null,
    chainId: params.anchor?.chain_id ?? null,
    blockNumber: params.anchor?.block_number ?? null,
    contractAddress: params.anchor?.contract_address ?? null,
  };

  if (params.publicMode) {
    return baseResponse;
  }

  return {
    ...baseResponse,
    manifest: params.evidenceRecord.manifest ?? null,
    reportPayload: params.evidenceRecord.report_payload ?? null,
    publicVerificationToken: params.evidenceRecord.public_verification_token,
  };
}

async function getVerificationStatus(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const evidenceId = url.searchParams.get("evidenceId");
  const maybeUser = await maybeGetUser(req);

  if (!token && !evidenceId) {
    throw new HttpError(400, "token or evidenceId is required");
  }

  let evidenceRecord: Record<string, unknown> | null = null;
  let publicMode = false;

  if (token) {
    evidenceRecord = await loadEvidenceByToken(maybeUser.serviceClient, token) as Record<string, unknown> | null;
    publicMode = !maybeUser.user;
  } else if (evidenceId) {
    if (!maybeUser.user) {
      throw new HttpError(401, "Authentication required");
    }

    evidenceRecord = await loadEvidenceById(maybeUser.serviceClient, evidenceId) as Record<string, unknown> | null;
    if (!evidenceRecord) {
      throw new HttpError(404, "Evidence not found");
    }

    await requireProjectMembership(maybeUser.serviceClient, evidenceRecord.project_id as string, maybeUser.user.id);
  }

  if (!evidenceRecord) {
    throw new HttpError(404, "Evidence not found");
  }

  const anchor = await syncAnchorVerification(maybeUser.serviceClient, evidenceRecord);

  return jsonResponse({
    verification: buildVerificationResponse({
      evidenceRecord,
      artifactType: "json",
      anchor,
      publicMode,
    }),
  });
}

async function verifyEvidenceUpload(req: Request) {
  const body = await req.json();
  const artifactType = body.artifactType as ArtifactType | undefined;

  if (!artifactType || !["json", "pdf"].includes(artifactType)) {
    return jsonResponse({
      verification: {
        verificationStatus: "unsupported_file",
      },
    });
  }

  if (body.invalidBundle) {
    return jsonResponse({
      verification: {
        verificationStatus: "invalid_bundle",
      },
    });
  }

  const localHash = body.localHash as string | undefined;
  if (!localHash) {
    throw new HttpError(400, "localHash is required");
  }

  const maybeUser = await maybeGetUser(req);
  let evidenceRecord: Record<string, unknown> | null = null;
  let publicMode = !maybeUser.user;

  if (body.verificationToken) {
    evidenceRecord = await loadEvidenceByToken(maybeUser.serviceClient, body.verificationToken) as Record<string, unknown> | null;
  } else if (body.evidenceId) {
    if (!maybeUser.user) {
      throw new HttpError(401, "Authentication required");
    }

    evidenceRecord = await loadEvidenceById(maybeUser.serviceClient, body.evidenceId) as Record<string, unknown> | null;
    publicMode = false;
  } else {
    evidenceRecord = await loadEvidenceByHash(maybeUser.serviceClient, localHash, artifactType) as Record<string, unknown> | null;
  }

  if (!evidenceRecord) {
    return jsonResponse({
      verification: {
        localHash,
        verificationStatus: "anchor_not_found",
      },
    });
  }

  if (maybeUser.user) {
    await requireProjectMembership(maybeUser.serviceClient, evidenceRecord.project_id as string, maybeUser.user.id);
    publicMode = false;
  }

  const anchor = await syncAnchorVerification(maybeUser.serviceClient, evidenceRecord);
  const verification = buildVerificationResponse({
    evidenceRecord,
    artifactType,
    localHash,
    anchor,
    publicMode,
  });

  if (body.transactionHash && body.network) {
    const transaction = await getTransactionStatus(
      body.transactionHash as `0x${string}`,
      body.network as AvalancheNetwork,
    );
    return jsonResponse({
      verification: {
        ...verification,
        transaction,
      },
    });
  }

  return jsonResponse({
    verification,
  });
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    if (req.method === "GET") {
      return await getVerificationStatus(req);
    }

    if (req.method === "POST") {
      return await verifyEvidenceUpload(req);
    }

    throw new HttpError(405, "Method not allowed");
  } catch (error) {
    return handleError(error);
  }
});
