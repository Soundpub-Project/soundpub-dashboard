# Phase 3C closeout browser acceptance

Date: 2026-10-28 (Asia/Bangkok). Owner: Agent E. Final browser gate: PASS. Execution complete; no frontend/backend fixes made by this agent.

## Runnable harness

From repository root, PowerShell:

```powershell
$env:PLAYWRIGHT_PACKAGE_JSON = 'C:\Users\bimok\AppData\Local\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright\package.json'
backend/node_modules/.bin/tsx docs/migration/phase3c-closeout-browser.ts
```

Use any installed Playwright package; no dependency installation required. Optional `PLAYWRIGHT_EXECUTABLE_PATH` selects an installed browser; default uses Playwright Chromium. Requires Docker Desktop `desktop-linux` local named-pipe context, cached `postgres:17-alpine`, root dependencies and backend dependencies. Existing disposable PostgreSQL helper checks context, publishes only loopback on a random port, migrates a new database and removes its own container/volumes afterward. Domain requests execute as restricted `soundpub_app`; setup/fixture assertions use owner connection.

Harness starts real Vite proxy and real Fastify domain services on loopback random ports. Synthetic local identity binding replaces external authentication only. External browser requests are aborted and recorded; same-origin API requests are never fulfilled with canned responses. Controlled 500 uses a throwing backend hook. Aggregate persistence rollback uses a trigger installed only in the disposable database. Network failure aborts a connection without synthesizing an HTTP response.

Results, failed-check PNGs and per-viewport request logs go to a newly created OS temporary directory printed at completion. Every required unresolved row remains BLOCKED; any FAIL or BLOCKED yields exit code 1. Browser fetch checks are explicitly API evidence, never substituted for product controls.


Final frozen rerun after dashboard RPC guard and anonymous detail control: `I:/DevData/TEMP/soundpub-phase3c-closeout-0Xim2x/results.json`, exit 0. **60 PASS, 0 FAIL, 0 BLOCKED**: 20 checks each at 390x844, 768x1024 and 1440x900. Direct Release/Track PostgREST/RPC/Edge Function requests were zero. Public catalog list and product detail both passed. Script SHA-256: `FCBC51CEFF86984A298049E25A03E755827D31B764202335E6E1583974BD7DD7`. This rerun supersedes earlier failed snapshots below, which remain as defect history.

## Execution evidence

Initial real-stack run: `I:/DevData/TEMP/soundpub-phase3c-closeout-8TCCtO/results.json`, exit 1. Mobile 390×844, tablet 768×1024, desktop 1440×900 all executed. Legacy product UI passed Track create/edit/remove/reload, Release list/detail, edit 400/401/403/409/500, network failure and recovery, and missing Release error. Browser fetch passed aggregate create/edit, validation rejection and stale conflict. Product still saved releases without initial Tracks. Readiness endpoint returned 404. Direct `get_dashboard_role_stats` RPC requests were detected and blocked on all three viewports. Metadata-reload assertion read before load completion; harness synchronization corrected afterward, so initial failure is not a product defect claim.

Second run: `I:/DevData/TEMP/soundpub-phase3c-closeout-jG4QfN/results.json`, exit 1. During concurrent frontend edits, Vite reported `SyntaxError: Identifier 'publicCatalogApi' has already been declared`; product checks consequently lacked fixtures. Real browser fetch aggregate create/edit passed on all viewports, including database-triggered create/edit failure rollback and concurrent aggregate edits with one 200 and one 409. This run does not establish product browser parity.

Both initial runs preceded latest staged-track frontend and submission integration; neither proves final integrated acceptance.

Final integrated run: `I:/DevData/TEMP/soundpub-phase3c-closeout-KWwy1z/results.json`, completed 2026-10-28 23:37:53 Asia/Bangkok, exit 1. **57 PASS, 3 FAIL, 3 BLOCKED**: each viewport has 19 PASS, one legacy-request FAIL, one anonymous product-detail BLOCKED. All checked product aggregate/Track workflows, errors, readiness, synthetic submission, transfer display and public catalog list passed. Each viewport still emits `/rest/v1/rpc/get_dashboard_role_stats` from dashboard layout; requests were blocked before external access. This is an actual zero-direct-RPC gate failure, not a backend mutation fallback. Catalog public API detail works, but no anonymous product detail navigation exists; no UI detail PASS claimed.

Final artifacts: `mobile-requests.json`, `tablet-requests.json`, `desktop-requests.json`, `results.json`, plus PNGs at the legacy-request failure, all under the final temporary directory. Script SHA-256: `522DDAAAFEF469F13C8BF0B86A8CA9AAA451A31779F70C7C9FB355341DFA69D8`. Docker check after completion found no remaining disposable test container. Final script is the version executed in this run.

