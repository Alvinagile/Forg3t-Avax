# Verification Flow

## Goals

The verification experience is designed for auditors, compliance users, legal reviewers, and third parties who need a clear answer without navigating internal product data.

Supported routes:

- `/dashboard/verify`
- `/verify`
- `/verify/:token`

The public route uses a scoped verification token instead of exposing private tenant data.

## Upload Handling

Supported files:

- JSON evidence bundles
- PDF evidence reports

### JSON bundle flow

1. The browser reads the uploaded JSON bundle.
2. The bundle is parsed safely.
3. The client computes a deterministic SHA-256 hash of the uploaded file.
4. The backend compares the hash against `evidence_hash` or `bundle_hash`.
5. If a matching evidence record is found, the backend checks anchor status through Avalanche RPC.

### PDF flow

1. The browser computes the SHA-256 hash of the uploaded PDF bytes.
2. The backend compares the hash against stored `report_hash` values.
3. If a match exists, the evidence record and anchor record are returned in verification-safe form.

## Verification States

The verification API returns one of the following user-facing states:

- `valid`
- `hash_mismatch`
- `anchor_not_found`
- `anchor_pending`
- `anchor_confirmed`
- `invalid_bundle`
- `unsupported_file`

## Public vs Authenticated Views

### Public verification

Public verification returns only:

- project name
- evidence id
- generated timestamp
- target type
- execution lane
- validation score
- expected hash
- anchor status
- transaction hash
- explorer URL

It does not return:

- job notes
- internal report payloads
- raw tenant content
- project memberships
- integration configuration

### Authenticated verification

Authenticated workspace users can also see:

- manifest payload
- report payload
- scoped verification token

## Backend Trust Boundaries

The backend is responsible for:

- looking up evidence by token, evidence id, or hash
- syncing pending anchor state against Avalanche
- confirming explorer URLs
- keeping unauthenticated responses minimal

The browser is responsible for:

- local file reading
- local SHA-256 computation
- rendering readable metadata
- handling drag-and-drop UX

## UX Notes

- Upload is explicit and user-driven.
- Empty states are safe and non-technical.
- Failure messages avoid secrets and internal stack details.
- Verification emphasizes commitments and state, not legal overclaiming.
