# Non-Claims and Boundaries

This document states what the Avalanche Phase 2 documentation package does not claim.

## No Invented Pilot Completion

The repository does not prove enterprise pilot approval or pilot completion by itself.

Any pilot completion claim requires separate founder evidence such as:

- signed approval,
- customer or partner email,
- pilot evidence memo,
- usage record,
- or another reviewer-acceptable external artifact.

## No Fake Production Transaction

The documentation must not include a fake Avalanche transaction.

A transaction link may be included only if:

1. The transaction was actually submitted.
2. The transaction hash resolves on the relevant Avalanche explorer.
3. The transaction corresponds to the configured evidence anchor contract and evidence/job hashes.
4. The environment and network are clearly stated.

If a fresh review transaction is required, run `npm run smoke:phase2` with `PHASE2_ANCHOR=true` only after confirming the target environment has a funded anchor wallet and deployed contract address.

## No Unsupported Legal Guarantee

Forg3t produces technical evidence records, workflow reports, and blockchain commitments. These artifacts can support audit and compliance review, but they are not legal advice and do not guarantee legal sufficiency.

Legal conclusions must be made by the enterprise, counsel, or compliance officer using the evidence package and any external attestations.

## No Universal Mathematical AI-Unlearning Guarantee

The product supports black-box suppression/unlearning verification for API-accessible systems. It observes behavior, runs validation workflows, records evidence, and commits evidence hashes.

The repository does not claim:

- guaranteed internal model-weight deletion for every model,
- mathematical proof of forgetting across all model architectures,
- permanent suppression under every future prompt or model update,
- access to hidden model internals unless an integration provides it.

White-box unlearning claims require separate integration-specific proof.

## No External Enterprise Pilot Claim Without Founder Evidence

The repository-controlled product implementation is distinct from external business proof.

Do not claim the following as complete unless separately provided:

- enterprise pilot approval,
- customer attestation,
- real customer usage,
- recorded demo video,
- founder sales/procurement material,
- legal sign-off.

## No Secret Disclosure

Docs and screenshots must not expose:

- Supabase service-role keys,
- Avalanche private keys,
- integration API keys,
- customer data,
- raw deletion targets,
- unredacted access tokens,
- reviewer credentials in committed public docs.

Reviewer credentials should be sent through a secure channel and rotated after review.

## Production Deployment Boundary

The repository can describe how to run locally and how to verify staging/production if environment variables are available.

Do not claim a production deployment unless:

- deployment logs are available,
- the live URL is reachable,
- the app is configured with correct Supabase and Avalanche settings,
- and a reviewer can reproduce the route/API behavior.

## Contract Source Verification Boundary

The runtime product can still produce Avalanche transaction hashes and explorer links when anchoring is configured.

Hardhat automatic Snowtrace source verification is not required for runtime anchoring. If a reviewer requires verified contract source on Snowtrace, that is a manual founder/operator action unless the repository reintroduces a verification plugin without audit regressions.

## Recommended Claim Language

Use:

> The repository contains implementation and verification evidence for the Phase 2 code-side milestone areas. Remaining submission items are external proof, human approval, demo capture, reviewer screenshots, or optional manual contract-source verification.

Avoid:

> All enterprise pilots are complete.

Avoid:

> Forg3t legally guarantees AI deletion for every model.

Avoid:

> A live Avalanche transaction exists unless a real explorer link and matching evidence record are supplied.
