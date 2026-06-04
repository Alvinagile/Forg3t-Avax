# API and Environment Guide

## Environment Variables

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AVALANCHE_DEFAULT_NETWORK` optional, `fuji` or `mainnet`

Supabase Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FORG3T_SECRET_ENCRYPTION_KEY`
- `AVALANCHE_ANCHOR_PRIVATE_KEY`
- `AVALANCHE_ANCHOR_NETWORK`
- `AVALANCHE_FUJI_RPC_URL`
- `AVALANCHE_MAINNET_RPC_URL`
- `AVALANCHE_FUJI_CHAIN_ID`
- `AVALANCHE_MAINNET_CHAIN_ID`
- `AVALANCHE_FUJI_CONTRACT_ADDRESS`
- `AVALANCHE_MAINNET_CONTRACT_ADDRESS`
- `AVALANCHE_CONFIRMATIONS_REQUIRED`
- `PINATA_JWT` optional, only if IPFS upload is still used

## Function Endpoints

Supabase Edge Functions expose the equivalent backend API surface used by the product:

- `POST /functions/v1/jobs`
- `GET /functions/v1/jobs?projectId=...`
- `GET /functions/v1/jobs?jobId=...`
- `POST /functions/v1/anchors`
- `GET /functions/v1/anchors?evidenceId=...`
- `GET /functions/v1/anchors?anchorId=...`
- `POST /functions/v1/verify-evidence`
- `GET /functions/v1/verify-evidence?evidenceId=...`
- `GET /functions/v1/verify-evidence?token=...`
- `GET /functions/v1/reports?projectId=...`
- `GET /functions/v1/reports?jobId=...`
- `GET /functions/v1/reports?evidenceId=...`
- `POST /functions/v1/reports`
- `GET /functions/v1/pipelines?projectId=...`
- `GET /functions/v1/pipelines?pipelineId=...`
- `POST /functions/v1/pipelines`
- `GET /functions/v1/integrations?projectId=...`
- `GET /functions/v1/integrations?integrationId=...`
- `POST /functions/v1/integrations`

## Create Job Example

```bash
curl -X POST "$SUPABASE_URL/functions/v1/jobs" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "projectId": "PROJECT_ID",
    "requestReason": "GDPR deletion workflow",
    "targetScopeSummary": "Customer segment summary only, no raw content",
    "targetType": "api_endpoint",
    "executionLane": "api_endpoint",
    "validationScore": 0.94,
    "processingTimeSeconds": 180,
    "status": "completed"
  }'
```

## Create Anchor Example

```bash
curl -X POST "$SUPABASE_URL/functions/v1/anchors" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "evidenceId": "EVIDENCE_ID",
    "network": "fuji"
  }'
```

## Get Anchor Status Example

```bash
curl "$SUPABASE_URL/functions/v1/anchors?evidenceId=EVIDENCE_ID" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Verify Uploaded Evidence Example

```bash
curl -X POST "$SUPABASE_URL/functions/v1/verify-evidence" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "artifactType": "json",
    "localHash": "0x...",
    "verificationToken": "PUBLIC_VERIFY_TOKEN"
  }'
```

## Export Report Example

```bash
curl -X POST "$SUPABASE_URL/functions/v1/reports" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "JOB_ID",
    "format": "csv"
  }'
```

## Create Pipeline Example

```bash
curl -X POST "$SUPABASE_URL/functions/v1/pipelines" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "projectId": "PROJECT_ID",
    "name": "Quarterly suppression review",
    "description": "Reusable review pipeline",
    "targetScope": {
      "summary": "Project-wide suppression review"
    },
    "validationConfig": {
      "reviewMode": "manual"
    },
    "evidenceConfig": {
      "artifact": "sanitized_bundle"
    },
    "anchorRequired": true,
    "exportRequired": true,
    "triggerMode": "manual"
  }'
```

## Create Integration Example

```bash
curl -X POST "$SUPABASE_URL/functions/v1/integrations" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "projectId": "PROJECT_ID",
    "name": "Hosted endpoint",
    "providerType": "openai_compatible",
    "baseUrl": "https://api.example.com",
    "modelIdentifier": "gpt-4.1-compatible",
    "authType": "bearer",
    "secret": "REDACTED"
  }'
```

## SDK Notes

This repo does not currently ship a standalone SDK package. The dashboard uses `src/lib/api.ts` as the client abstraction for:

- `createJob`
- `getJob`
- `listJobs`
- `anchorEvidence`
- `verifyEvidence`
- `createPipeline`
- `runPipeline`
