# Reviewer Runbook

This runbook gives a grant reviewer or operator practical commands for validating the repository-controlled Phase 2 implementation.

## Verification Modes

Use one of two modes:

1. Repository-only validation: install dependencies, run tests, lint, build, audit, and compile contracts. This validates code evidence without requiring live Supabase or Avalanche credentials.
2. Deployed-environment validation: run the smoke script and curl examples against a configured Supabase project. Live Avalanche anchoring requires a funded anchor wallet and deployed contract address.

Do not interpret repository-only validation as proof of production deployment or customer usage.

## Prerequisites

- Node.js 20.19+ for the frontend app.
- Node.js 22.13+ for `contracts` because Hardhat 3 requires it.
- npm.
- Supabase project and user access token for Edge Function smoke tests.
- Funded Avalanche anchor wallet only if submitting a live anchor transaction.

## Required Environment Variables

Frontend:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_AVALANCHE_DEFAULT_NETWORK=fuji
VITE_ANCHOR_CONTRACT_ADDRESS=...
```

Supabase Edge Functions:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
FORG3T_SECRET_ENCRYPTION_KEY=...
AVALANCHE_ANCHOR_PRIVATE_KEY=...
AVALANCHE_ANCHOR_NETWORK=fuji
AVALANCHE_FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
AVALANCHE_FUJI_CHAIN_ID=43113
AVALANCHE_FUJI_CONTRACT_ADDRESS=...
AVALANCHE_MAINNET_RPC_URL=https://api.avax.network/ext/bc/C/rpc
AVALANCHE_MAINNET_CHAIN_ID=43114
AVALANCHE_MAINNET_CONTRACT_ADDRESS=...
AVALANCHE_CONFIRMATIONS_REQUIRED=1
```

Smoke script:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_ACCESS_TOKEN=...
PROJECT_ID=...
PHASE2_ANCHOR=false
AVALANCHE_NETWORK=fuji
```

Do not set `PHASE2_ANCHOR=true` unless the target environment has a funded wallet and deployed contract address.

## Install Commands

From `project`:

```bash
npm install
```

From `project/contracts`:

```bash
npm install
```

## Build and Test Commands

From `project`:

```bash
npm test
npm run lint
npm run build
npm audit
```

Expected output:

```text
Test Files  4 passed
Tests       15 passed
found 0 vulnerabilities
```

From `project/contracts` with Node 22.13+:

```bash
npm run compile
npm audit
```

Expected output:

```text
No contracts to compile
found 0 vulnerabilities
```

## Local Development Command

From `project`:

```bash
npm run dev
```

Open the printed local Vite URL and sign in with a configured Supabase Auth user.

## Contract Compile Command

From `project/contracts`:

```bash
npm run compile
```

If local Node is older than 22.13, use a Node 22.13+ runtime. Hardhat 3 will reject Node 20.x.

## Local Contract Deploy Smoke

For a local-only run without external RPC, call Hardhat without `--network fuji` using the deploy script:

```bash
OWNER_ADDRESS=0x000000000000000000000000000000000000dEaD npx hardhat run scripts/deploy.ts
```

Expected output includes:

```text
ForgEvidenceAnchor deployment
Contract deployed
Address : 0x...
Tx hash : 0x...
Block   : 1
```

## Phase 2 Smoke Command

This command is not a fully offline local test. It calls Supabase Edge Functions and requires a real Supabase Auth access token for a user with project membership.

Without live anchoring:

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
SUPABASE_ACCESS_TOKEN=... \
PROJECT_ID=... \
npm run smoke:phase2
```

Expected output:

```text
[phase2-smoke] jobId=<uuid>
[phase2-smoke] evidenceId=<uuid>
[phase2-smoke] evidenceHash=0x...
[phase2-smoke] jobHash=0x...
[phase2-smoke] verificationStatus=anchor_not_found
[phase2-smoke] verificationAnchorStatus=not_submitted
[phase2-smoke] export.json.id=<uuid>
[phase2-smoke] export.csv.id=<uuid>
[phase2-smoke] export.pdf.id=<uuid>
```

