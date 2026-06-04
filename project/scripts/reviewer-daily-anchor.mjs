#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const defaultReviewProjectId = '0c7643e1-471f-4b04-848c-329c39f77143';
const placeholderValues = new Set([
  'https://your-project.supabase.co',
  'your_supabase_anon_key',
  'your_supabase_access_token',
]);

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

function loadPublicNetlifyEnv(name) {
  if (process.env[name] && !placeholderValues.has(process.env[name])) {
    return;
  }

  const result = spawnSync(`npx --yes netlify-cli@latest env:get ${name} --context production`, {
    cwd: path.resolve(projectDir, '..'),
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    console.warn(`[reviewer-daily-anchor] Could not load ${name} from linked Netlify production env; set it explicitly if the run fails.`);
    return;
  }

  const value = result.stdout.trim();
  if (value) {
    process.env[name] = value;
  }
}

[
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'PROJECT_ID',
  'FORG3T_REVIEW_PROJECT_ID',
  'FORG3T_AUTOMATION_EMAIL',
  'FORG3T_AUTOMATION_PASSWORD',
  'AVALANCHE_NETWORK',
].forEach(loadPublicNetlifyEnv);

process.env.SUPABASE_URL ||= process.env.VITE_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY ||= process.env.VITE_SUPABASE_ANON_KEY;
process.env.PROJECT_ID ||= process.env.FORG3T_REVIEW_PROJECT_ID || defaultReviewProjectId;
process.env.PHASE2_ANCHOR = 'true';
process.env.AVALANCHE_NETWORK ||= process.env.AVALANCHE_ANCHOR_NETWORK || 'mainnet';

const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'PROJECT_ID',
  'FORG3T_AUTOMATION_EMAIL',
  'FORG3T_AUTOMATION_PASSWORD',
];
const missing = required.filter((name) => !process.env[name] || placeholderValues.has(process.env[name]));

if (missing.length) {
  console.error(`[reviewer-daily-anchor] Missing required env vars: ${missing.join(', ')}`);
  console.error('[reviewer-daily-anchor] Required: SUPABASE_URL, SUPABASE_ANON_KEY, PROJECT_ID, FORG3T_AUTOMATION_EMAIL, FORG3T_AUTOMATION_PASSWORD');
  console.error('[reviewer-daily-anchor] The Avalanche wallet/private key must stay in Supabase Edge Function secrets, not in this script.');
  process.exit(1);
}

console.log('[reviewer-daily-anchor] Starting anchored Phase 2 reviewer run');
console.log(`[reviewer-daily-anchor] projectId=${process.env.PROJECT_ID}`);
console.log(`[reviewer-daily-anchor] network=${process.env.AVALANCHE_NETWORK}`);

const result = spawnSync(process.execPath, [path.join(scriptDir, 'phase2-smoke.mjs')], {
  cwd: projectDir,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[reviewer-daily-anchor] Failed to start smoke flow: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[reviewer-daily-anchor] Smoke flow failed with exit code ${result.status}`);
  process.exit(result.status || 1);
}

console.log('[reviewer-daily-anchor] Completed anchored reviewer run');
