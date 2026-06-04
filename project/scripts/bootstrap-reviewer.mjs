#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');

const allowedRoles = new Set(['owner', 'admin', 'compliance', 'auditor', 'developer', 'viewer']);
const placeholderValues = new Set([
  'https://your-project.supabase.co',
  'your_supabase_anon_key',
  'your_supabase_access_token',
  'your_supabase_service_role_key',
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

process.env.SUPABASE_URL ||= process.env.VITE_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY ||= process.env.VITE_SUPABASE_ANON_KEY;

function isMissing(name) {
  return !process.env[name] || placeholderValues.has(process.env[name]);
}

function normalizeRole(value, fallback) {
  const role = String(value || fallback).trim().toLowerCase();
  if (!allowedRoles.has(role)) {
    throw new Error(`Unsupported role "${role}". Allowed roles: ${Array.from(allowedRoles).join(', ')}`);
  }
  return role;
}

function targetConfigs() {
  return [
    {
      label: 'reviewer',
      email: process.env.FORG3T_REVIEWER_EMAIL,
      password: process.env.FORG3T_REVIEWER_PASSWORD,
      role: normalizeRole(process.env.FORG3T_REVIEWER_ROLE, 'auditor'),
    },
    {
      label: 'automation',
      email: process.env.FORG3T_AUTOMATION_EMAIL,
      password: process.env.FORG3T_AUTOMATION_PASSWORD,
      role: normalizeRole(process.env.FORG3T_AUTOMATION_ROLE, 'developer'),
    },
  ].filter((target) => target.email);
}

async function findAuthUserByEmail(adminClient, email) {
  const needle = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === needle);
    if (user) {
      return user;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  throw new Error('User search exceeded pagination safety limit');
}

async function ensureAuthUser(adminClient, target) {
  const email = target.email.trim().toLowerCase();
  const existing = await findAuthUserByEmail(adminClient, email);
  if (existing) {
    console.log(`[bootstrap-reviewer] ${target.label}.user=exists`);
    return existing;
  }

  if (!target.password) {
    throw new Error(`${target.label} user does not exist and ${target.label === 'reviewer' ? 'FORG3T_REVIEWER_PASSWORD' : 'FORG3T_AUTOMATION_PASSWORD'} is not set`);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: target.password,
    email_confirm: true,
    user_metadata: {
      package_type: 'enterprise',
      forg3t_role_hint: target.role,
      created_for: `buildgames.forg3t.io ${target.label}`,
    },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create ${target.label} user: ${error?.message || 'empty response'}`);
  }

  console.log(`[bootstrap-reviewer] ${target.label}.user=created`);
  return data.user;
}

async function ensurePublicProfile(adminClient, user) {
  const { error } = await adminClient
    .from('users')
    .upsert({
      id: user.id,
      email: user.email,
      package_type: 'enterprise',
    }, {
      onConflict: 'id',
    });

  if (error) {
    throw new Error(`Failed to upsert public user profile for ${user.email}: ${error.message}`);
  }
}

async function ensureProjectMembership(adminClient, user, role) {
  const projectId = process.env.PROJECT_ID;
  const createdBy = process.env.FORG3T_BOOTSTRAP_CREATED_BY || user.id;

  const { data, error } = await adminClient
    .from('project_memberships')
    .upsert({
      project_id: projectId,
      user_id: user.id,
      role,
      created_by: createdBy,
    }, {
      onConflict: 'project_id,user_id',
    })
    .select('id, project_id, user_id, role')
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert membership for ${user.email}: ${error?.message || 'empty response'}`);
  }

  return data;
}

async function main() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PROJECT_ID'];
  const missing = required.filter(isMissing);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const targets = targetConfigs();
  if (!targets.length) {
    console.log('[bootstrap-reviewer] No FORG3T_REVIEWER_EMAIL or FORG3T_AUTOMATION_EMAIL provided; skipping account bootstrap.');
    return;
  }

  const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  for (const target of targets) {
    const user = await ensureAuthUser(adminClient, target);
    await ensurePublicProfile(adminClient, user);
    const membership = await ensureProjectMembership(adminClient, user, target.role);
    console.log(`[bootstrap-reviewer] ${target.label}.email=${target.email.trim().toLowerCase()}`);
    console.log(`[bootstrap-reviewer] ${target.label}.role=${membership.role}`);
    console.log(`[bootstrap-reviewer] ${target.label}.membershipId=${membership.id}`);
  }
}

main().catch((error) => {
  console.error(`[bootstrap-reviewer] FAILED: ${error.message}`);
  process.exit(1);
});
