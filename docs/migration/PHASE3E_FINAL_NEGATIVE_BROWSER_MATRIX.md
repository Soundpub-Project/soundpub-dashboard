# Phase 3E final negative browser matrix — Agent E

Date: 2026-10-30, Asia/Bangkok. Latest bounded synthetic negative checks: **69 PASS, 0 FAIL, 0 SKIP**, exit 0, 23 checks per viewport. Comprehensive negative-browser gate remains **PARTIAL** because the gaps below were not exercised. No whole-phase approval or production/provider parity claim.

## Latest bounded follow-up

Write scope: only this matrix and `docs/migration/phase3e-browser.ts`. No product code, positive harness, provider wiring or other report changed in this follow-up.

The existing 14 checks per viewport remain. Nine additional checks run at mobile 390x844, tablet 768x1024 and desktop 1440x900:

| Added scenario | Mobile | Tablet | Desktop | Evidence boundary |
| --- | --- | --- | --- | --- |
| Invalid period `2026-13` rejected by UI | PASS | PASS | PASS | Visible error, no preview, disabled save, no royalty POST. |
| Unsupported composer field rejected by UI | PASS | PASS | PASS | `composer_code=UNKNOWN` cannot enter artist-import schema. This does not validate composer identity mapping. |
| Unsupported share field rejected by UI | PASS | PASS | PASS | `share_percentage=101` cannot enter artist-import schema. This does not establish approved share semantics. |
| Backend rejects invalid period and unsupported composer/share commits | PASS | PASS | PASS | Browser-origin HTTP bypasses client validation. Period preview/commit return 400 `BAD_REQUEST`; extra row fields return 400 `ROYALTY_IMPORT_INVALID` on commit. Exact error code and request ID presence checked. |
| Backend amount mismatch blocks import | PASS | PASS | PASS | Real UI preview returns 200 with `AMOUNT_MISMATCH`; visible row error and disabled save. Direct browser commit returns 400 `ROYALTY_IMPORT_INVALID`. |
| Unauthorized import preview/commit mutations rejected | PASS | PASS | PASS | Valid statement, both POST endpoints: active label returns 403 `FORBIDDEN`, missing bearer returns 401 `UNAUTHORIZED`. HTTP mutation-boundary evidence, not UI redirect acceptance. |
| Removed current admin authority rejects validated import | PASS | PASS | PASS | Load active admin, obtain valid preview, remove persisted role verification, click enabled save: actual backend 403 and visible failure, no success. Restore fixture authority in `finally`, reload and confirm empty import history. |
| Current payout user becomes inactive | PASS | PASS | PASS | Load active user, await initial reads, persist inactive status, refresh: list/eligibility return 403, error visible, request disabled, stale empty-history success hidden. Direct valid payout POST also returns 403. Restore fixture status in `finally`, reload empty history. |
| Current payout user becomes suspended | PASS | PASS | PASS | Same live-status-change UI and real HTTP assertions as inactive case. Existing missing policy still blocks payout after restoration. |

Execution began only after explicit coordinator confirmation that regression had finished and Docker was available. Coordinator reported **207/209**, with two Phase 3D media failures (`fetch failed`); that regression was not rerun or promoted to PASS here.

First expanded execution: **68 PASS, 1 FAIL**, exit 1. The mobile inactive-user waiter captured an outstanding initial eligibility 409 before the status-change refetch. Harness now waits for initial loading to finish before changing status. Serial rerun on final source: **69 PASS, 0 FAIL**, exit 0. First-run evidence remains in `agent-e-negative-browser-4db142f2c6244a369812c506b567310d` alongside the final directory.

