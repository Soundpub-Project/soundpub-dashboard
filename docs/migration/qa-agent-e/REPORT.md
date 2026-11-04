# Agent E — Phase 3A browser QA

Status: **Controlled live chain PASS; final three targeted browser blockers PASS**. Latest-source fixture closeout: 30/30 scenarios passed across mobile/tablet/desktop, covering expiry/refresh, rejected profile/role/status validation UI and profile GET 401/403 signout. See [targeted closeout](TARGETED_CLOSEOUT.md) and `artifacts/targeted/results.json` for assertions, 30 screenshots and source hashes. Complete run 2026-10-28 10:40:43–10:42:24 Asia/Bangkok; tracked source snapshots unchanged at verification. No blocker remains within the specifically requested browser closeout scope. Broader Phase 3A certification is not inferred.

Local production-mode build passes. Initial Chromium checks used intercepted API responses. The follow-up below uses a real Vite proxy, backend mock identity adapter and disposable PostgreSQL Users service, closing the earlier live-chain blocker.

## Live controlled chain — 2026-10-28

Final live run: **10:36:10–10:36:25 Asia/Bangkok**, desktop 1440×1000. Eight recorded check groups PASS; inactive-user denial also asserted in the script. Evidence: `artifacts/live/results.json`; runner: `live-acceptance.ts`.

Chain actually executed: synthetic cached Supabase SDK session → browser bearer → `http://127.0.0.1:8181/api/...` → real Vite proxy → owned Fastify backend at `http://127.0.0.1:62229` → real `MockIdentityProvider` → principal repository → real Users service → PostgreSQL 17 in owned container, loopback port 64343. No API response interception or mocked Users repository/service. External browser requests were aborted.

The runner loads repository Vite config and overrides only the `/api` target to its owned ephemeral backend port. Browser origin is **8181**, matching the CORS allowlist. Prior 8282 mock runs bypassed forwarding and cannot establish live CORS acceptance. Vite warned that a wildcard listener existed on 8181 but reported `127.0.0.1:8181` available and successfully bound that address. Owned backend request records and successful database assertions establish which backend served this run. The wildcard listener was neither stopped nor changed.

Backend bootstrap is QA-scoped: real `buildApp`, `MockIdentityProvider`, identity authenticator, principal repository and Users service. Readiness and rate limiter use permissive test fixtures; unrelated storage/webhooks/workers are not initialized. This is not a test of `backend/src/main.ts` or its S3 bootstrap.

Fresh `postgres:17-alpine` container: `soundpub-agent-e-860978b9-7f59-49de-9221-7c171261f05c`. Database `soundpub_test_users_agent_e`; all six repository migrations applied. Runtime queries ran as restricted `soundpub_app` via PostgreSQL role setting. Fixture/migration connection used the container-local bootstrap owner. This proves effective runtime-role privileges, not a separate restricted-login authentication test. No existing database or port 55432 was used.

| Executed route/check | Result and evidence |
| --- | --- |
| `/dashboard/users` | 105 synthetic users rendered; two actual API pages (`limit=100`, then cursor). Both bearers reached owned backend. |
| Users row status dialog | Inactive update returned 200; PostgreSQL status asserted; refreshed row displayed inactive. Same target token then received `/api/v1/me` 403. Controlled browser fetch restored active status. |
| Users row role dialog | Admin update returned 200; DB role array asserted `['admin']`; same target token immediately returned Admin from `/api/v1/me`. |
| `/dashboard/settings` | Full name changed to `Live Persisted Profile`; PATCH succeeded; SQL asserted persisted value; page reload retained value. |
| Browser fetch `/api/v1/me` through proxy | Missing and invalid bearer each 401; active target 200. These are in-page fetch assertions, not separate error-page navigation. |
| Role removal through browser fetch | Restored target to User; same target token immediately denied admin listing with 403 and `/me` returned User. |
| Audit persistence | SQL found `profile.updated` ×1, `user.roles_changed` ×2, `user.status_changed` ×2. |

Screenshots: `artifacts/live/desktop-users-pagination.png`, `artifacts/live/desktop-users-role-persisted.png`, `artifacts/live/desktop-profile-persisted.png`. Profile screenshot visibly retains saved name after reload; unrelated Settings sections may show loading because their external requests are deliberately blocked. No claim of whole-Settings parity.

Cleanup PASS: browser, Vite, backend and both pools closed; owned container removed with anonymous volumes. Subsequent `docker ps -a --filter label=soundpub.qa.owner=agent-e` returned no containers. No production/SSH access or product edits.

Reproduce from root with `PLAYWRIGHT_PACKAGE_JSON` set as below:

```powershell
.\backend\node_modules\.bin\tsx.cmd docs/migration/qa-agent-e/live-acceptance.ts
```

Two discarded live setup attempts were cleaned: missing migration prerequisite `soundpub_owner` role, then a case-sensitive Inactive badge locator. Added the required disposable role and case-insensitive locator; final fresh-container run passed. No product defect is attributed to those harness errors.

Remaining: live mobile/tablet matrix, expired sessions and rejected current-profile UI, broader role/status/security matrix, validation, cursor misuse/filter parity and concurrency. Cross-origin CORS preflight remains untested; this run proves intended same-origin forwarding. Mock identity proves controlled local identity resolution, not real Supabase token verification or Auth migration.

