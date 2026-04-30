# Compliance Audit Workflow

## Scope

This workflow documents how a deletion, suppression, or unlearning request moves through the product. It does not make unsupported claims that unlearning is legally guaranteed. It documents operational evidence and verifiable commitments.

## Workflow

1. A request enters the system through the dashboard or jobs API.
2. The operator records a sanitized request reason and target scope summary.
3. The job runs or is marked complete once validation inputs are available.
4. Forg3t creates a sanitized evidence bundle.
5. The evidence bundle receives a deterministic SHA-256 hash.
6. The commitment can be anchored on Avalanche.
7. Reports are exported for internal audit, legal review, or external review.
8. Auditors verify the evidence bundle or report through the verification route.

## How Target Scope Is Handled

The system stores summaries rather than raw sensitive payloads whenever possible.

Recommended operator behavior:

- describe the tenant, model, or endpoint scope
- avoid pasting raw prompts or targets
- avoid pasting model outputs into notes

## Validation

Validation data is stored as summaries:

- status
- score
- processing time
- check counts
- high-level integration metadata

The system does not require raw adversarial prompts or output transcripts to generate anchorable commitments.

## Evidence Generation

Evidence generation produces:

- sanitized manifest JSON
- evidence hash
- job hash
- optional PDF report payload
- optional public verification token

## Avalanche Anchoring

Anchoring writes only cryptographic commitments to the contract:

- `jobHash`
- `evidenceHash`

The platform keeps operational metadata off-chain:

- transaction hash
- chain id
- contract address
- block number
- confirmation timestamps

## Auditor Verification

An auditor can:

- use the dashboard verification route with authenticated access
- use a scoped public verification token
- upload an exported evidence bundle or PDF report

The auditor receives:

- hash comparison result
- anchor confirmation result
- transaction visibility
- explorer link

## Exports

Exports are intended for:

- internal audit teams
- compliance review
- legal review
- regulator-ready submission packages

Supported formats in this repo:

- JSON
- CSV
- PDF

Exports include:

- project name
- job id
- evidence id
- target scope summary
- validation status
- anchor status
- evidence hash
- transaction hash
- export timestamp
- export operator

Exports intentionally exclude raw sensitive target content by default.
