# Evidence Artifact Checklist

This checklist is for the founder before submitting the Avalanche Phase 2 grant evidence package.

Do not mark an item complete unless the artifact exists and can be shared with the reviewer.

## Live Avalanche Proof

- [ ] Live Avalanche transaction link.
- [ ] Explorer screenshot showing transaction hash, network, block number, and status.
- [ ] Contract address screenshot if requested.
- [ ] Public verification page screenshot showing the same transaction metadata.
- [ ] Confirmation that the transaction was produced by the current review/staging/production environment.
- [ ] `POST /functions/v1/anchors` response body, if the transaction was submitted through Forg3t.
- [ ] `GET /functions/v1/verify-evidence?token=...` response body showing anchor status and transaction metadata.

## Product Screenshots

- [ ] Job list screenshot.
- [ ] Job detail screenshot showing:
  - [ ] job id
  - [ ] evidence id
  - [ ] evidence hash
  - [ ] job hash
  - [ ] anchor status
  - [ ] transaction hash
  - [ ] network
  - [ ] block number
  - [ ] explorer link
- [ ] Evidence detail screenshot showing:
  - [ ] manifest
  - [ ] report payload
  - [ ] export controls
  - [ ] public verification link
- [ ] Public verify page screenshot.
- [ ] Drag-and-drop verification screenshot for a valid artifact.
- [ ] Drag-and-drop verification screenshot for a mismatch artifact.
- [ ] Pipeline run screenshot.
- [ ] Admin role/settings screenshot with secrets redacted.
- [ ] Integration settings screenshot with secrets redacted, if API integrations are claimed.
- [ ] Public verify link copied from the evidence/job detail page.

## Exported Artifacts

- [ ] JSON export.
- [ ] CSV export.
- [ ] PDF export.
- [ ] Evidence JSON bundle used for drag-and-drop verification.
- [ ] If PDF verification is claimed, exported PDF with committed `report_hash`.

## Command and Log Artifacts

- [ ] `npm test` output.
- [ ] `npm run lint` output.
- [ ] `npm run build` output.
- [ ] `npm audit` output from `project`.
- [ ] `npm run compile` output from `project/contracts` using Node 22.13+.
- [ ] `npm audit` output from `project/contracts`.
- [ ] `npm run smoke:phase2` output.
- [ ] Anchoring smoke output, if live anchoring is enabled.
- [ ] SDK/API smoke output from `scripts/phase2-smoke.mjs` or equivalent curl calls.

## API and Integration Proof

- [ ] Curl request/response for `POST /functions/v1/jobs`.
- [ ] Curl request/response for `POST /functions/v1/anchors`, if live anchoring is enabled.
- [ ] Curl response for `GET /functions/v1/verify-evidence?token=...`.
- [ ] Curl request/response for JSON/CSV/PDF report export.
- [ ] Curl request/response for pipeline run.
- [ ] Integration configuration screenshot with API secrets redacted.
- [ ] OpenAI-compatible or generic HTTP integration smoke result if claimed.
- [ ] If no external AI provider was used, note that API integration proof is code/API readiness only, not partner endpoint proof.

## RBAC Proof

- [ ] Owner/admin role screenshot.
- [ ] Compliance role behavior screenshot, if available.
- [ ] Auditor role behavior screenshot, if available.
- [ ] Developer role behavior screenshot, if available.
- [ ] Viewer role behavior screenshot, if available.
- [ ] Backend or test output showing role behavior.
- [ ] If role-specific manual screenshots are not available, mark them as Founder Evidence Required rather than complete.

## Founder Evidence Required

These are not produced by the repository and must be supplied separately if the grant submission claims them:

- [ ] Pilot evidence memo.
- [ ] Customer or partner confirmation, if available.
- [ ] Enterprise pilot approval, if available.
- [ ] Real customer usage evidence, if available.
- [ ] Demo video, if available or requested.
- [ ] Founder sales/procurement material, if requested.
- [ ] Written explanation of any reviewer credentials and when they will be rotated.

## Submission Boundary Check

Before submitting, confirm:

- [ ] No fake transaction links are included.
- [ ] No unverified pilot/customer claims are included.
- [ ] No secrets, service-role keys, private keys, or customer data are included.
- [ ] Any screenshots with tokens, API keys, or customer identifiers are redacted.
- [ ] Claims match repository evidence and separately supplied founder evidence.
