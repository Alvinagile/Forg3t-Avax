# Avalanche Phase 2 Evidence Package

This document maps repository-controlled Avalanche Phase 2 milestone areas to product behavior, code evidence, verification steps, proof items, and remaining gaps.

It is intentionally limited to repository evidence. It does not claim enterprise pilot completion, customer attestation, recorded demo completion, legal approval, or production deployment unless the founder supplies separate proof.

## Reviewer Caveat

This package should be read as a code-side evidence map, not as a final business evidence packet. A grant reviewer can use it to locate implementation evidence and reproduce technical flows. Founder-supplied artifacts are still required for any claim about pilots, customers, recorded demos, production operations, or legal acceptance.

## Evidence Sources

- Frontend routes: `src/App.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Jobs.tsx`, `src/pages/JobDetail.tsx`, `src/pages/EvidenceDetail.tsx`, `src/pages/Verify.tsx`, `src/pages/Pipelines.tsx`, `src/pages/Settings.tsx`.
- Client API wrapper: `src/lib/api.ts`.
- Domain helpers and tests: `src/lib/domainUtils.ts`, `src/lib/domainUtils.test.ts`, `shared/workflows.ts`, `shared/workflows.test.ts`.
- Supabase Edge Functions: `supabase/functions/jobs/index.ts`, `supabase/functions/anchors/index.ts`, `supabase/functions/verify-evidence/index.ts`, `supabase/functions/reports/index.ts`, `supabase/functions/pipelines/index.ts`, `supabase/functions/integrations/index.ts`, `supabase/functions/project-access/index.ts`.
- Database migrations: `supabase/migrations/20260430170000_avalanche_build_games.sql`, `supabase/migrations/20260524153640_fix_project_memberships_rls.sql`.
- Contract and scripts: `contracts/contracts/ForgEvidenceAnchor.sol`, `contracts/hardhat.config.ts`, `contracts/scripts/deploy.ts`, `scripts/phase2-smoke.mjs`.
- Existing reviewer docs: `README.md`, `docs/phase2-readiness.md`, `docs/api/evidenceAnchoring.md`, `docs/architecture/evidenceAnchoring.md`, `docs/architecture/verificationFlow.md`, `docs/compliance/auditWorkflow.md`.

## Milestone 1: Evidence Anchoring

