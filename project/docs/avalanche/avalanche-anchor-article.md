# Forg3t Protocol and Avalanche Evidence Anchoring

## A verifiable control plane for AI unlearning evidence

AI systems are increasingly expected to support deletion, suppression, retention, and compliance workflows that are explainable to people outside the engineering team. A company may need to prove that a user deletion request was processed, that a restricted prompt or dataset reference was suppressed, that an API-based AI integration was tested after an update, or that a compliance team reviewed a specific operational outcome. The core challenge is not only running the workflow. The harder problem is preserving a reliable, privacy-safe, third-party-verifiable record of what happened.

Forg3t Protocol is built around that problem. It is an evidence control plane for AI unlearning and suppression workflows. In practical terms, Forg3t lets a project create jobs, generate sanitized evidence records, anchor cryptographic commitments to Avalanche, verify the evidence later, and export reports in formats that auditors and compliance teams can use. The protocol does not put private user content or model outputs on-chain. Instead, it turns each completed job into deterministic hashes and anchors those hashes as immutable commitments. The complete evidence bundle remains off-chain in the application and database layer, where access control, redaction, exports, and privacy boundaries can be enforced.

This architecture gives both sides of an AI compliance review something useful. Internal operators get a dashboard for jobs, evidence, pipeline runs, integrations, reports, and project roles. External reviewers get a scoped verification route, transaction metadata, block information, public verification links, and downloadable evidence exports. The result is a bridge between operational AI workflows and public cryptographic accountability.

## Why Forg3t needs anchoring at all

Traditional compliance logs are useful, but they usually depend on the system owner asking the reviewer to trust the same database that produced the evidence. If the database record can be edited later without an external trace, the reviewer has to rely on organizational trust rather than technical proof. Blockchain anchoring changes that trust model. It does not make the off-chain workflow true by itself, but it makes the existence and integrity of a specific evidence commitment independently checkable.

Forg3t uses the following pattern:

1. A job is created for an AI unlearning, suppression, verification, or integration workflow.
2. The backend creates a sanitized evidence record for that job.
3. The system computes deterministic commitments such as `jobHash` and `evidenceHash`.
4. Only those hashes are submitted to the Avalanche anchor contract.
5. The application stores the transaction hash, network, chain id, block number, contract address, and anchor status.
6. A reviewer can later compare the evidence hash in Forg3t with the immutable commitment on Avalanche.

This design avoids the most common mistake in compliance-oriented blockchain systems: over-publishing. Forg3t does not use Avalanche as a document store. Avalanche is used as a commitment layer. The evidence bundle, report payloads, RBAC records, and exports remain off-chain. The chain receives only the minimum cryptographic material required to prove that a particular evidence state existed at a particular point in time.

## Why Avalanche

Avalanche is a strong fit for Forg3t because the protocol needs public verifiability without forcing the product team to abandon familiar EVM tooling. Forg3t anchors evidence on Avalanche C-Chain, which gives the project a production blockchain environment compatible with Solidity contracts, standard wallet flows, and EVM libraries. That matters because evidence anchoring is not the whole product; it is one security-critical layer inside a broader React, Supabase, Edge Function, and API integration stack. Using an EVM-compatible chain lets the system integrate anchoring without turning the rest of the product into a blockchain-first application.

Avalanche also aligns with the expected usage pattern. Forg3t evidence anchoring is not a speculative token workflow and it is not a high-frequency consumer payment flow. It is a compliance infrastructure workflow. The system needs reasonably fast confirmation, predictable transaction metadata, public explorer links, and a credible chain for third-party reviewers. A reviewer should be able to open a public transaction page, confirm that the transaction exists on mainnet, inspect the block number and contract address, and compare that public record with the evidence page inside Forg3t.

The choice of Avalanche also keeps future options open. Because the anchor contract is Solidity-based, Forg3t can continue to improve the smart contract and backend while staying compatible with common EVM security review patterns. Because the application stores network and chain metadata in the evidence anchor record, the system can support Fuji testnet for development and Avalanche mainnet for production-grade review workflows. This separation is important: testnet anchoring is useful during engineering, while mainnet anchoring is the defensible artifact for grant review, compliance review, or auditor demonstration.

## The technical architecture

