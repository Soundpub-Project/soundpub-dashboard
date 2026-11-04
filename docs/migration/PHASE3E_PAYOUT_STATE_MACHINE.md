# Phase 3E payout state machine

Agent D scope: local synthetic backend only. No production servers, credentials, rows, payment providers or Edge Functions used. Earlier reports are unchanged. Canonical source `request_payout` allows label/whitelabel; `update_payout_status` supplies pending/approved/rejected/paid vocabulary. Unsafe browser settlement and mutable profile balance authority are deliberately replaced.

## States and effects

| Operation | Actor | Precondition | New state | Finance effect | Reversible |
| --- | --- | --- | --- | --- | --- |
| Request | Active verified current label/whitelabel, self only | Backend policy ready/reconciled; exact positive IDR amount at threshold; enough locked available funds; no pending/approved request | pending | Reserve exact source accounts | Cancel before approval |
| Approve | Current active admin/superadmin | pending | approved | Hold original reservation | Reject/fail |
| Reject | Current active admin/superadmin | pending/approved | rejected | Release each original allocation once | No |
| Cancel | Current active owner, including owner whose label role was removed but retains another valid role | pending | cancelled | Release original allocations once | No |
| Fail | Current active admin/superadmin | pending/approved | failed | Release original allocations once | No |
| Mock settlement | Backend-only capability plus current active admin/superadmin | approved; nonempty synthetic reconciliation evidence | paid | Consume reservation; availability stays reduced | No |

All other transitions return 409. Paid cannot regress or release. No reversal contract is guessed: corrections require separately authorized finance adjustment/reconciliation. `settleMock` has no HTTP route; public `transition` cannot accept paid even with extra arguments. Evidence belongs to trusted backend/mock reconciliation, never browser-supplied authority.

Every actual transition and request writes payout audit (actor, amount, currency, old/new state, permanent idempotency reference, timestamp) and safe outbox payload in the same transaction. Bank account numbers stay outside DTOs, audit, receipts and outbox.

## Transaction and balance authority

`backend/migrations/0016_payouts.sql` depends on Agent C `0014_finance_ledger.sql`. Adapter `backend/src/payouts/finance.ts` uses only `lockAccount`, `getBalance`, `postEvent`, `parseMoney`, `formatMoney`; no finance file edits. Ledger events, not `profiles.balance`, supply available funds.

Order: current user status/verified-role locks via existing Users protocol, profile roster share locks, sorted finance account row locks, payout row lock for transitions, mutation, allocation, ledger audit/outbox, payout audit/outbox, permanent operation receipt, commit. Finance account trigger rejects negative availability/reservations and duplicate terminal release/settlement. Deferred payout constraint rejects missing allocations, ledger mismatches, audit or outbox at commit. Any failure rolls back all effects.

Current verified roster uses matching `profiles.parent_label_id` and `artists.label_id`. Available sums label plus current artists. Allocation preference is label first, then sorted artist UUIDs. Account locks always sort UUIDs first. Original allocations are immutable runtime rows; cancellation/settlement after artist transfer uses original source account, never recipient label or new roster. Existing Artists/Users operations must retain their authority lock protocol for membership/status/role changes.

IDR uses exact two-decimal accounting strings and BigInt minor units; no float arithmetic, no implicit rounding. Inputs require canonical decimal strings up to 16 whole digits, consistent with Agent C numeric(18,2)/minor-unit ceiling. Out-of-format, extra owner/balance/status fields and nonpositive requests reject.

Explicit `PayoutPolicy(db, ownerId)` supplies minimum, destination readiness and reconciliation evidence. No fallback threshold or readiness is invented. Composition must resolve policy from trusted backend settings/verification; absence is a composition blocker. Email verification is independently read from current DB row. Ledger audit/outbox integrity is independently checked. Request bank details are strictly validated. Browser bank details do not establish account verification or reconciliation.

## Idempotency

`Idempotency-Key`: 1–128 ASCII letters/digits/colon/underscore/hyphen. Permanent receipt namespace `(actor_id,key)` covers all payout mutations; payload hashes include operation/target. Same key/different payload returns 409; exact replay returns stored original DTO. Actor row locking serializes competing keys and receipt claims. Retry cancellation with a different key returns terminal row without another ledger release or audit. Paid retries require original exact key/evidence; other-key settlement returns 409. No expiry permits reusing a financial key.

## Integration contract for coordinator / Agent H

Factory: `createPayoutsService(pool, createPgPayoutFinance(trustedPolicy))`.
Mount: `registerPayoutRoutes(app, service, authenticate)` from `backend/src/payouts/routes.ts`. API/main composition and OpenAPI aggregation belong to coordinator, outside Agent D write scope.

| HTTP | Shape |
| --- | --- |
| GET `/api/v1/payouts/eligibility` | `{eligible,reasons,available,minimum,currency}` |
| POST `/api/v1/payouts` | `{amount:"800.00",currency:"IDR",bank_name,account_number,account_holder_name}`; Idempotency-Key required |
| GET `/api/v1/payouts` | Self only; `limit` 1–200 (default 50), `offset` 0–100000 (default 0); `{items}` |
| GET `/api/v1/admin/payouts` | Same pagination; admin/superadmin only |
| GET `/api/v1/payouts/:id` | Owner or current admin; unrelated resource masked 404 |
| POST `/api/v1/payouts/:id/cancel` | No body; Idempotency-Key required |
| POST `/api/v1/admin/payouts/:id/transition` | `{status:"approved"|"rejected"|"failed"}`; Idempotency-Key required |

Request/cancel/transition/detail return `{id,user_id,amount,currency,status,bank_name,account_holder_name,created_at,updated_at}`. Amount stays string; timestamps serialize ISO UTC. No raw account number, provider secret or payment proof URL. Errors: 400 malformed input/key; 401 missing authenticated identity; 403 inactive/forbidden role/browser settlement; 404 unrelated/missing row; 409 eligibility, insufficient funds, transition, receipt or reconciliation conflict.

## Evidence and remaining gates

Run `cd backend; npx tsx --test test/payouts.test.ts` and `npm run typecheck`.
Suite uses disposable local PostgreSQL 17 with actual runtime role, migrations and Agent C ledger primitives. Covers deterministic DB lock-barrier concurrent 800/800 against 1000 (one success), threshold/over-balance/readiness denial, permanent replay/conflict, forged owner, unrelated detail/cancel, admin abuse, one-time cancellation release, approval, forged paid denial, trusted synthetic settlement replay, terminal regression denial, failure release, pooled label/artist allocation, release after roster removal, forced outbox failure rollback, removed role and suspended admin. Fastify injection (no listening server) verifies route mounting, exact string amount, account-number suppression, required replay header and browser paid rejection.

This is payout slice evidence, not whole Phase3E PASS. Coordinator must mount routes, supply verified policy, run explicit lock-barrier races with concurrent roster transfer/status/role removal, API/browser acceptance, reconciliation and independent QA before phase acceptance. No production/provider settlement claim.