Final evidence directory: `C:/Users/bimok/.codex/visualizations/2026/10/30/01a18c5c-43e8-70c0-b5ab-9d22608419da/agent-e-negative-browser-ea45ffded2114dc39ce5386ad4692e0b`. Its sibling `.log` records exit-0 execution; `results.json` records all 69 results, 486 browser API attempts, 470 responses, 0 unexpected external attempts, 0 financial Supabase attempts and 225 blocked Google Fonts requests. Response counts: 200=377, 400=15, 401=15, 403=36, 404=3, 409=21, injected 503=3.

Final independent SQL counts are all zero across 13 tables: `royalty_import_batches`, `royalty_import_entries`, `royalty_import_corrections`, `payout_requests`, `payout_allocations`, `payout_operations`, `payment_invoices`, `payment_mock_invoices`, `payment_effects`, `payment_callback_receipts`, `payment_refunds`, `finance_events`, `finance_audit`. Failed submissions create no financial effects. All account/role changes are disposable fixtures, restored in `finally`. The run produced 30 screenshots; mobile stale-admin rejection visually inspected. No production access, production data, live provider operation, shared Supabase mutation or real money used.

TypeScript syntax transpilation, `src/components/finance/backend-mode.test.cjs`, `scripts/phase3e-static-scan.cjs` and `scripts/phase3e-closeout-egress.test.cjs`: PASS. Browser assertions provide runtime evidence; static checks do not replace missing scenarios.

Reproduce from repository root only after coordinator confirms Docker availability, using a fresh absolute temporary evidence path:

```powershell
node backend/node_modules/tsx/dist/cli.mjs docs/migration/phase3e-browser.ts C:/Users/bimok/.codex/visualizations/2026/10/30/01a18c5c-43e8-70c0-b5ab-9d22608419da/agent-e-negative-browser-next
```

The sections below retain prior 42-check evidence. This follow-up supersedes its inactive/suspended, royalty-admin removal, invalid-period and unauthorized-import-mutation gaps only within the stated boundaries. Composer mapping/share validation, payout-specific role removal, eligible payout denials, duplicate financial mutations, provider failures, callback HTTP wiring, terminal-state races, stale corrections and auth expiry/refresh remain unproven.

## Changed files

- `docs/migration/phase3e-browser.ts`: existing import, URL, network and stale-preview checks plus invalid period, unsupported composer/share fields, backend amount mismatch, unauthorized mutation, removed current admin authority and inactive/suspended current payout users. Require absolute evidence path, reject unexpected external requests, separately classify blocked fonts, record API attempts and assert no persisted financial effects.
- `docs/migration/PHASE3E_FINAL_NEGATIVE_BROWSER_MATRIX.md`: this report.

No product code, positive harness or other documentation edited by Agent E. The prior 42-check execution recorded `PHASE3E_FINAL_REPORT.md` SHA-256 before/after: `60CFA546DFF569832F3D36EF4DB6C1F70AC8526365AEF430B8D54E9992E52190`; this is historical evidence, not a new checksum claim.

## Reviewed baseline

Reviewed `phase3e-browser.ts`, `phase3e-closeout-browser.ts`, original/closeout browser matrices, final reports, independent QA, authorization matrix and current finance UI/API/backend tests. Original negative report records four scenarios at three viewports, 12 PASS. Closeout positive harness has three scenarios per viewport, nine checks; callback signature/replay assertions run through services, not browser callback UI. Earlier reports retain their historical results; this report supplies current negative evidence.

Two original assertions needed tightening: import save accepted any rejected click, rather than checking native disabled state; arbitrary unexpected external requests did not fail the harness unless their URL matched financial Supabase paths. Current harness checks disabled state directly and fails any unclassified external attempt, including same-origin legacy financial API attempts.

## Prior executed matrix — 42 checks

Chromium headless with isolated contexts: mobile 390x844, tablet 768x1024, desktop 1440x900. Thirteen UI scenarios plus one browser-origin HTTP scenario per viewport. HTTP authorization row contains seven requests, counted as one scenario, not seven extra tests.

