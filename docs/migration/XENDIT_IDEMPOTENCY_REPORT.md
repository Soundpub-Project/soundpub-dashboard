# Phase 1C Xendit Idempotency Report

**Gate: BLOCKED. Webhook regression: 41 PASS / 0 FAIL. Invoice creation regression: 1 PASS / 2 FAIL.**

Observed 2026-10-27, Asia/Bangkok. Prior evidence remains in `PHASE1B_FINANCIAL_PAYMENT_REPORT.md`; its 23-case baseline was 16 PASS / 7 FAIL. This report does not certify Phase 2 readiness.

## Changes and seven original failures

| Original failure | Root-cause fix |
| --- | --- |
| Release and copyright missing amount/currency (2) | Require typed invoice ID, status, valid decimal amount and three-letter uppercase currency before DB access. Compare canonical decimal strings, without Number equality. |
| Release and copyright parent failure after payment commit (2) | Paid replays continue parent recovery; compare-and-set parent only from awaiting_payment. They cannot rewind approved/active/reviewed parents. |
| Release and copyright refunded then PAID resurrection (2) | Only pending payments can transition; incompatible terminal deliveries are controlled no-ops. |
| Release notification failure ignored (1) | Return retryable 500. Derive notification UUID from payment ID, recipient and status; use primary-key conflict-ignore upserts. Replays repair missing notifications without creating duplicates. |

CAS losers return 503 so the provider can retry against committed state. This intentionally changes the original concurrency oracle from all responses 200 to responses 200/503 followed by a successful retry and exactly one payment transition. Notification failure now returns 500 rather than acknowledging unfinished work with 200. These are strengthened recovery contracts, not discarded failures.

Admin recipients are deduplicated. Notification recipient lookup and email invocation errors return 500. Existing user-email idempotency key is preserved; legacy Resend calls now include a stable idempotency header and check HTTP success. Expired/failed notification writes also recover on retry. Full callback-body and Resend-response logging are removed. No balance mutation is added.

## Runnable verification

`node scripts/xendit-idempotency.test.cjs`: **41 PASS / 0 FAIL**, exit 0. Node stdlib and installed TypeScript execute the actual handler with synthetic DB/environment/provider adapters; network fetch throws. No production identities, amounts or callback tokens are used.

Coverage includes all original 23 scenarios plus terminal ordering, unknown invoices, preservation of reviewed parents, decimal precision beyond Number integer accuracy, unsupported statuses, repeated notification deduplication, email/recipient lookup recovery, expiry notification recovery and malformed amounts. Same event once, twice and ten times settles once in each payment domain. Concurrent fixtures exercise CAS and retry, not real PostgreSQL transaction scheduling.

`npx eslint supabase/functions/xendit-webhook/index.ts`: **0 errors / 0 warnings**, exit 0. Seven pre-existing explicit-any errors in the changed file were removed with scoped types. `git diff --check` passes.

Re-executed the original invoice-create fixture embedded in `PHASE1B_FINANCIAL_PAYMENT_REPORT.md`: **1 PASS / 2 FAIL**, exit 1. Successful sequential copyright invoice reuse passes. Provider success followed by DB-save failure and concurrent creation still create two invoices. Neither invoice-creation handler was changed. No unverified assumption about Xendit idempotency support was substituted for durable creation/reconciliation.

## Deployment evidence and incident lock

Before upload, inspected Compose functions bind mapping from `/data/supabase/instances/supabase-01/config`: remote source `/data/supabase/instances/supabase-01/config/volumes/functions` mounts at `/home/deno/functions`.

Uploaded only the webhook source using scp to `/tmp/soundpub-phase1c-agentf-webhook/index.ts`. Source-only rollback copy: `/tmp/soundpub-phase1c-agentf-webhook/index.before.ts`. No environment/configuration/secrets files were copied. Bundled staged source successfully with installed `edge-runtime bundle --entrypoint /tmp/phase1c-agentf-webhook.ts --output /tmp/phase1c-agentf-webhook.eszip --timeout 30` inside the functions container. This verifies bundling, not TypeScript semantic checking or provider behavior.

Installed source and ran `docker compose restart functions`. Deployed raw SHA-256: `39fa53bb922f64be772b47f77d9a2891fe5cbe2fe8bd1c8284eb875bf910acbb`, equal to local source at deployment. Container subsequently healthy. Origin OPTIONS `/functions/v1/xendit-webhook` returned 200; OPTIONS exits before authentication and settlement. No POST or real callback was sent.

Coordinator subsequently stated production deployment is locked by the credential incident. Deployment above had already occurred before that notice. No further production changes occurred after the lock. Subsequent local type-only lint edits are **not deployed**; deployed source is therefore not byte-identical to final workspace source. Coordinator must include the earlier functions restart in incident/change review and release the lock before any further deployment or rollback. Rollback, if authorized, restores only the source rollback copy to the webhook mount and restarts functions from the Compose directory.

## Remaining blockers

- Invoice creation lacks durable attempt identity/claim and provider-success/save-failure reconciliation; both failing creation scenarios remain open. Release creation has the same timestamp-ID/save-after-provider pattern.
- Settlement spans separate requests. Retry repairs observed failures, but there is no atomic transaction or durable recovery/outbox scan after retries stop. Missing/deleted parent rows and interleaving refunds need real isolated DB coverage.
- Late PAID after expired/failed/refunded/cancelled is ignored, preserving terminal state. No business-approved correction/reconciliation process exists; legitimate late settlement must not be silently considered reconciled.
- Stable notification IDs deduplicate new writes only; existing historical random-ID notifications are not reconciled. External email idempotency retention is finite and no durable delivery record/outbox is added. Exactly-once email across unlimited retries is not proved.
- Public routing ownership, credential closure, actual deployed email authorization/provider delivery, real DB concurrency, sandbox delivery, final source deployment and independent QA remain unverified. No real production callback is permitted by this assignment.

**XENDIT IDEMPOTENCY = BLOCKED.** Local webhook regression passes do not satisfy DEPLOYED + VERIFIED + INDEPENDENTLY TESTED.
