#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
    return null;
  }

  const index = trimmed.indexOf('=');
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

[
  '.env',
  '.env.local',
  '.env.example',
  path.join('supabase', '.env'),
  path.join('supabase', '.env.local'),
  path.join('supabase', '.env.example'),
].forEach((file) => loadEnvFile(path.join(projectDir, file)));

process.env.SUPABASE_URL ||= process.env.VITE_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY ||= process.env.VITE_SUPABASE_ANON_KEY;

const canSignInForToken = Boolean(
  process.env.FORG3T_AUTOMATION_EMAIL &&
  process.env.FORG3T_AUTOMATION_PASSWORD,
);
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const placeholderValues = new Set([
  'https://your-project.supabase.co',
  'your_supabase_anon_key',
  'your_supabase_access_token',
]);
const missing = required.filter((name) => !process.env[name] || placeholderValues.has(process.env[name]));

if (!process.env.SUPABASE_ACCESS_TOKEN && !canSignInForToken) {
  missing.push('SUPABASE_ACCESS_TOKEN or FORG3T_AUTOMATION_EMAIL/FORG3T_AUTOMATION_PASSWORD');
}

if (missing.length) {
  console.error(`[phase2-smoke] Missing required env vars: ${missing.join(', ')}`);
  console.error('[phase2-smoke] The script auto-loads .env, .env.local, .env.example, supabase/.env, and supabase/.env.example when present.');
  console.error('[phase2-smoke] Required after auto-load: SUPABASE_URL, SUPABASE_ANON_KEY, plus SUPABASE_ACCESS_TOKEN or FORG3T_AUTOMATION_EMAIL/FORG3T_AUTOMATION_PASSWORD');
  console.error('[phase2-smoke] Optional: PROJECT_ID, PHASE2_ANCHOR=true, AVALANCHE_NETWORK=fuji|mainnet');
  process.exit(1);
}

const baseUrl = process.env.SUPABASE_URL.replace(/\/+$/, '');
const functionBase = `${baseUrl}/functions/v1`;
const shouldAnchor = process.env.PHASE2_ANCHOR === 'true';
const projectId = process.env.PROJECT_ID || undefined;
const network = process.env.AVALANCHE_NETWORK || undefined;

async function ensureAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return;
  }

  console.log('[phase2-smoke] Signing in automation account for runtime access token');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.FORG3T_AUTOMATION_EMAIL,
    password: process.env.FORG3T_AUTOMATION_PASSWORD,
  });

  if (error || !data.session?.access_token) {
    throw new Error(`Failed to sign in automation account: ${error?.message || 'empty session'}`);
  }

  process.env.SUPABASE_ACCESS_TOKEN = data.session.access_token;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    apikey: process.env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
  };
}

async function request(name, options = {}) {
  const url = new URL(`${functionBase}/${name}`);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: headers(),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error || response.statusText || 'request failed';
    throw new Error(`${name} ${response.status}: ${message}`);
  }

  return payload;
}

function getEvidence(job) {
  const value = job.evidence_records;
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function getAnchor(evidence) {
  const value = evidence?.evidence_anchors;
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function explorerUrl(transactionHash, anchorNetwork) {
  if (!transactionHash || !anchorNetwork) {
    return null;
  }

  const base = anchorNetwork === 'mainnet'
    ? 'https://snowtrace.io'
    : 'https://testnet.snowtrace.io';
  return `${base}/tx/${transactionHash}`;
}

async function main() {
  await ensureAccessToken();

  console.log('[phase2-smoke] Creating completed smoke job and evidence record');
  const created = await request('jobs', {
    method: 'POST',
    body: {
      action: 'create',
      projectId,
      requestReason: `Avalanche Phase 2 smoke ${new Date().toISOString()}`,
      targetType: 'api_endpoint',
      executionLane: 'manual',
      targetScopeSummary: 'Phase 2 smoke target with no raw customer content',
      status: 'completed',
      validationScore: 1,
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
      leakScore: 0,
      notes: 'Repository smoke flow: job -> evidence -> optional Avalanche anchor -> verification -> exports.',
    },
  });

  let job = created.job;
  let evidence = getEvidence(job);
  if (!evidence?.id || !evidence.evidence_hash || !evidence.job_hash) {
    throw new Error('Created job did not return a ready evidence record with evidence_hash and job_hash');
  }

  console.log(`[phase2-smoke] jobId=${job.id}`);
  console.log(`[phase2-smoke] evidenceId=${evidence.id}`);
  console.log(`[phase2-smoke] evidenceHash=${evidence.evidence_hash}`);
  console.log(`[phase2-smoke] jobHash=${evidence.job_hash}`);
  console.log(`[phase2-smoke] publicVerify=/verify/${evidence.public_verification_token}`);

  if (shouldAnchor) {
    console.log(`[phase2-smoke] Anchoring evidence on Avalanche ${network || '(default env network)'}`);
    const anchorResponse = await request('anchors', {
      method: 'POST',
      body: {
        evidenceId: evidence.id,
        network,
      },
    });
    const anchor = anchorResponse.anchor;
    console.log(`[phase2-smoke] anchorStatus=${anchor.status}`);
    console.log(`[phase2-smoke] transactionHash=${anchor.transaction_hash || 'pending'}`);
    console.log(`[phase2-smoke] network=${anchor.network}`);
    console.log(`[phase2-smoke] blockNumber=${anchor.block_number || 'pending'}`);
    console.log(`[phase2-smoke] explorerUrl=${anchor.explorerUrl || 'pending'}`);
  } else {
    console.log('[phase2-smoke] Skipping live Avalanche submission. Set PHASE2_ANCHOR=true to submit a real transaction.');
  }

  const refreshed = await request('jobs', {
    query: {
      jobId: job.id,
    },
  });
  job = refreshed.job;
  evidence = getEvidence(job);
  const anchor = getAnchor(evidence);

  const verification = await request('verify-evidence', {
    query: {
      evidenceId: evidence.id,
    },
  });
  console.log(`[phase2-smoke] verificationStatus=${verification.verification.verificationStatus}`);
  console.log(`[phase2-smoke] verificationAnchorStatus=${verification.verification.anchorStatus}`);

  for (const format of ['json', 'csv', 'pdf']) {
    let exported;
    try {
      exported = await request('reports', {
        method: 'POST',
        body: {
          evidenceId: evidence.id,
          format,
        },
      });
    } catch (error) {
      console.log(`[phase2-smoke] export.${format}.evidenceId failed: ${error.message}`);
      console.log(`[phase2-smoke] Retrying export.${format} with jobId=${job.id}`);
      exported = await request('reports', {
        method: 'POST',
        body: {
          jobId: job.id,
          format,
        },
      });
    }
    console.log(`[phase2-smoke] export.${format}.id=${exported.export.id}`);
  }

  console.log('[phase2-smoke] Summary');
  console.log(JSON.stringify({
    jobId: job.id,
    evidenceId: evidence.id,
    evidenceHash: evidence.evidence_hash,
    jobHash: evidence.job_hash,
    anchorStatus: anchor?.status || job.anchor_status,
    transactionHash: anchor?.transaction_hash || job.blockchain_tx_hash,
    network: anchor?.network || null,
    blockNumber: anchor?.block_number || null,
    explorerUrl: anchor?.explorerUrl || explorerUrl(anchor?.transaction_hash || job.blockchain_tx_hash, anchor?.network),
    publicVerifyRoute: `/verify/${evidence.public_verification_token}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[phase2-smoke] FAILED: ${error.message}`);
  process.exit(1);
});
