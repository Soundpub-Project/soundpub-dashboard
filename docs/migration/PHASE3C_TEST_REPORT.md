# Phase 3C Test Report

Date: 2026-10-28

## Results

| Gate | Result | Evidence |
| --- | --- | --- |
| Backend typecheck | PASS | `npm run typecheck` in `backend` |
| Isolation/secret scan | PASS | `npm run security:check` |
| Full backend suite | PASS WITH SKIPS | 113 total; 109 pass; 0 fail; 4 environment-gated skips |
| Release service | PASS | 11 tests |
| Track service | PASS | 10 tests |
| Restricted HTTP + disposable DB | PASS | `backend/test/api-release-tracks.test.ts` |
| Phase 3C races | PASS | seven race cases in `backend/test/phase3c-concurrency.test.ts` |
| DB model | PASS in independent disposable run | `backend/test/release-track-db.test.ts`: 1/1 restricted-login pass; env-URL variant skipped in full suite |
| Frontend adapter check | PASS | `src/components/releases/backend-mode.test.cjs` |
| Frontend build | PASS | Vite production build |
| Browser core flows | PASS | mobile/tablet/desktop, real HTTP + disposable DB |
| Whole frontend TypeScript | FAIL, pre-existing/legacy | AppSidebar/Auth type mismatch, chart typings, copyright/payout and legacy generated Supabase types |
| Full browser error matrix | NOT RUN | Required 401/403/404/409/500/network UI matrix incomplete |
| Independent QA | FAIL for full Phase 3C | Metadata-slice pass only; full workflow parity blocked |

## Concurrency cases

- Release edit vs edit: one commit, one 409.
- Release status transition vs edit: one commit, one 409.
- Track reorder vs reorder: one commit, one 409.
- Track delete vs Release status transition: one commit, one 409.
- Track create vs Track create: one commit, one 409.
- Release delete vs Track create: Release delete fails closed; Track create commits safely.
- Actor suspension vs Release edit: mutation waits for actor status lock, then fails 403 without writing.

## Browser viewports

- Mobile 390x844: PASS core metadata flow.
- Tablet 768x1024: PASS core metadata flow.
- Desktop 1440x900: PASS core metadata flow.