Forg3t is organized as a multi-project evidence control plane. The frontend is a React dashboard. Supabase Postgres stores projects, memberships, jobs, evidence records, anchor records, report exports, integrations, pipelines, and pipeline runs. Supabase Edge Functions handle privileged backend actions such as job creation, evidence generation, anchoring, verification, report export, integration configuration, and role-based project access.

The key runtime components are:

- `unlearning_requests`: the primary job table.
- `evidence_records`: the sanitized evidence manifest and deterministic hashes.
- `evidence_anchors`: Avalanche transaction metadata and anchor status.
- `report_exports`: JSON, CSV, and PDF exports.
- `verification_pipelines`: reusable verification pipeline definitions.
- `pipeline_runs`: execution records for repeatable workflows.
- `project_memberships`: role assignments for owner, admin, compliance, auditor, developer, and viewer.
- Supabase Edge Function `jobs`: creates and reads jobs and evidence shells.
- Supabase Edge Function `anchors`: submits evidence hashes to Avalanche and stores transaction metadata.
- Supabase Edge Function `verify-evidence`: verifies evidence by id, public token, uploaded artifact hash, or transaction metadata.
- Supabase Edge Function `reports`: generates and stores report exports.
- Smart contract `ForgEvidenceAnchor.sol`: the on-chain commitment registry.

The smart contract is intentionally small. Its core write method is:

```solidity
function submitEvidence(bytes32 jobId, bytes32 artifactHash) external;
```

In the Forg3t flow, `jobId` is the deterministic job commitment and `artifactHash` is the deterministic evidence commitment. The contract rejects zero values and rejects duplicate submissions for the same job commitment. Once submitted, a record is immutable. The contract stores the artifact hash, the submitting wallet, and the block timestamp. It emits an `EvidenceSubmitted` event that can be indexed by explorers and downstream tools.

The backend submits the transaction through a server-side Avalanche signer. The private key is not exposed to the browser and is not required by local reviewer scripts. The Edge Function environment controls the network, RPC URL, chain id, contract address, private key, and required confirmations. The frontend and automation scripts only call the API. This separation keeps wallet material in the server-side trust boundary while still making the final transaction public and reviewable.

## What gets anchored, and what does not

Forg3t's evidence model is designed around privacy-preserving verification. The evidence bundle can describe the job, the project, the target type, the execution lane, validation results, integration metadata, privacy notes, and reportable status. However, the bundle intentionally excludes sensitive raw material.

Forg3t should not anchor:

- raw customer data
- raw prompts
- sensitive target text
- model outputs
- API keys
- integration secrets
- report body text

Forg3t does anchor:

- a deterministic job commitment
- a deterministic evidence commitment

Forg3t stores off-chain:

- the sanitized evidence manifest
- report payloads
- public verification token
- role and project metadata
- transaction hash
- network and chain id
- block number
- contract address
- confirmation status
- JSON, CSV, and PDF export records

This is the core privacy tradeoff. Reviewers can verify that the evidence they are looking at matches a public commitment, but the public chain does not reveal the content of the evidence. That is the right balance for regulated AI workflows, where auditability matters but data minimization is still mandatory.

## Reviewer and auditor experience

The reviewer experience is designed to be simple. A reviewer can sign in to the dashboard, open job history, inspect a job detail page, view the evidence detail page, export reports, and follow a public verification link. The job and evidence pages show evidence hash, job hash, public verify route, anchor status, network, block number, transaction hash, and explorer link.

The public verification route is important because not every third party should need full dashboard access. A scoped token can expose only the minimum verification metadata needed for a reviewer to confirm the anchor state. This allows a project to share a proof link without granting tenant-wide database visibility.

Forg3t also supports drag-and-drop verification for evidence artifacts. A reviewer can upload a supported JSON bundle or PDF report. The browser computes a local hash and sends verification-safe metadata to the backend. The backend can return valid, mismatch, pending, confirmed, failed, or invalid states depending on the artifact and anchor data. This makes the verification experience practical for auditors who receive exports outside the dashboard.

The daily reviewer automation follows the same lifecycle. It signs in with a dedicated account, creates a completed smoke job, generates evidence, submits the evidence hash to Avalanche mainnet, verifies the result, and creates JSON, CSV, and PDF exports. The automation prints the job id, evidence id, evidence hash, job hash, anchor status, transaction hash, network, block number, explorer URL, public verify route, and export ids. It is deliberately configured to fail rather than fabricate a transaction if the Edge Function wallet, contract address, or network settings are missing.

