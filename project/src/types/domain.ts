export type ProjectRole = 'owner' | 'admin' | 'compliance' | 'auditor' | 'developer' | 'viewer';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type AnchorStatus = 'not_submitted' | 'pending' | 'confirmed' | 'failed';
export type EvidenceArtifactStatus = 'not_generated' | 'ready' | 'invalid';
export type ReportStatus = 'not_generated' | 'ready' | 'failed';
export type VerificationStatus =
  | 'not_verified'
  | 'valid'
  | 'hash_mismatch'
  | 'anchor_not_found'
  | 'anchor_pending'
  | 'anchor_confirmed'
  | 'anchor_failed'
  | 'invalid_bundle'
  | 'unsupported_file';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ProjectMembership {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  projects: Project;
}

export interface Integration {
  id: string;
  project_id: string;
  name: string;
  provider_type: 'openai_compatible' | 'generic_http';
  base_url: string;
  model_identifier: string | null;
  auth_type: 'bearer' | 'header' | 'none';
  auth_header_name: string | null;
  status: 'not_tested' | 'connected' | 'failed';
  last_tested_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  secretConfigured?: boolean;
}

export interface AnchorRecord {
  id: string;
  project_id?: string;
  job_id: string;
  evidence_id: string;
  evidence_hash: string;
  job_hash: string;
  bundle_hash?: string | null;
  network: 'fuji' | 'mainnet';
  chain_id: number;
  contract_address: string | null;
  transaction_hash: string | null;
  block_number: number | null;
  status: AnchorStatus;
  error_message: string | null;
  created_at?: string;
  updated_at?: string;
  confirmed_at: string | null;
  explorerUrl?: string | null;
}

export interface EvidenceRecord {
  id: string;
  project_id: string;
  job_id: string;
  manifest: Record<string, unknown>;
  report_payload: Record<string, unknown>;
  evidence_hash: string | null;
  job_hash: string;
  bundle_hash: string | null;
  report_hash: string | null;
  artifact_status: EvidenceArtifactStatus;
  report_status: ReportStatus;
  verification_status: VerificationStatus;
  public_verification_token: string;
  created_at: string;
  updated_at: string;
  evidence_anchors?: AnchorRecord[] | AnchorRecord | null;
}

export interface JobRecord {
  id: string;
  project_id: string;
  user_id: string;
  created_by: string;
  integration_id: string | null;
  pipeline_id: string | null;
  pipeline_run_id: string | null;
  request_reason: string;
  status: JobStatus;
  processing_time_seconds: number | null;
  blockchain_tx_hash: string | null;
  audit_trail: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  target_type: string;
  execution_lane: string;
  validation_score: number | null;
  completed_at: string | null;
  error_message: string | null;
  target_scope_summary: string | null;
  evidence_status: EvidenceArtifactStatus;
  anchor_status: AnchorStatus;
  report_status: ReportStatus;
  verification_status: VerificationStatus;
  metadata: Record<string, unknown>;
  integrations?: Integration | null;
  evidence_records?: EvidenceRecord[] | EvidenceRecord | null;
}

export interface ReportRow {
  projectName: string;
  jobId: string;
  evidenceId: string | null;
  targetScopeSummary: string | null;
  validationStatus: string;
  anchorStatus: string;
  evidenceHash: string | null;
  transactionHash: string | null;
  timestamp: string;
  exportGeneratedBy: string;
  exportGeneratedAt: string;
}

export interface ReportExportPayload {
  id: string;
  format: 'json' | 'csv' | 'pdf';
  generatedAt: string;
  payload: {
    row: ReportRow;
    csv?: string;
    detail?: JobRecord;
  };
}

export interface PipelineRun {
  id: string;
  pipeline_id?: string;
  project_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  created_jobs: string[];
  created_evidence: string[];
  created_anchors: string[];
  created_reports: string[];
  error_message: string | null;
  created_at: string;
}

export interface VerificationPipeline {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  target_scope: Record<string, unknown>;
  validation_config: Record<string, unknown>;
  evidence_config: Record<string, unknown>;
  anchor_required: boolean;
  export_required: boolean;
  trigger_mode: 'manual' | 'scheduled';
  created_by: string;
  created_at: string;
  updated_at: string;
  pipeline_runs?: PipelineRun[];
}

export interface ProjectMembershipRecord {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  created_at: string;
  updated_at: string;
  users: {
    id: string;
    email: string;
    package_type: 'individual' | 'enterprise';
    created_at: string;
    updated_at: string;
  };
}

export interface VerificationResponse {
  evidenceId?: string;
  projectName?: string;
  generatedAt?: string | null;
  targetType?: string | null;
  executionLane?: string | null;
  validationScore?: number | null;
  expectedHash?: string | null;
  localHash?: string | null;
  verificationStatus: VerificationStatus;
  anchorStatus?: AnchorStatus | 'not_submitted';
  transactionHash?: string | null;
  explorerUrl?: string | null;
  network?: 'fuji' | 'mainnet' | null;
  chainId?: number | null;
  blockNumber?: number | null;
  contractAddress?: string | null;
  manifest?: Record<string, unknown> | null;
  reportPayload?: Record<string, unknown> | null;
  publicVerificationToken?: string;
  transaction?: {
    found: boolean;
    status: string;
    blockNumber: number | null;
    chainId: number;
    network: string;
    explorerUrl: string;
  };
}
