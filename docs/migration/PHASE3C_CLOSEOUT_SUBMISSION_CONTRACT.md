# Phase 3C closeout submission contract

Scope: synthetic/local data only. No Storage, payment or provider integration, production operation, activation or refund.

## HTTP contract

- `GET /api/v1/releases/:id/submission-readiness`: authenticated, current-authority scoped. Returns `{ release_id, version, ready, blockers: [{ code, owner }] }`. Every blocker has exactly one owner, defined in `backend/src/submissions/contracts.ts`.
- `POST /api/v1/releases/:id/submit`: authenticated; strict body `{ version: integer >= 1 }`. No browser dependency assertions accepted. Success returns existing Release DTO with incremented version.
- Blocked submission: `409`, standard error envelope with `error.code = SUBMISSION_BLOCKED`, `message = Submission prerequisites are not satisfied`, and `requestId`. Fetch readiness for structured blockers.
- Stale version: `409 CONFLICT`. Invalid ID/body: `400 BAD_REQUEST`. Missing credentials: `401 UNAUTHORIZED`. Revoked/suspended actor: `403 FORBIDDEN`. Missing/unrelated resource: `404 NOT_FOUND`.

Readiness is advisory. Submission recomputes prerequisites inside its own transaction. A readiness response never authorizes a later write.

## Exact local prerequisites

1. Source status is `draft` or `rejected`; `archived_at` is null.
2. Release title and artist name are nonblank; release type, genre and release date are present.
3. Artist relationship exists, and actor has current management authority. Historical label/creator attribution grants no authority. Admin access alone does not satisfy missing/invalid ownership.
4. At least one Track exists. Each Track has nonblank title/artist name, belongs to this Release, and has contiguous one-based position in backend order.
5. Trusted media adapter confirms cover and audio for every Track. URL presence alone is insufficient.
6. Trusted payment adapter confirms payment prerequisite satisfied, including an authoritative exemption if future business policy permits one. Browser claims and legacy status strings are insufficient.
7. Trusted provider adapter confirms provider-required metadata. This is validation only; no provider activation.

ISRC, composer, duration and provider-specific fields are not unconditionally required by this local metadata policy. Future provider adapter must enforce its own exact submission rules. Current schema contracts continue enforcing field syntax and limits on writes.

## Transaction and status ownership

Service reloads/locks DB principals and roles, locks current Artist management, then locks Release. Track mutations already share parent lock discipline. Expected version is checked before a conditional Release update. Status change and `release.submitted` audit commit together; audit failure rolls back both. Dependencies must inspect authoritative local state through supplied transaction and perform no external effects.

| Source | Result | Owner |
| --- | --- | --- |
| `draft` + satisfied prerequisites | `pending` | PHASE3C |
| `rejected` + satisfied prerequisites | `revision_submitted`, rejection reason cleared | PHASE3C |
| `pending` payment confirmation | Existing vocabulary `pending_paid`; unavailable here | PHASE3E_PAYMENT |
| Review/approval and activation | Existing `processing`/`active`; no activation here | LATER_PROVIDER for activation |

READY_FOR_SUBMISSION is computed `ready: true`, not a new persisted status. AWAITING_PAYMENT and READY_FOR_ACTIVATION are not invented statuses. Refund remains unavailable and cannot be represented as completed.

## Integration and remaining boundary

Runtime wiring: `main.ts` injects `createSubmissionService(pool)` without adapters; `ApiDependencies.submissions` is optional for existing isolated API consumers; API registers both routes and OpenAPI when injected. Default runtime always fails closed for deferred dependencies.

Coordinator integration complete: existing Release PATCH transitions to `pending`/`revision_submitted` (including `inactive` restore) now return 409, even for admin. Dedicated submit service is the only submission mutation; state-machine document reflects owner mapping. Deferred media/payment/provider work remains incomplete and cannot be inferred from synthetic satisfied fixtures.

## Runnable evidence

From `backend`: `npm run typecheck` and `npx tsx --test test/submissions.test.ts`.

Tests provision disposable local Docker PostgreSQL, migrate it, use restricted `soundpub_app`, and remove container afterward. They cover default runtime routes/OpenAPI, missing/throwing dependency adapters, strict input, stale writes, revoked authority, missing current management, audit rollback, concurrent submission and revision submission. No environment-gated skip or real adapter is used.

Recorded execution, 2026-10-28 (Asia/Bangkok): `npm run typecheck` exited 0. `npx tsx --test test/submissions.test.ts` exited 0: **1 passed, 0 failed, 0 skipped** (10548.832 ms total). This is one integration test containing multiple contract assertions, not separate test counts for every scenario.

| Executed assertion | Observed contract |
| --- | --- |
| Default service through `buildApp` | Readiness HTTP 200 with `ready: false`; submit HTTP 409 with `SUBMISSION_BLOCKED` and documented message; submit operation in OpenAPI |
| Missing cover/audio, unpaid payment, invalid provider readiness | Corresponding owned blocker; submission rejected |
| Each dependency throws | Corresponding unavailable blocker; submission rejected without exposing exception text |
| Browser submits extra payment field or version zero | HTTP 400 |
| Stale expected version | HTTP 409 `CONFLICT` |
| Suspended actor or revoked verified role | Rejected using current DB authority |
| Label management verification removed | Historical Label denied with `NOT_FOUND` |
| Audit trigger deliberately raises | Submission fails; draft status and version unchanged |
| Two concurrent submissions with same version | Exactly one succeeds; other returns `CONFLICT`; exactly one submission audit persists |
| Rejected Release with synthetic prerequisites satisfied | HTTP 200, `revision_submitted`, rejection reason cleared |

Fixture provenance: test inserts only synthetic Artist/Label users, verified roles, current management, one complete draft Release and one Track into newly provisioned PostgreSQL. Positive dependencies are constructor-injected test adapters; no cover object, audio object, payment, invoice, refund or provider operation is performed. Browser acceptance and independent QA are outside this evidence.
