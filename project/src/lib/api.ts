import { supabase } from './supabase';
import type {
  AnchorRecord,
  Integration,
  JobRecord,
  ProjectMembershipRecord,
  ReportExportPayload,
  ReportRow,
  VerificationPipeline,
  VerificationResponse,
} from '../types/domain';

type FunctionQuery = Record<string, string | number | boolean | null | undefined>;

async function getFunctionHeaders(auth = true) {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    } else {
      headers.Authorization = `Bearer ${anonKey}`;
    }
  } else {
    headers.Authorization = `Bearer ${anonKey}`;
  }

  return headers;
}

function buildFunctionUrl(name: string, query?: FunctionQuery) {
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function requestFunction<T>(name: string, options?: {
  method?: 'GET' | 'POST';
  query?: FunctionQuery;
  body?: unknown;
  auth?: boolean;
}) {
  const response = await fetch(buildFunctionUrl(name, options?.query), {
    method: options?.method ?? 'GET',
    headers: await getFunctionHeaders(options?.auth ?? true),
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed');
  }

  return payload as T;
}

export const jobsApi = {
  list(projectId?: string) {
    return requestFunction<{ jobs: JobRecord[] }>('jobs', {
      query: { projectId },
    });
  },
  get(jobId: string) {
    return requestFunction<{ job: JobRecord }>('jobs', {
      query: { jobId },
    });
  },
  create(body: Record<string, unknown>) {
    return requestFunction<{ job: JobRecord }>('jobs', {
      method: 'POST',
      body: {
        action: 'create',
        ...body,
      },
    });
  },
  complete(body: Record<string, unknown>) {
    return requestFunction<{ job: JobRecord }>('jobs', {
      method: 'POST',
      body: {
        action: 'complete',
        ...body,
      },
    });
  },
};

export const anchorsApi = {
  create(evidenceId: string, network?: 'fuji' | 'mainnet') {
    return requestFunction<{ anchor: AnchorRecord }>('anchors', {
      method: 'POST',
      body: {
        evidenceId,
        network,
      },
    });
  },
  getByEvidence(evidenceId: string) {
    return requestFunction<{ anchor: AnchorRecord }>('anchors', {
      query: { evidenceId },
    });
  },
  get(anchorId: string) {
    return requestFunction<{ anchor: AnchorRecord }>('anchors', {
      query: { anchorId },
    });
  },
};

export const verifyApi = {
  getEvidence(evidenceId: string) {
    return requestFunction<{ verification: VerificationResponse }>('verify-evidence', {
      query: { evidenceId },
    });
  },
  getPublic(token: string) {
    return requestFunction<{ verification: VerificationResponse }>('verify-evidence', {
      query: { token },
      auth: false,
    });
  },
  verifyUpload(body: Record<string, unknown>, auth = true) {
    return requestFunction<{ verification: VerificationResponse }>('verify-evidence', {
      method: 'POST',
      body,
      auth,
    });
  },
};

export const reportsApi = {
  list(projectId?: string, format?: 'json' | 'csv') {
    return requestFunction<{ rows: ReportRow[]; csv?: string }>('reports', {
      query: { projectId, format },
    });
  },
  get(body: { evidenceId?: string; jobId?: string }) {
    return requestFunction<{ report: ReportRow; detail: JobRecord }>('reports', {
      query: body,
    });
  },
  export(body: { evidenceId?: string; jobId?: string; format: 'json' | 'csv' | 'pdf' }) {
    return requestFunction<{ export: ReportExportPayload }>('reports', {
      method: 'POST',
      body,
    });
  },
  commitPdfHash(body: { evidenceId?: string; jobId?: string; exportId?: string; reportHash: string }) {
    return requestFunction<{ success: boolean; reportHash: string }>('reports', {
      method: 'POST',
      body: {
        action: 'commit_pdf_hash',
        ...body,
      },
    });
  },
};

export const pipelinesApi = {
  list(projectId?: string) {
    return requestFunction<{ pipelines: VerificationPipeline[] }>('pipelines', {
      query: { projectId },
    });
  },
  get(pipelineId: string, runs = false) {
    return requestFunction<{ pipeline: VerificationPipeline }>('pipelines', {
      query: { pipelineId, runs },
    });
  },
  create(body: Record<string, unknown>) {
    return requestFunction<{ pipeline: VerificationPipeline }>('pipelines', {
      method: 'POST',
      body: {
        action: 'create',
        ...body,
      },
    });
  },
  run(pipelineId: string) {
    return requestFunction<{ run: Record<string, unknown> }>('pipelines', {
      method: 'POST',
      body: {
        action: 'run',
        pipelineId,
      },
    });
  },
};

export const integrationsApi = {
  list(projectId?: string) {
    return requestFunction<{ integrations: Integration[] }>('integrations', {
      query: { projectId },
    });
  },
  get(integrationId: string) {
    return requestFunction<{ integration: Integration }>('integrations', {
      query: { integrationId },
    });
  },
  create(body: Record<string, unknown>) {
    return requestFunction<{ integration: Integration }>('integrations', {
      method: 'POST',
      body: {
        action: 'create',
        ...body,
      },
    });
  },
  update(body: Record<string, unknown>) {
    return requestFunction<{ integration: Integration }>('integrations', {
      method: 'POST',
      body: {
        action: 'update',
        ...body,
      },
    });
  },
  test(integrationId: string) {
    return requestFunction<{ test: Record<string, unknown> }>('integrations', {
      method: 'POST',
      body: {
        action: 'test',
        integrationId,
      },
    });
  },
};

export const projectAccessApi = {
  list(projectId?: string) {
    return requestFunction<{ memberships: ProjectMembershipRecord[] }>('project-access', {
      query: { projectId },
    });
  },
  add(body: Record<string, unknown>) {
    return requestFunction<{ membership: ProjectMembershipRecord }>('project-access', {
      method: 'POST',
      body: {
        action: 'add',
        ...body,
      },
    });
  },
  update(body: Record<string, unknown>) {
    return requestFunction<{ membership: ProjectMembershipRecord }>('project-access', {
      method: 'POST',
      body: {
        action: 'update',
        ...body,
      },
    });
  },
  remove(membershipId: string) {
    return requestFunction<{ success: boolean }>('project-access', {
      method: 'POST',
      body: {
        action: 'remove',
        membershipId,
      },
    });
  },
};
