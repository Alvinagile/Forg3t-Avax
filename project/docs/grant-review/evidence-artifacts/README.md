# Forg3t Avalanche Phase 2 Evidence Artifacts

Generated: 2026-05-25. Daily reviewer automation proof added: 2026-05-27.

This folder contains reviewer-facing artifacts for the Avalanche Phase 2 code-side evidence package. It uses repository code, live Supabase Edge Function responses, generated exports, and live public verification/explorer screenshots. It does not claim enterprise pilot completion, customer attestation, legal approval, production deployment beyond the verified public routes, or recorded demo completion.

## Key Live Links

- Public verify page: [https://buildgames.forg3t.io/verify/212a028eabcac5e2c3458cc9f219259d](https://buildgames.forg3t.io/verify/212a028eabcac5e2c3458cc9f219259d)
- Public verify API: [https://xewxfsdrtqpthkpbhbzp.supabase.co/functions/v1/verify-evidence?token=212a028eabcac5e2c3458cc9f219259d](https://xewxfsdrtqpthkpbhbzp.supabase.co/functions/v1/verify-evidence?token=212a028eabcac5e2c3458cc9f219259d)
- Snowtrace transaction: [https://snowtrace.io/tx/0x7af8b0376079571f2a4ff46ff76e6cdfb27f710ea4b2434c41bfdf25a167e7be](https://snowtrace.io/tx/0x7af8b0376079571f2a4ff46ff76e6cdfb27f710ea4b2434c41bfdf25a167e7be)
- Snowtrace contract: [https://snowtrace.io/address/0x20E772a60CEE7D8E6706E698B129FD917c3936bf](https://snowtrace.io/address/0x20E772a60CEE7D8E6706E698B129FD917c3936bf)
- Latest daily reviewer automation verify page: [https://buildgames.forg3t.io/verify/561660d24f6634b92387050a7116eb19](https://buildgames.forg3t.io/verify/561660d24f6634b92387050a7116eb19)
- Latest daily reviewer automation transaction: [https://snowtrace.io/tx/0x751fec0d93290cc0bcc25e42735069e88c42dd42c664e6ed064b025c22e1ec8d](https://snowtrace.io/tx/0x751fec0d93290cc0bcc25e42735069e88c42dd42c664e6ed064b025c22e1ec8d)

## Canonical IDs

- Project ID: `0c7643e1-471f-4b04-848c-329c39f77143`
- Job ID: `9a2a77cf-4b09-4f59-be04-c18b08b137bd`
- Evidence ID: `608a427f-25c1-4f43-b3e7-d9a86ff33801`
- Public verify token: `212a028eabcac5e2c3458cc9f219259d`
- Avalanche network: `mainnet`
- Chain ID: `43114`
- Block number: `86276105`
- Contract address: `0x20E772a60CEE7D8E6706E698B129FD917c3936bf`

## Artifact Index

| Checklist item | Status | Primary artifact | Supporting evidence |
| --- | --- | --- | --- |
| Live Avalanche transaction link | Done | `generated-images/01-live-avalanche-transaction.svg` | `screenshots/snowtrace-transaction.png`, `api/anchor-status.json` |
| Explorer screenshot | Done | `screenshots/snowtrace-transaction.png` | `screenshots/snowtrace-contract.png` |
| Job detail evidence | Done | `generated-images/02-job-detail-proof.svg` | `api/job-detail.json` |
| Evidence detail evidence | Done | `generated-images/03-evidence-detail-proof.svg` | `api/authenticated-verify-evidence.json` |
| Public verify page screenshot | Done | `screenshots/public-verify-page.png` | `generated-images/04-public-verify-proof.svg` |
| Drag and drop verification base UI | Done | `screenshots/public-verify-page.png` | `generated-images/05-drag-drop-json-valid.svg` |
| JSON valid verification | Done | `generated-images/05-drag-drop-json-valid.svg` | `exports/forg3t-evidence-bundle.valid.json`, `api/verify-upload-json-valid-response.json` |
| JSON mismatch verification | Done | `generated-images/06-drag-drop-json-mismatch.svg` | `exports/forg3t-evidence-bundle.mismatch.json`, `api/verify-upload-json-mismatch-response.json` |
| PDF verification | Done | `generated-images/07-drag-drop-pdf-valid.svg` | `exports/forg3t-evidence-export.pdf`, `api/verify-upload-pdf-valid-response.json` |
| Unsupported file state | Done | `generated-images/08-drag-drop-unsupported-file.svg` | `api/verify-upload-unsupported-file-response.json` |
| JSON export | Done | `exports/forg3t-evidence-export.json` | `generated-images/09-json-export.svg`, `api/report-export-json-response.json` |
| CSV export | Done | `exports/forg3t-evidence-export.csv` | `generated-images/10-csv-export.svg`, `api/report-export-csv-response.json` |
| PDF export | Done | `exports/forg3t-evidence-export.pdf` | `generated-images/11-pdf-export.svg`, `api/report-pdf-hash-commit.json` |
| Pipeline run screenshot/proof | Done | `generated-images/12-pipeline-run.svg` | `api/pipeline-run.json`, `api/pipeline-detail-with-runs.json` |
| Admin role proof | Done | `generated-images/13-admin-role-proof.svg` | `api/project-access-memberships.json` |
| SDK/API smoke output | Done | `generated-images/14-sdk-smoke-output.svg` | `logs/phase2-smoke.log` |
| Daily reviewer automation anchor | Done | `api/daily-reviewer-anchor-run-20260527.json` | `npm run automation:reviewer-anchor`, Snowtrace tx, public verify route |
| Build, test, audit logs | Done | `generated-images/15-build-test-audit-logs.svg` | `logs/npm-test.log`, `logs/npm-build.log`, `logs/npm-audit.log`, `logs/contracts-compile.log`, `logs/contracts-audit.log` |
| Generic HTTP integration smoke | Done | `generated-images/16-generic-http-integration-smoke.svg` | `api/integration-create-generic-http.json`, `api/integration-test-generic-http.json` |
| Production dashboard bundle check | Resolved | `generated-images/17-production-login-env-risk.svg` | `api/production-bundle-env-check.json` |
| Pilot evidence memo | Founder Evidence Required | `generated-images/18-founder-pilot-evidence-required.svg` | Founder must provide external memo if claiming pilot progress. |
| Customer or partner confirmation | Founder Evidence Required | `generated-images/19-customer-confirmation-required.svg` | Founder must provide external confirmation if available. |
| Recorded demo video | Founder Evidence Required | `generated-images/20-demo-video-required.svg` | Founder must record or provide demo link separately. |

## Commands Used

```powershell
npm test
npm run lint
npm run build
npm audit
cd contracts
npm run compile
npm audit
```

```powershell
npm run smoke:phase2
```

The smoke run in this package used `PHASE2_ANCHOR=false`; the live mainnet anchor proof comes from the existing confirmed transaction above.

## Reviewer Credential Handling

A reviewer account exists for testing, but credentials should be shared outside committed docs or public artifacts. This artifact package intentionally does not include passwords, access tokens, service-role keys, or private keys.

## Production Bundle Check

`api/production-bundle-env-check.json` records the currently fetched production JavaScript bundle after the latest deploy. The bundle contains the public Supabase URL/anon configuration needed by the dashboard and does not contain a service-role-looking JWT string. Keep service-role keys and Avalanche private keys in Supabase/automation secrets only.