Intermediate integrated run `I:/DevData/TEMP/soundpub-phase3c-closeout-8LFjSp/results.json` exposed harness defects: network abort targeted old metadata endpoint, and transfer fixture updated two deferred-FK-related records in separate transactions. Both corrected before final run; neither is reported as a product defect.

Focused backend validation rerun from `backend`: `node_modules/.bin/tsx --test test/release-aggregate.test.ts test/submissions.test.ts test/public-catalog.test.ts` **4 PASS, 0 FAIL, 0 SKIP**, exit 0. Log: `I:/DevData/TEMP/phase3c-closeout-contracts-final.log`. Earlier run had two fixture NOT NULL failures; owning agents corrected those before passing rerun. This focused validation is not whole-project regression or independent QA approval.

## Required matrix

| Check | Mobile | Tablet | Desktop | Evidence / remaining requirement |
| --- | --- | --- | --- | --- |
| Release list/detail | PASS | PASS | PASS | Visible product list/detail after persisted aggregate edit |
| Product aggregate create with initial Tracks | PASS | PASS | PASS | Staged initial Track before one POST `/releases/aggregate`; SQL checked |
| Product aggregate edit | PASS | PASS | PASS | One PATCH `/releases/:id/aggregate` persists Release and Track changes |
| Staged Track create/edit/reorder/remove/reload | PASS | PASS | PASS | Staging does not persist until aggregate save; SQL order and remaining row checked |
| Aggregate create/edit failure rollback | API PASS | API PASS | API PASS | Disposable SQL trigger forces persistence error; Release/Track changes roll back |
| Aggregate stale/concurrent edit | API PASS | API PASS | API PASS | Actual browser fetch; stale 409; concurrent 200/409 |
| Readiness display and fail-closed submit | PASS | PASS | PASS | Blocker display, disabled submit, real POST denial |
| Missing media/payment/provider individually | PASS | PASS | PASS | Injected service dependency fixtures; exact blocker sets; denied POST leaves draft |
| Satisfied synthetic submission | PASS | PASS | PASS | Product submit button; real POST; SQL pending; persisted reload; no external integration |
| Edit 400/401/403/409/500 | PASS | PASS | PASS | Visible errors and recovery; role/identity revocation, stale version, throwing backend hook |
| Missing Release 404 | PASS | PASS | PASS | Visible product NOT_FOUND |
| Network failure/recovery | PASS | PASS | PASS | Aggregate connection abort; visible TEMPORARY_FAILURE and recovery |
| Persisted reload | PASS | PASS | PASS | Aggregate, staged Tracks and successful submission SQL/reload checks |
| Track validation/stale/forbidden product UI | PASS | PASS | PASS | Invalid staged title 400, concurrent Track version 409, revoked role 403; persisted title unchanged |
| Loaded edit after management transfer | PASS | PASS | PASS | Transactional disposable roster transfer; old label denied 404; title unchanged |
| Historical Label display after transfer | PASS | PASS | PASS | Artist product detail shows historical Label; current manager API retains historical Label ID/name |
| Public list, active visible, draft/archived hidden | PASS | PASS | PASS | Anonymous API calls plus `/catalog` visible active card; archived card absent after reload |
| Public anonymous detail | PASS | PASS | PASS | Anonymous list card opens detail loaded from public detail API |
| Direct legacy business calls = 0 | PASS | PASS | PASS | Dashboard RPC is guarded in backend mode; final request logs contain zero Release/Track PostgREST/RPC/Edge calls |

Public catalog has no separate private flag in backend schema. Draft and archived active records are tested as hidden; do not claim a nonexistent private flag was tested. Media URLs are intentionally null in public API; playback is Phase 3D.

Final rerun closes direct RPC and anonymous product detail gaps. Loading/empty-state accessibility, visual overflow and anonymous-session product catalog interaction were not separately accepted. Public API requests omit authentication, but `/catalog` product list was visited within an authenticated browser context. Dependency checks use controlled adapters, not real Storage/payment/provider systems. Absent/throwing adapter behavior belongs to focused submission tests; browser matrix covers explicit missing/satisfied states. Independent QA reran the final integrated workspace: 60/60 browser checks PASS with unchanged candidate hashes.

## Scope and isolation

Only `docs/migration/phase3c-closeout-browser.ts` and this matrix changed by Agent E. No frontend/backend source edits, package changes, deployment, SSH, production data import, production credentials, production traffic switch, provider calls or shared Supabase mutations. No agent messaging tools are available in this session; coordination uses current shared source contracts and progress updates.
