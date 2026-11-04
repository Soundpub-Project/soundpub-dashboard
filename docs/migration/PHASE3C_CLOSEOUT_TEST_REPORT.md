# Phase 3C closeout test report

Date: 2026-10-28 (Asia/Bangkok).

## Focused domain tests

| Command | Result |
| --- | --- |
| `npx tsx --test test/releases.test.ts test/release-aggregate.test.ts test/submissions.test.ts test/public-catalog.test.ts` | PASS: 15 tests, 0 failed, 0 skipped |
| `npx tsx --test test/orphan-repair.test.ts` | PASS: 8 tests, 0 failed, 0 skipped; confirms earlier full-run disconnect was transient |
| `npm run typecheck` in `backend` | PASS |
| `npm run security:check` in `backend` | PASS |

## Frontend/static regression

| Command | Result |
| --- | --- |
| `npm run build` | PASS: 3333 modules; existing chunk-size warning only |
| `node scripts/phase3-client.test.cjs` | PASS |
| `node scripts/phase3b-frontend.test.cjs` | PASS |
| `node scripts/phase3c-static-scan.cjs` | PASS: unexpected backend-mode Release/Track Supabase references 0 |
| `node src/components/releases/backend-mode.test.cjs` | PASS |

## Browser acceptance

Command uses cached Playwright package and `docs/migration/phase3c-closeout-browser.ts`.

- Real Vite proxy to Fastify to disposable restricted PostgreSQL.
- Mobile 390x844: 20 PASS.
- Tablet 768x1024: 20 PASS.
- Desktop 1440x900: 20 PASS.
- Total: 60 PASS, 0 FAIL, 0 BLOCKED.
- Covers aggregate create/edit/rollback/concurrency, Track stage/edit/reorder/remove/reload, readiness, deferred blockers, synthetic satisfied submission, 400/401/403/404/409/500/network recovery, stale authority, historical transfer, public list/detail and zero direct legacy Release/Track requests.

## Whole backend regression

A first parallel-heavy run produced 105 pass, 2 fail and 4 environment-gated skips: one expected test assertion changed by the new submit-only contract, and one transient disposable PostgreSQL connection termination. The assertion was updated, the orphan suite passed independently, and independent QA then ran the final serial backend glob: 128 passed, 0 failed, 0 skipped/cancelled.

## Production isolation

Production data imported: NO. Production credentials used: NO. Production traffic switched: NO. Shared Supabase mutated: NO.
