import type {
  AnchorRecord,
  EvidenceRecord,
  Integration,
  JobRecord,
  ProjectRole,
} from '../types/domain';

export function getEvidenceRecord(job: JobRecord) {
  if (!job.evidence_records) {
    return null;
  }

  return Array.isArray(job.evidence_records) ? job.evidence_records[0] ?? null : job.evidence_records;
}

export function getAnchorRecord(job: JobRecord) {
  const evidence = getEvidenceRecord(job);
  if (!evidence?.evidence_anchors) {
    return null;
  }

  return Array.isArray(evidence.evidence_anchors)
    ? evidence.evidence_anchors[0] ?? null
    : evidence.evidence_anchors;
}

export function shortHash(value: string | null | undefined, start = 10, end = 8) {
  if (!value) {
    return 'N/A';
  }

  if (value.length <= start + end) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function explorerTxUrl(transactionHash: string | null | undefined, network: 'fuji' | 'mainnet' | null | undefined) {
  if (!transactionHash || !network) {
    return null;
  }

  const base = network === 'mainnet' ? 'https://snowtrace.io' : 'https://testnet.snowtrace.io';
  return `${base}/tx/${transactionHash}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'N/A';
  }

  return new Date(value).toLocaleString();
}

export function downloadTextFile(filename: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], {
    type,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function roleCanCreateJobs(role: ProjectRole | null | undefined) {
  return ['owner', 'admin', 'developer'].includes(role ?? '');
}

export function roleCanManageProject(role: ProjectRole | null | undefined) {
  return ['owner', 'admin'].includes(role ?? '');
}

export function roleCanExport(role: ProjectRole | null | undefined) {
  return ['owner', 'admin', 'developer', 'compliance'].includes(role ?? '');
}

export function roleCanManageIntegrations(role: ProjectRole | null | undefined) {
  return ['owner', 'admin', 'developer'].includes(role ?? '');
}

export function roleCanManagePipelines(role: ProjectRole | null | undefined) {
  return ['owner', 'admin', 'developer', 'compliance'].includes(role ?? '');
}

export function getIntegrationAssistantId(integration: Integration | null | undefined) {
  const metadata = integration?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const assistantId = (metadata as Record<string, unknown>).assistantId;
  return typeof assistantId === 'string' && assistantId.trim() ? assistantId : null;
}

export function integrationSupportsAssistantSuppression(integration: Integration | null | undefined) {
  return integration?.provider_type === 'openai_compatible' && Boolean(getIntegrationAssistantId(integration));
}

export function getJobRuntimeState(job: JobRecord | null | undefined) {
  const metadata = job?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const runtime = (metadata as Record<string, unknown>).runtime;
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    return null;
  }

  return runtime as {
    mode?: string | null;
    percent?: number | null;
    message?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  };
}

export function toEvidenceRecord(value: EvidenceRecord[] | EvidenceRecord | null | undefined) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

export function toAnchorRecord(value: AnchorRecord[] | AnchorRecord | null | undefined) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}