| Scenario | Mobile | Tablet | Desktop | Evidence boundary |
| --- | --- | --- | --- | --- |
| Royalty summary shows unreconciled warning and exact zero totals | PASS | PASS | PASS | Empty synthetic history; does not prove imported funds quarantine. |
| Missing payout policy disables request | PASS | PASS | PASS | Actual local eligibility error; no guessed threshold. |
| Invoice without approved price rejected | PASS | PASS | PASS | Actual POST returns 409 and visible unconfirmed-invoice alert. |
| Unknown royalty beneficiary prevents save | PASS | PASS | PASS | Actual preview identifies one unknown mapping; native save disabled. |
| Malformed JSON / numeric money rejected before API | PASS | PASS | PASS | Visible error, save disabled, no additional royalty POST attempt. |
| Duplicate source rows prevent import save | PASS | PASS | PASS | Actual preview reports duplicate; native save disabled. |
| Editing valid preview removes stale approval | PASS | PASS | PASS | Valid mapped preview enables save; edit clears preview and disables save. No commit. |
| Invalid release UUID blocks payment lookup | PASS | PASS | PASS | `aria-invalid=true`, lookup disabled, create absent, no payment API attempt. |
| Forged `status=PAID&paid=true&amount=0` URL grants no payment | PASS | PASS | PASS | Actual backend returns no invoice; PAID/verified labels absent. |
| Royalty read network failure hides cached totals; retry recovers | PASS | PASS | PASS | Abort summary refetch after success; error alert replaces cached totals. |
| Payout read network failure disables request; history retry recovers | PASS | PASS | PASS | Abort list/eligibility reads; no empty-history success until recovery. Missing policy still blocks request afterward. |
| Payment read network failure hides cached result; retry recovers | PASS | PASS | PASS | Abort status refetch after no-invoice result; create/status content hidden on error. No cached PAID fixture tested. |
| Invoice API 503 never reports success; status retry works | PASS | PASS | PASS | Playwright injects local HTTP 503; no invoice/provider call. This is API-outage UI coverage. |
| Financial HTTP rejects missing identity / forbidden label access | PASS | PASS | PASS | Real browser fetch: royalty, payout and payment missing bearer return 401; label royalty-import/admin-payout/admin-payment-reconciliation access returns 403; label querying artist payment returns 404. |

## Prior execution and isolation

Browser run was held for source/matrix review following coordinator contention warning. Before starting, repeated local process checks found no active regression/backend-test runner and local Docker listed no disposable closeout/concurrency containers. One browser harness ran serially; Agent F's suite was not rerun here. Agent F's final completion/result was not independently obtained.

Harness verifies local Docker Desktop named-pipe context, creates one disposable PostgreSQL 17 container, applies/replays migrations, uses actual `soundpub_app` runtime role, and starts Vite/Fastify on ephemeral loopback ports. Vite `.env` loading is disabled and frontend environment uses synthetic loopback placeholders. Authentication uses local fixture UUID tokens; production identity, expiry and refresh are outside this test. Browser service workers blocked; all non-origin requests aborted. No SSH, deployment, shared DB, live provider or production mutation.

Observed evidence:

- 276 browser API attempts; 261 responses. Status counts: 200=229, 401=9, 403=9, 404=3, 409=8, injected 503=3. Aborted requests do not produce HTTP responses.
- Unexpected external attempts: 0. Financial Supabase attempts: 0. Blocked Google Fonts presentation requests: 135.
- Persisted counts all zero: `royalty_import_batches`, `royalty_import_entries`, `payout_requests`, `payout_operations`, `payment_invoices`, `payment_mock_invoices`, `payment_effects`, `payment_refunds`, `finance_events`, `finance_audit`.
- 21 screenshots. Visually inspected mobile royalty-network error, tablet payout-network error and desktop payment-network error: alerts readable, retry controls visible, payout submit disabled. This is focused visual QA, not complete accessibility/device certification.
- Fixture cleanup completed; no disposable `soundpub-concurrency-*` container remained after run.