## Repeatable verification pipelines

One-off evidence is useful, but regulated workflows often need repetition. Forg3t includes verification pipelines so teams can define repeatable workflows across multiple unlearning jobs. A pipeline run can expand scoped items into jobs, generate evidence records, optionally submit anchors, verify outcomes, and create report exports. This matters for organizations that need scheduled checks, regression-style suppression verification, or repeated evidence packages after AI system changes.

The pipeline model is also useful for API-based AI systems. Many teams do not control model internals directly. They interact with OpenAI-compatible APIs, hosted assistants, or generic HTTP services. Forg3t's integration layer supports provider configuration, encrypted secret storage, and backend-only secret access. This lets a project connect external AI systems to the evidence lifecycle without exposing provider credentials to the frontend.

## Security and governance model

Forg3t uses role-based access to separate operational capabilities. Owners and admins manage projects and memberships. Developers create jobs and manage technical integrations. Compliance users review evidence and exports. Auditors and viewers have restricted read and verification behavior. Backend functions enforce membership checks, and database row-level security provides another boundary around project data.

The anchoring model depends on a few security assumptions:

- service role credentials are available only to backend functions or trusted automation contexts
- Avalanche private keys remain in Edge Function secrets
- evidence manifests are sanitized before hashing
- public verification tokens are scoped
- operators avoid placing sensitive content in free-text fields
- transaction links are shown only when real transactions exist

These assumptions are practical and explicit. They make Forg3t suitable for technical review because the system can explain what it proves and what it does not prove. A blockchain anchor proves that a commitment existed on-chain. It does not independently prove that a customer approved a pilot, that a model's internal weights were changed, or that a provider performed internal deletion unless that provider supplies verifiable evidence. Forg3t is strongest when used as a control plane that collects, sanitizes, anchors, and verifies evidence across these workflows.

## Where the system goes next

The next stage for Forg3t is to make evidence verification more automated, more composable, and easier to integrate into enterprise AI operations.

First, the protocol can expand pipeline automation. The current model already supports repeatable runs, generated jobs, evidence creation, optional anchoring, verification, and exports. Future work should make scheduled pipelines more configurable, add richer run diffing, and support policy-based triggers such as "anchor every completed compliance job" or "export a PDF packet when all checks pass."

Second, Forg3t can deepen third-party verification. Public verification pages can become richer without exposing private data: contract readbacks, event decoding, bundle schema validation, PDF hash commitment checks, and signed verification summaries can all improve auditor confidence. A future verifier could compare the off-chain evidence bundle, the report hash, the public token, and the on-chain commitment in one guided flow.

Third, the integration layer can expand. Teams increasingly use API-based AI systems rather than self-hosted models. Forg3t should continue improving OpenAI-compatible integrations, generic HTTP adapters, assistant/thread suppression checks, and SDK-like developer flows. A published SDK could eventually provide typed clients for job creation, evidence retrieval, anchoring, verification, and export download.

Fourth, the smart contract layer can evolve carefully. The current `ForgEvidenceAnchor` contract is intentionally minimal and immutable. Future versions could add optional validator attestations, batch anchoring, richer event schemas, or organization-level registries. These should be designed without compromising the current privacy model. The chain should still store commitments, not sensitive evidence.

Finally, Forg3t can improve compliance packaging. Grant reviewers, auditors, and enterprise compliance teams need clear evidence bundles: architecture docs, command logs, transaction links, screenshots, exports, role matrices, and known limitations. The better Forg3t packages those artifacts, the easier it becomes to evaluate the system without relying on informal founder explanations.

## Conclusion

Forg3t Protocol uses Avalanche as a public commitment layer for AI unlearning and suppression evidence. The product generates sanitized evidence off-chain, anchors deterministic commitments on Avalanche C-Chain, stores transaction metadata in its evidence database, and exposes verification through dashboards, public links, drag-and-drop checks, exports, and automation scripts.

The important design choice is restraint. Forg3t does not put private evidence on-chain. It does not claim that a hash alone proves every operational fact. Instead, it uses Avalanche to make evidence tamper-evident and independently reviewable while preserving the privacy and access-control requirements of enterprise AI workflows. That balance is what makes the Avalanche anchor system useful: it turns AI compliance from a purely internal assertion into a cryptographically grounded review process.
