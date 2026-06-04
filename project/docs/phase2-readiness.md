# Avalanche Phase 2 Evidence Readiness

This checklist is for reviewers and operators validating the code-side Phase 2 milestones. It does not claim enterprise pilot completion or production deployment by itself.

## Local build and unit checks

```bash
cd project
npm install
npm test
npm run build

cd contracts
npm install
npm run compile
```

## Required runtime environment

Frontend:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_AVALANCHE_DEFAULT_NETWORK=fuji
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
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
SUPABASE_ACCESS_TOKEN=... \
PROJECT_ID=... \
npm run smoke:phase2
```

To submit a real Avalanche transaction, add:

```bash
PHASE2_ANCHOR=true AVALANCHE_NETWORK=fuji npm run smoke:phase2
```

Do not set `PHASE2_ANCHOR=true` unless the Edge Function has a funded anchor wallet and a deployed contract address. The script prints job id, evidence id, evidence hash, job hash, verification state, export ids, and transaction fields when anchoring is enabled.

## Daily reviewer automation

Use this for the buildgames production reviewer flow. It signs in with a dedicated automation user, creates a completed smoke job, creates evidence, submits the evidence hash to the Avalanche anchor Edge Function, verifies the result, and creates JSON/CSV/PDF report exports.

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
PROJECT_ID=0c7643e1-471f-4b04-848c-329c39f77143 \
FORG3T_AUTOMATION_EMAIL=... \
FORG3T_AUTOMATION_PASSWORD=... \
AVALANCHE_NETWORK=mainnet \
npm run automation:reviewer-anchor
```

The local automation command must not receive `SUPABASE_SERVICE_ROLE_KEY` or any Avalanche private key. Avalanche private key, RPC URL, chain id, contract address, and confirmation settings belong in Supabase Edge Function secrets. If those secrets are missing or the wallet is unfunded, the run should fail with the Edge Function error instead of fabricating a transaction link.

If local env vars are not provided, `automation:reviewer-anchor` attempts to read `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `PROJECT_ID`, `FORG3T_REVIEW_PROJECT_ID`, `FORG3T_AUTOMATION_EMAIL`, `FORG3T_AUTOMATION_PASSWORD`, and `AVALANCHE_NETWORK` from the linked Netlify production environment. Keep these non-`VITE_` credentials scoped to trusted automation/build environments only; they are not exposed to the browser unless renamed with a public prefix.

Create or refresh the reviewer and automation users with the service-role-only bootstrap command:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
PROJECT_ID=0c7643e1-471f-4b04-848c-329c39f77143 \
FORG3T_REVIEWER_EMAIL=grant-reviewer@forg3t.io \
FORG3T_REVIEWER_PASSWORD=... \
FORG3T_REVIEWER_ROLE=auditor \
FORG3T_AUTOMATION_EMAIL=... \
FORG3T_AUTOMATION_PASSWORD=... \
FORG3T_AUTOMATION_ROLE=developer \
npm run bootstrap:reviewer
```

Share the reviewer password with Avalanche over a secure channel only. Do not put reviewer or automation passwords in generated PDFs, screenshots, commits, or support tickets.

## Reviewer routes to capture

- `/dashboard/jobs`: job history filters, anchor status, tx column.
- `/dashboard/jobs/<jobId>`: evidence hash, job hash, public verify link, Avalanche status, network, block number, tx hash, explorer link, JSON/CSV/PDF export buttons.
- `/dashboard/evidence/<evidenceId>`: manifest, report payload, commitments, scoped verify route, exports, Avalanche record.
- `/dashboard/verify`: drag-and-drop JSON/PDF verification.
- `/verify/<public_verification_token>`: public scoped auditor verification.
- `/dashboard/pipelines`: create and run repeatable verification pipelines.

## API lifecycle curl examples

Create a completed smoke job and evidence shell:

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

Anchor ready evidence:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/anchors" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"evidenceId":"EVIDENCE_ID","network":"fuji"}'
```

Verify evidence by id or public token:

```bash
curl "$SUPABASE_URL/functions/v1/verify-evidence?evidenceId=EVIDENCE_ID" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY"

curl "$SUPABASE_URL/functions/v1/verify-evidence?token=PUBLIC_VERIFY_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Run a repeatable pipeline. By default, pipeline runs create evidence-ready completed jobs and JSON exports. Live anchoring only happens when the pipeline has `evidenceConfig.anchorOnRun=true` or the request explicitly includes `"anchor": true`.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/pipelines" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"run","pipelineId":"PIPELINE_ID","exportFormats":["json","csv","pdf"]}'
```

Configure an API-based AI integration:

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
    "baseUrl": "https://api.openai.com/v1",
    "authType": "bearer",
    "secret": "'"$OPENAI_API_KEY"'",
    "metadata": { "assistantId": "asst_..." }
  }'
```

## Expected smoke output

Without live anchoring:

```text
jobId=<uuid>
evidenceId=<uuid>
evidenceHash=0x...
jobHash=0x...
verificationStatus=anchor_not_found
verificationAnchorStatus=not_submitted
export.json.id=<uuid>
export.csv.id=<uuid>
export.pdf.id=<uuid>
```

With live anchoring:

```text
anchorStatus=pending|confirmed|failed
transactionHash=0x...
network=fuji|mainnet
blockNumber=<number>|pending
explorerUrl=https://...
verificationStatus=anchor_pending|anchor_confirmed|valid|anchor_failed
```

## Evidence package files

- `README.md`
- `project/docs/architecture/evidenceAnchoring.md`
- `project/docs/architecture/verificationFlow.md`
- `project/docs/api/evidenceAnchoring.md`
- `project/docs/compliance/auditWorkflow.md`
- `project/docs/phase2-readiness.md`
- `project/contracts/contracts/ForgEvidenceAnchor.sol`
- `project/supabase/migrations/20260430170000_avalanche_build_games.sql`
- `project/supabase/functions/anchors/index.ts`
- `project/supabase/functions/verify-evidence/index.ts`
- `project/supabase/functions/jobs/index.ts`
- `project/supabase/functions/pipelines/index.ts`
- `project/supabase/functions/reports/index.ts`
- `project/supabase/functions/integrations/index.ts`
- Smoke output and exported evidence JSON/CSV/PDF from the reviewer run.

## Blocked outside repository

- Real enterprise pilot approval or customer attestation.
- Recorded demo videos.
- Mainnet transaction proof, unless the funded anchor wallet and production contract are available.
- Production deployment claims, unless deployment logs and live URLs are provided.