Evidence date: 2026-10-28, Asia/Bangkok. HEAD: `48222ffb9c9e60da82d224e1e8aaccd4dd597442` with concurrent uncommitted changes. `artifacts/source-snapshot.json` records source hashes during execution; this is not an immutable release candidate.

Final completed run: **27 browser scenarios executed, 9 assertion groups PASS, 18 observation-only, zero scenario failures; 27 screenshots**. All three viewport classes passed anonymous redirect, Users listing plus role/status request submission, and profile-edit request submission. No uncaught page errors or document-level horizontal overflow were recorded in any scenario. Mobile Users table uses internal horizontal scrolling; document overflow false does not mean every column fits simultaneously.

Observed across all three viewport classes: empty list displays `Belum ada users`; 401 displays `Sesi tidak valid. Silakan login kembali.`; 403 displays `Anda tidak memiliki akses ke daftar user.`; 500 and network failure display `Gagal memuat daftar user. Silakan coba lagi.` with `Coba lagi`. No repeated list request or redirect loop appeared within the observation window. Loading captures omit target rows before delayed completion. Error states also show the empty-list panel; this is recorded behavior, not a parity approval.

## Inputs and environment

Read Phase 3 final report, frontend inventory, domain migration matrix, parity matrix, authorization report, frontend regression report, independent QA, and Phase 2 architecture/Auth/authorization/API/local-development documents. Reviewed app routes, protected routes, Auth/session setup, Users service, profile settings, role/status dialogs, API client and Vite configuration.

Node v24.22.1; Vite 8.3.0; Playwright 1.64.1; Chromium headless shell 156.0.8078.4. Playwright downloaded through npm cache, browsers through user cache; repository dependency manifests were unchanged.

## Executed browser routes

App origin: `http://127.0.0.1:8282`. Viewports: mobile 390×844, tablet 768×1024, desktop 1440×900.

For each viewport:

- `/dashboard/users`, anonymous: assert redirect to `/auth`.
- `/dashboard/users`, synthetic superadmin session: assert target user visible and bearer transported; open target row actions, submit Inactive status, submit Admin role; assert PATCH status and PUT roles requests.
- `/dashboard/settings`, synthetic session: assert profile form visible, change full name, submit, assert PATCH profile request.
- `/dashboard/users`, empty list, delayed response, HTTP 401, HTTP 403, HTTP 500, aborted network: execute and capture rendered state and screenshot. These scenarios are observation-only in the runner; recorded text permits review without claiming automated assertions.

Intercepted API paths: `GET /api/v1/profile`; `GET /api/v1/admin/users?limit=100`; `PATCH /api/v1/profile`; `PATCH /api/v1/admin/users/22222222-2222-4222-8222-222222222222/status`; `PUT /api/v1/admin/users/22222222-2222-4222-8222-222222222222/roles`. Exact requests, mutation bodies, bearer-presence boolean, final routes, page errors and rendered text are in `artifacts/results.json`.

The fixture remains static after writes. Mutation checks prove UI request submission and success handling, not persisted role/status/profile changes. No admin detail route was invented; this UI uses row-action dialogs. No `/api/v1/me` request is added by the harness.

## Evidence and reproduction

`browser-acceptance.mjs` is the runnable harness. Set `PLAYWRIGHT_PACKAGE_JSON` to the absolute package.json of an installed Playwright package, then run from repository root:

```powershell
node docs/migration/qa-agent-e/browser-acceptance.mjs
```

The runner clears inherited VITE variables, disables environment-file loading, enables development-only Users backend routing, builds into its artifact directory, starts loopback Vite and blocks all external app requests. Every API request is fulfilled/aborted locally by Playwright. Build output is in `artifacts/build`; screenshot names are `<viewport>-<scenario>.png`.

Earlier discarded harness attempts: browser installation incomplete; full Chromium launch returned `spawn UNKNOWN`, while headless shell and installed Edge launched successfully. Running development Vite after programmatic production build inherited production NODE_ENV and caused `_jsxDEV is not a function`; explicitly restoring development NODE_ENV fixed the harness. A role-option locator timed out due to accessible-name spacing; corrected locator selects the Admin option. These are harness failures, not attributed product defects.

## Initial mocked-run gaps (superseded where live evidence above applies)

- Actual browser session → backend verifier → local identity → database role/status authorization is unproven. Same-origin URLs were used, but API interception bypasses Vite forwarding. CORS/preflight and real backend failures remain untested.
- Loopback TCP ports 3000 and 55432 were listening. Ownership was unverified; no application request or database access was made against them. A dedicated, attributable disposable backend fixture is required for full end-to-end acceptance.
- Missing/invalid/expired tokens, denied current-profile loading, inactive/suspended principals, non-admin route protection, stale-role enforcement, validation rejection and concurrent changes were not exercised.
- First/next/last-page iteration, cursor errors/reuse, filters, mixed-role label selection and parent-name preservation were not browser-tested.
- Dedicated detail navigation and navigation after persisted mutation were not demonstrated. Auth lifecycle remains Phase 4; label transfer remains Phase 3B.
- Screenshots require viewport-specific review; DOM horizontal-overflow measurements are in results. No accessibility or visual-parity PASS is inferred from successful request submission.

## Isolation

Only this dedicated QA/report directory was authored. No product code edits, SSH, production requests, production credentials, real user sessions or shared Supabase mutations. Follow-up migrations ran only against the newly owned disposable container. No production traffic switched. Browser fixtures use synthetic IDs and `.invalid` email addresses.