Evidence directory: `C:/Users/bimok/.codex/visualizations/2026/10/30/01a18abd-8650-78f2-b889-1091528c4021/agent-e-negative-browser`. `results.json` contains scenario results, API attempts/responses, external-request classifications and zero-effect SQL counts. Screenshots sit alongside it. No repository evidence files generated.

Reproduce from repository root after other Docker-heavy regression has finished:

```powershell
node backend/node_modules/tsx/dist/cli.mjs docs/migration/phase3e-browser.ts C:/Users/bimok/.codex/visualizations/2026/10/30/01a18abd-8650-78f2-b889-1091528c4021/agent-e-negative-browser-rerun
node src/components/finance/backend-mode.test.cjs
node scripts/phase3e-static-scan.cjs
node scripts/phase3e-closeout-egress.test.cjs
```

Browser command and all three existing non-Docker finance checks passed. TypeScript syntax transpilation passed. Static scan checked 10 backend-only files and 24 guarded callers; API import graph checked five files. Static success does not replace browser coverage.

## Remaining negative-browser coverage / blockers

Each unexecuted browser row applies equally to mobile, tablet and desktop. Backend assertions below were inspected, not rerun or counted in the latest 69 browser checks.

| Required area | Browser status on all three viewports | Existing narrower evidence / next check |
| --- | --- | --- |
| Below-minimum, insufficient-balance, malformed payout input | NOT RUN | `backend/test/payouts.test.ts` tests decimal/threshold/over-balance denials. Need eligible UI fixture and rejected submissions. |
| Duplicate payout / double click / lost-response retry / replay-key conflict | NOT RUN | Payout backend suite tests race, replay and conflict. Need UI submission/recovery and SQL effect counts. Duplicate import-row preview is a different case. |
| Forged payout owner / browser paid transition / foreign cancellation | NOT RUN | Payout backend suite tests these boundaries. Current browser HTTP row covers read authorization only. |
| Payout-specific role removal, session expiry / refresh | NOT RUN | Latest run covers current inactive/suspended payout reads and request denial, plus removal of current royalty-admin authority. Synthetic UUID-token bridge does not prove expiry/refresh or a stale payout role. |
| Payment FAILED status and provider rejection/timeout | NOT RUN | API 503 is injected before backend/provider. It does not exercise actual provider exceptions, FAILED rendering or provider rollback. |
| Invalid/stale callback, mismatch and reconciliation failure through HTTP/UI | NOT RUN | Payment backend tests cover signature/staleness/mismatch; closeout positive harness invokes callback service. Current financial router has no payment callback HTTP route. |
| Stale PAID / refunded invoice, payout eligibility change while editing, terminal transition conflict | NOT RUN | Current stale cases cover royalty zero totals, valid import preview and no-invoice cache only. Need competing committed states and browser revalidation. |
| Persisted duplicate import, imported unreconciled balance / payout quarantine | NOT RUN | Current import cases are preview-only. Need committed synthetic batch plus ledger/policy/UI assertions; no financial write performed in this run. |
| Full offline/slow request, retry exhaustion, 429 and ambiguous POST completion | NOT RUN | Immediate targeted read aborts and one API 503 are covered. No full-network outage or response-loss workflow claim. |
| Composer identity mapping, approved share rules, stale royalty correction | NOT RUN / contract-dependent | Unsupported composer/share fields are rejected by artist-import UI and backend. There is no composer import UI or correction control in the tested surface; unsupported-field rejection is not composer allocation validation. |
| Production/provider settlement, composer entitlement and historical reconciliation | BLOCKED outside browser scope | Existing closeout reports keep these financial evidence gates open. Local negatives do not establish entitlement or authentic settlement. |

Disposition: focused negative scenarios PASS; comprehensive browser acceptance remains PARTIAL. Remaining browser gaps require separate focused work; provider/historical/composer gates remain coordinator-owned.