| Field | Evidence |
| --- | --- |
| Milestone name | Evidence anchoring from job to evidence hash to Avalanche anchor to verification result |
| What Forg3t built | A job creates a sanitized evidence record with deterministic `evidence_hash` and `job_hash`. The anchor Edge Function can submit the commitment to Avalanche and store transaction metadata. Verification returns anchor status, network, block number, transaction hash, contract address, and explorer URL. |
| Code evidence | `scripts/phase2-smoke.mjs`; `src/lib/api.ts`; `src/lib/domainUtils.ts`; `supabase/functions/jobs/index.ts`; `supabase/functions/anchors/index.ts`; `supabase/functions/_shared/avalanche.ts`; `contracts/contracts/ForgEvidenceAnchor.sol`. |
| Frontend evidence | `src/pages/JobDetail.tsx` shows anchor actions and transaction metadata; `src/pages/EvidenceDetail.tsx` shows evidence details and exports; `src/pages/Verify.tsx` shows verification status. |
| Backend evidence | `POST /functions/v1/jobs`, `POST /functions/v1/anchors`, `GET /functions/v1/anchors`, `GET /functions/v1/verify-evidence`. |
| Database evidence | `evidence_records`, `evidence_anchors`, `unlearning_requests`, `report_exports`, `pipeline_runs`. |
| SDK or API evidence | `docs/api/evidenceAnchoring.md`; `scripts/phase2-smoke.mjs`; curl examples in `docs/phase2-readiness.md`. |
| Verify locally | Run `npm test`, `npm run build`, and `npm run smoke:phase2` with Supabase env vars. Run `cd contracts && npm run compile` with Node 22.13+. |
| Verify in deployed environment | Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`, `PROJECT_ID`. Add `PHASE2_ANCHOR=true` and `AVALANCHE_NETWORK=fuji` or `mainnet` only when the anchor wallet and contract are configured. |
| Reviewer proof items | Job detail screenshot, evidence detail screenshot, public verify screenshot, transaction/explorer screenshot, smoke script output. |
| Remaining gaps | Contract source verification on Snowtrace is manual after the Hardhat 3 migration. |
| Founder Evidence Required | Live transaction proof and explorer screenshot for the grant submission packet if a fresh reviewer run is required. Do not reuse or claim a transaction unless it is actually produced by the configured environment. |

## Milestone 2: Drag-and-Drop Verification

| Field | Evidence |
| --- | --- |
| Milestone name | Auditor verification flow for evidence JSON and PDF where possible |
| What Forg3t built | A verification page that accepts evidence artifacts, computes local hashes, compares against stored evidence/report hashes, and returns states such as valid, mismatch, pending, confirmed, and failed. |
| Code evidence | `src/pages/Verify.tsx`; `src/lib/hash.ts`; `src/lib/domainUtils.ts`; `supabase/functions/verify-evidence/index.ts`. |
| Frontend evidence | `/dashboard/verify`; `/verify/<public_verification_token>`. |
| Backend evidence | `GET /functions/v1/verify-evidence?token=...`; `GET /functions/v1/verify-evidence?evidenceId=...`; `POST /functions/v1/verify-evidence`. |
| Database evidence | `evidence_records.evidence_hash`, `evidence_records.report_hash`, `evidence_records.verification_status`, `evidence_anchors.status`. |
| SDK or API evidence | `docs/api/evidenceAnchoring.md` verification examples. |
| Verify locally | Build app, open `/dashboard/verify`, drop exported JSON/PDF, and compare displayed status. |
| Verify in deployed environment | Use a public verification token and exported artifact from the same environment. |
| Reviewer proof items | Drag-and-drop verification screenshot for a valid artifact and a mismatch artifact. |
| Remaining gaps | PDF verification depends on exported PDF hash being committed through the report flow. |
| Founder Evidence Required | Reviewer-visible screenshot or video capture of the verification flow if required by the grant manager. |

## Milestone 3: Job History and Evidence UX

| Field | Evidence |
| --- | --- |
| Milestone name | Review-ready job list, job detail, evidence detail, transaction visibility, public verify links, report access |
| What Forg3t built | Dashboard views for project jobs, job detail, evidence detail, public verification links, anchor records, report exports, and pipeline summaries. |
| Code evidence | `src/pages/Dashboard.tsx`; `src/pages/Jobs.tsx`; `src/pages/JobDetail.tsx`; `src/pages/EvidenceDetail.tsx`; `src/components/JobsTable.tsx`; `src/components/StatusBadge.tsx`. |
| Frontend evidence | `/dashboard`, `/dashboard/jobs`, `/dashboard/jobs/<jobId>`, `/dashboard/evidence/<evidenceId>`, `/verify/<token>`. |
| Backend evidence | `supabase/functions/jobs/index.ts`; `supabase/functions/reports/index.ts`; `supabase/functions/verify-evidence/index.ts`. |
| Database evidence | `unlearning_requests`, `evidence_records`, `evidence_anchors`, `report_exports`. |
| SDK or API evidence | `src/lib/api.ts` exposes `jobsApi`, `reportsApi`, `anchorsApi`, `verifyApi`. |
| Verify locally | Create a smoke job, open dashboard routes, and inspect evidence/anchor/export sections. |
| Verify in deployed environment | Use the deployed app and a reviewer account with project membership. The repository does not store reviewer credentials. |
| Reviewer proof items | Job list, job detail, evidence detail, public verify page, report export screenshots. |
| Remaining gaps | Reviewer account credentials and project membership must be provided securely outside public docs. |
| Founder Evidence Required | Screenshots from the actual review/staging environment. |

## Milestone 4: Reporting Exports and RBAC

| Field | Evidence |
| --- | --- |
| Milestone name | JSON, CSV, PDF exports and role-based access behavior |
| What Forg3t built | Export endpoints and UI controls for JSON, CSV, and PDF reports. RBAC roles include owner, admin, compliance, auditor, developer, and viewer. |
| Code evidence | `src/pages/JobDetail.tsx`; `src/pages/EvidenceDetail.tsx`; `src/lib/pdfGenerator.ts`; `src/lib/domainUtils.ts`; `src/lib/domainUtils.test.ts`; `supabase/functions/reports/index.ts`; `supabase/functions/_shared/rbac.ts`; `supabase/functions/project-access/index.ts`. |
| Frontend evidence | Export buttons on job/evidence detail pages; role controls in `/dashboard/settings`. |
| Backend evidence | `GET /functions/v1/reports`; `POST /functions/v1/reports`; `POST /functions/v1/project-access`. |
| Database evidence | `project_memberships`, `report_exports`, `evidence_records.report_status`, `evidence_records.report_hash`. |
| SDK or API evidence | `reportsApi.export`, `reportsApi.commitPdfHash`, `projectAccessApi` in `src/lib/api.ts`. |
| Verify locally | Run `npm test`; create a job; export JSON, CSV, and PDF from job or evidence detail. |
| Verify in deployed environment | Use role-specific test users or project memberships and confirm allowed/blocked behavior. |
| Reviewer proof items | Exported JSON file, CSV file, PDF report, admin role screenshot, viewer/developer behavior if available. |
| Remaining gaps | The repository contains role logic and tests, but role-specific reviewer accounts must be prepared for a full manual RBAC demonstration. |
| Founder Evidence Required | Optional screenshots for each role if the grant manager requests manual RBAC proof. |

## Milestone 5: Repeatable Verification Pipelines

| Field | Evidence |
| --- | --- |
| Milestone name | Pipeline run can create multiple jobs and move them through evidence generation, anchoring, verification, and export where configured |
| What Forg3t built | A pipeline UI and Edge Function that can create pipeline runs, derive scoped items, generate jobs and evidence, optionally anchor evidence, and create export records. |
| Code evidence | `src/pages/Pipelines.tsx`; `src/lib/api.ts`; `shared/workflows.ts`; `shared/workflows.test.ts`; `supabase/functions/pipelines/index.ts`. |
| Frontend evidence | `/dashboard/pipelines`; pipeline create and run controls; pipeline run badges. |
| Backend evidence | `GET /functions/v1/pipelines?projectId=...`; `GET /functions/v1/pipelines?pipelineId=...`; `POST /functions/v1/pipelines` with `action=create` or `action=run`. |
| Database evidence | `verification_pipelines`, `pipeline_runs`, `unlearning_requests.pipeline_id`, `evidence_records.pipeline_run_id`, `report_exports`. |
| SDK or API evidence | `pipelinesApi.create`, `pipelinesApi.run`, curl examples in `docs/phase2-readiness.md`. |
| Verify locally | Create a pipeline in the dashboard or call the API, then run it and inspect created jobs/evidence/export records. |
| Verify in deployed environment | Use `POST /functions/v1/pipelines` with a real `pipelineId` and configured auth. Enable anchoring only when the environment has a funded wallet and contract. |
| Reviewer proof items | Pipeline list screenshot, run detail or run output, created job/evidence screenshots, export proof. |
| Remaining gaps | Full live anchoring inside pipeline requires funded anchor wallet and deployed contract configuration in the target environment. |
| Founder Evidence Required | Screenshot of a completed run in the review environment. |

## Milestone 6: API-Based AI Integrations

| Field | Evidence |
| --- | --- |
| Milestone name | OpenAI-compatible and generic HTTP integration lifecycle |
| What Forg3t built | Integration management for OpenAI-compatible and generic HTTP providers, including encrypted secret handling and API examples for project setup through job/evidence retrieval. |
| Code evidence | `src/pages/Settings.tsx`; `supabase/functions/integrations/index.ts`; `supabase/functions/_shared/crypto.ts`; `supabase/functions/_shared/assistantSuppression.ts`; `src/lib/api.ts`; `docs/api/evidenceAnchoring.md`. |
| Frontend evidence | `/dashboard/settings` integration configuration UI. |
| Backend evidence | `GET /functions/v1/integrations`; `POST /functions/v1/integrations`. |
| Database evidence | `integration_configs`, `integration_secrets`, project membership checks. |
| SDK or API evidence | curl examples in `docs/api/evidenceAnchoring.md`; API client abstraction in `src/lib/api.ts`. |
| Verify locally | Configure a local or disposable integration with a non-production endpoint and create a job through the API. |
| Verify in deployed environment | Provide provider credentials through Supabase secrets or the integration UI. Do not include live secrets in screenshots or committed docs. |
| Reviewer proof items | Integration configuration screenshot with secrets redacted, curl request/response, job/evidence result. |
| Remaining gaps | Real provider credentials and any enterprise model endpoint access are external. |
| Founder Evidence Required | Provider credential availability and any partner/customer authorization to test against their endpoint. |

## Milestone 7: Documentation and Reviewer Readiness

| Field | Evidence |
| --- | --- |
| Milestone name | Reviewer-ready documentation and runbooks |
| What Forg3t built | README, readiness docs, architecture docs, compliance docs, API examples, generated grant packet, and this Avalanche documentation package. |
| Code evidence | `README.md`; `docs/phase2-readiness.md`; `docs/api/evidenceAnchoring.md`; `docs/architecture/*`; `docs/compliance/*`; `docs/avalanche/*`. |
| Frontend evidence | Routes listed in `docs/phase2-readiness.md` and this package. |
| Backend evidence | Endpoint inventory in `docs/api/evidenceAnchoring.md` and `docs/avalanche/reviewerRunbook.md`. |
| Database evidence | Migration and table inventory in `docs/avalanche/technicalArchitecture.md`. |
| SDK or API evidence | curl examples and smoke script commands. |
| Verify locally | Run the commands in `docs/avalanche/reviewerRunbook.md`. |
| Verify in deployed environment | Use the same runbook with deployed environment variables. |
| Reviewer proof items | Build/test logs, screenshots, exported artifacts, transaction/explorer proof. |
| Remaining gaps | External founder evidence remains outside the repo. |
| Founder Evidence Required | Pilot evidence memo, customer confirmation, demo video, and screenshots from the final review environment. |

## Final Code-Side Statement

The repository contains implementation and verification evidence for the Phase 2 code-side milestone areas listed above. Remaining submission items are external proof, human approval, demo capture, reviewer screenshots, or optional manual contract-source verification.