With live anchoring:

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
SUPABASE_ACCESS_TOKEN=... \
PROJECT_ID=... \
PHASE2_ANCHOR=true \
AVALANCHE_NETWORK=fuji \
npm run smoke:phase2
```

Expected live-anchor fields:

```text
[phase2-smoke] anchorStatus=pending|confirmed|failed
[phase2-smoke] transactionHash=0x...
[phase2-smoke] network=fuji|mainnet
[phase2-smoke] blockNumber=<number>|pending
[phase2-smoke] explorerUrl=https://...
```

## SDK Smoke Command

The repository does not ship a separate published SDK package. The SDK-like smoke path is:

- `scripts/phase2-smoke.mjs`
- `src/lib/api.ts`
- curl examples below

Use the Phase 2 smoke command above as the SDK/API smoke.

If a grant reviewer expects a packaged SDK artifact, mark that as a gap rather than claiming one exists.

## Example Curl Requests

Create a completed smoke job:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/jobs" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "projectId": "'"$PROJECT_ID"'",
    "requestReason": "Phase 2 API smoke",
    "targetType": "api_endpoint",
    "executionLane": "manual",
    "targetScopeSummary": "No raw customer content",
    "status": "completed",
    "validationScore": 1,
    "totalTests": 1,
    "passedTests": 1,
    "failedTests": 0,
    "leakScore": 0
  }'
```

Anchor evidence:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/anchors" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"evidenceId":"EVIDENCE_ID","network":"fuji"}'
```

Verify by public token:

```bash
curl "$SUPABASE_URL/functions/v1/verify-evidence?token=PUBLIC_VERIFY_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Export report:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/reports" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"evidenceId":"EVIDENCE_ID","format":"json"}'
```

Run pipeline:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/pipelines" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"run","pipelineId":"PIPELINE_ID","exportFormats":["json","csv","pdf"]}'
```

Create API integration:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/integrations" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "projectId": "'"$PROJECT_ID"'",
    "name": "OpenAI compatible staging",
    "providerType": "openai_compatible",
    "baseUrl": "https://api.example.com/v1",
    "authType": "bearer",
    "secret": "REDACTED"
  }'
```

## Common Failure Cases

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Missing required env vars` from `smoke:phase2` | Missing Supabase URL, anon key, or access token | Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN` |
| `Authentication required` | Token missing or expired | Sign in again and use a fresh access token |
| `Project membership required` | User lacks membership for `PROJECT_ID` | Add membership through `project-access` or Supabase admin |
| Anchor returns failed | Wallet not funded, wrong contract, wrong network, or RPC issue | Check Edge Function secrets, wallet balance, contract address, network |
| Hardhat rejects Node | Node version below 22.13 | Use Node 22.13+ |
| PDF verification returns mismatch | PDF hash was not committed or wrong file uploaded | Export PDF from the same environment and commit/report hash through UI flow |
| CORS error | Origin not allowed | Check `supabase/functions/_shared/cors.ts` and deployment config |

## Proof Screenshots to Collect

Capture these after a successful reviewer run:

1. Build/test/audit terminal output.
2. `/dashboard/jobs` with created job.
3. `/dashboard/jobs/<jobId>` showing evidence hash, job hash, anchor status, tx hash, block number, explorer link.
4. `/dashboard/evidence/<evidenceId>` showing manifest/report/export controls.
5. `/verify/<public_verification_token>` showing public verification status.
6. Snowtrace transaction page for any live Avalanche tx.
7. `/dashboard/verify` with valid artifact result.
8. `/dashboard/verify` with mismatch result.
9. JSON export file.
10. CSV export file.
11. PDF export file.
12. `/dashboard/pipelines` with a completed run.
13. `/dashboard/settings` showing role/admin configuration with secrets redacted.
14. `GET /functions/v1/verify-evidence?token=...` JSON response.
15. `POST /functions/v1/reports` JSON/CSV/PDF export response.
16. If live anchoring is enabled, `POST /functions/v1/anchors` response.

## Reviewer Account Handling

Do not commit reviewer credentials to repository docs. Provide any temporary reviewer username/password through a secure channel and rotate or delete the account after review.

## Daily Reviewer Anchor Automation

The repository includes a dedicated production reviewer automation command:

```bash
npm run automation:reviewer-anchor
```

It runs the Phase 2 lifecycle as one flow: automation account sign-in, completed smoke job creation, evidence generation, Avalanche anchor submission, verification, and JSON/CSV/PDF exports. The command defaults to the Phase 2 review project and Avalanche mainnet. If local runtime values are absent, it attempts to read the public Supabase config and automation credentials from the linked Netlify production environment.

Required secure runtime values:

```bash
FORG3T_AUTOMATION_EMAIL=...
FORG3T_AUTOMATION_PASSWORD=...
```

Do not pass `SUPABASE_SERVICE_ROLE_KEY`, `AVALANCHE_ANCHOR_PRIVATE_KEY`, or any wallet key to this local automation command. Those belong only in Supabase Edge Function secrets. A failed anchor should be reported as failed or pending with the Edge Function error; never fabricate a transaction hash or Snowtrace link.
