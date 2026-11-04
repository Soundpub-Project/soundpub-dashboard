# Phase 3E Closeout Provider Contract

Date: 2026-10-29. Agent D scope: backend submission/provider contract and provider tests. Synthetic local PostgreSQL only. No production provider, credentials, SSH, shared Supabase mutation, deployment or real money.

## Audit

The Phase 3C submission service had a `providerReady()` prerequisite but no dispatch/status/reconciliation contract. Phase 3E payments already provide durable mock invoices, signed callback verification, permanent callback deduplication, monotonic payment state, refund idempotency and dry-run invoice reconciliation. These existing payment rules remain authoritative.

`paymentSubmissionDependency` requires PAID plus matching persisted release pricing, mock provider state, charge/effects, finance ledger and audit evidence. Missing or refunded payment and reconciliation quarantine fail closed. Callback payment confirmation never updates release lifecycle. Existing payout mock settlement requires backend-only capability and synthetic evidence; this adapter supplies no payout settlement evidence and does not change payout behavior.

## Submission contract

`backend/src/submissions/provider.ts` exports `SubmissionProvider`, `ProviderSubmission` and `MockSubmissionProvider`. Operations:

- `providerReady(context)`: simulator availability only; release metadata, ownership, media and payment remain separate prerequisites.
- `createSubmission(context)`: create or replay ACCEPTED simulator receipt inside caller transaction.
- `getSubmissionStatus(db, releaseId, version)`: retrieve durable simulator receipt; malformed identity rejects, duplicate or invalid receipts conflict.
- `reconcileSubmission(db, releaseId, version, local)`: read-only classification, no repair or release activation.

`cancelSubmission()` is omitted: no submission cancellation exists in current product service/routes. Payout cancellation and release archive are separate operations. Add submission cancellation only with an approved product lifecycle and provider semantics.

Main composition now explicitly passes `provider: new MockSubmissionProvider()` alongside actual media readiness and `paymentSubmissionDependency` to `createSubmissionService`. Backend configuration rejects production/staging and remote targets, so this remains local synthetic behavior. Readiness-only provider doubles now fail closed with `PROVIDER_UNAVAILABLE`; successful submission requires `createSubmission()` and an ACCEPTED reference.

## Transactions and idempotency

Service authorizes current persisted actor/ownership, locks release and checks optimistic version plus all readiness prerequisites before invoking provider creation. Only an ACCEPTED receipt with a reference permits `pending_paid` or `revision_submitted`. Neither callback nor mock provider can activate release.

Business identity is `mock-submission:<release UUID>:<pre-submit release version>`. Different HTTP request IDs do not alter identity. Release version represents a distinct revision; a rejected release resubmission uses its newer version. PostgreSQL advisory transaction lock serializes same identity. Existing `integration_effects` unique key permanently claims identity; existing append-only runtime `audit_logs` stores simulator receipt. No migration, expiring receipt or process-local cache is required. A fresh adapter instance returns the same receipt. Claim without readable receipt fails closed.

Provider receipt, integration claim, release state and `release.submitted` audit commit together. Release audit includes `providerSubmission` reference/status for later comparison. Failure rolls back all changes. HTTP retry with stale release version returns CONFLICT; it creates no second provider submission. Adapter-level exact replay returns original receipt.

This atomicity is specific to a local simulator on the caller's PostgreSQL transaction. A real provider requires durable outbox dispatch, persisted attempts and independent remote evidence before integration; it cannot inherit this transaction guarantee.

## Dry-run reconciliation

| Local evidence | Simulator evidence | Classification | Reconciled |
| --- | --- | --- | --- |
| Same reference, ACCEPTED | ACCEPTED | MATCHED | true |
| PENDING with same reference, or absent local receipt | ACCEPTED | PROVIDER_AHEAD | false |
| ACCEPTED | Missing | MANUAL_REVIEW | false |
| Missing | Missing | MANUAL_REVIEW | false |
| Unknown status or conflicting reference | Any | MANUAL_REVIEW | false |
| Any | Duplicate/invalid receipt, unknown status or lookup failure | MANUAL_REVIEW | false |

Every result includes `mode: DRY_RUN`. Classification never updates provider evidence, local state or finance. Simulator ACCEPTED proves submission acceptance within synthetic scope only; it is neither distribution activation nor financial settlement proof. Local PAID alone remains insufficient settlement evidence.

## Validation

Run from `backend`: `npx tsx --test test/submission-provider.test.ts test/submissions.test.ts test/payments.test.ts`, followed by `npm run typecheck`.

Executed result: **4 passed, 0 failed, 0 skipped**. Typecheck: **PASS**. Disposable databases removed by test cleanup.

Provider-specific test uses disposable local Docker Desktop PostgreSQL 17 and restricted `soundpub_app`. Checks payment/media blocking, no payment-only activation, provider failure then successful retry, unknown response denial, audit failure rollback of provider claim/receipt, concurrent duplicate requests, durable replay after adapter restart, persisted local provider reference, all reconciliation rows above, malformed identity and duplicate receipt quarantine. Existing submission suite checks authorization/revocation, optimistic conflicts and revision transition. Existing payment suite checks signed callback lifecycle, replay/refund races, rollback and payment readiness.

Agent result: minimum mock contract implemented and explicitly wired into local-only backend composition. Browser acceptance is recorded in `PHASE3E_CLOSEOUT_BROWSER_MATRIX.md`; whole Phase 3E PASS is not claimed here. Historical provider evidence remains a separate provenance gate.



