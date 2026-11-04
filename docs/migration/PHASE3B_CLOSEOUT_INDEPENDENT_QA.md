# Phase 3B closeout independent QA — Agent F

Date: 2026-10-28 (Asia/Bangkok).

Status: **BLOCKED — broad page/Label-specific browser acceptance incomplete**. Coordinator confirmed harness source freeze; independent final browser run completed successfully. Supported UI mutation/error matrix passes all three viewports. API probes are not counted as UI flows.

## Independent backend evidence

Fresh independent run: **100 passed, 0 failed, 0 skipped, 0 cancelled**, exit 0; duration 21564.0988 ms. `npm --prefix backend test` runs every `backend/test/*.test.ts`, covering Phase 2, Phase 3A, Phase 3B and closeout together. No required database suite was skipped.

Evidence directory: `I:\DevData\TEMP\soundpub-qa-f-7bb4f27fa9e942e6a5e0a079aa19d3c1`. Full output: `backend-tests.log`; initial backend SHA256 manifest: `backend-before.json`. Comparing backend source/test/migration hashes after execution produced no differences.

Owned local Docker Desktop container: `soundpub-qa-f-7bb4f27fa9e942e6a5e0a079aa19d3c1`, PostgreSQL 17 Alpine, published only on `127.0.0.1:64934`. Three newly created blank databases prevented concurrent suites from sharing destructive schema resets:

```powershell
$env:DB_TEST_URL='postgres://postgres@127.0.0.1:64934/soundpub_test_qa'
$env:USERS_DB_TEST_URL='postgres://postgres@127.0.0.1:64934/soundpub_test_users_qa'
$env:ARTISTS_DB_TEST_URL='postgres://postgres@127.0.0.1:64934/soundpub_test_artists_qa'
$env:ARTISTS_DB_RUNTIME_URL='postgres://soundpub_app@127.0.0.1:64934/soundpub_test_artists_qa'
npm --prefix backend test
```

Provisioning used `docker --context desktop-linux run -d --name $qaRun --publish '127.0.0.1::5432' --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine`, with `$qaRun='soundpub-qa-f-'+[guid]::NewGuid().ToString('N')`. Local named-pipe Docker endpoint was verified with `docker context inspect desktop-linux`. Port was obtained from container inspection. `docker --context desktop-linux exec $qaRun psql -U postgres -c 'CREATE ROLE soundpub_owner; CREATE ROLE soundpub_app LOGIN;'` created roles; `docker --context desktop-linux exec $qaRun createdb -U postgres <database>` created each database above. Tests applied migrations and synthetic fixtures themselves. Artist integration authenticated through a separate restricted `soundpub_app` login and verified DDL denial. No existing schema/database was reused. Temporary local trust authentication was confined to this owned loopback-published disposable container.

Historical, repair and concurrency suites independently provisioned their own additional unique disposable containers through existing test support. All completed successfully and removed their containers. The main QA container was removed in `finally` with `docker --context desktop-linux rm -f -v $qaRun`; subsequent container inventory returned no matching QA, orphan, historical or concurrency containers.

| Evidence | Independent result |
| --- | --- |
| Phase 2 / 3A / 3B / closeout regression | PASS, 100/100, zero skipped |
| Current role/status authorization, strict inputs, privilege and ownership denials | PASS in backend suite |
| Repair target rejection and disposable marker | PASS |
| Clean scan, dry-run zero writes, explicit actor/reason | PASS |
| Deterministic repair, audit before/after, idempotency | PASS |
| Multiple orphan types and ambiguous whole-apply rejection | PASS; `AMBIGUOUS_REPAIR`, zero repairs/audits |
| Repair audit failure rollback and guarded batch rollback | PASS |
| Populated historical release/royalty non-rewrite | PASS |
| Both detach service paths preserve historical rows | PASS |
| Deletion review and restricted destructive-delete protection | PASS |
| Stale transfer rollback without false audit | PASS |
| Deterministic concurrency | PASS, 12 barrier/lock cases plus suite parent |

Concurrency independently covered competing transfers, aborted transfer lock release, transfer/detach both orders, FK-rejected physical delete, old-label membership removal, actor role removal both orders, destination role removal, membership add/remove, label role removal versus roster mutation and deactivation. Tests observe actual PostgreSQL blocking, not randomized timing.

## Additional commands and results

Run from repository root:

```powershell
npm --prefix backend run typecheck
node src/services/users.test.cjs
node scripts/phase3-client.test.cjs
node scripts/phase3b-frontend.test.cjs
node backend/scripts/check-isolation.mjs
& backend/node_modules/.bin/tsc.cmd --noEmit --allowImportingTsExtensions --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --esModuleInterop --skipLibCheck backend/test/orphan-repair.test.ts backend/test/historical-ownership.test.ts backend/test/phase3b-concurrency.test.ts
node --input-type=module -e 'import {build} from "vite"; process.env.VITE_SUPABASE_URL="http://127.0.0.1:54321"; process.env.VITE_SUPABASE_PUBLISHABLE_KEY="synthetic-qa-public"; process.env.VITE_SOUNDPUB_BACKEND_DOMAINS="users,artists,labels"; await build({envDir:false});'
```

- Backend configured source typecheck: exit 0.
- Users adapter, API contract, development routing and direct profile/role write guards: exit 0.
- Phase 3 client self-check: exit 0.
- Phase 3B routing/media boundary checks: exit 0; users-only selection fails closed with zero API and legacy calls; complete domain set uses API.
- Strict closeout tests and their transitive source/support: exit 0.
- Frontend production build: exit 0, existing large-chunk warning. `envDir:false` prevents loading project `.env`; only synthetic local frontend values supplied.
- Isolation scanner: initial exit 1, `test/orphan-repair.test.ts: forbidden production target`. Coordinator then added that intentional denied-address test file to the production-target allowlist. Independent rerun of `node backend/scripts/check-isolation.mjs`: **exit 0**, `Isolation and secret scan passed`. Secret-pattern checks remain active for the allowlisted file; only the forbidden-target check uses this allowlist. Initial failure is retained here as execution history, not an outstanding blocker.

Additional exploratory all-test typechecks were not configured project commands. With `--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes` and no `--allowImportingTsExtensions`, exit 2 reported existing `.ts` imports and worker-test optional/unchecked access diagnostics. Adding `--allowImportingTsExtensions` and dropping the two additional strict flags reported `backend/src/labels/index.ts(88,7): Type 'null' is not assignable to type 'string'`. These are recorded in `strict-tests.log` and `strict-tests-supported.log`; neither replaces the passing configured source typecheck or strict closeout check.

## Frontend source review

Reviewed Artist/Label adapters and affected roster, profile, deletion, onboarding, role, media and orphan-audit paths. Backend branches return through API or fail closed before legacy business operations; legacy-only and explicitly deferred Auth/Storage/Release branches remain present. Inspected backend-mode Artist/Label business counts: direct PostgREST 0, direct RPC 0, direct Edge Function 0, unexpected Supabase business references 0. These are guarded-path review counts, not raw text counts or a claim that frontend contains no Supabase imports. Users adapter, client and Phase 3B routing checks independently passed again after source freeze. Routing is development-only through `import.meta.env.DEV`; build success does not imply production traffic activation.

## Independent frozen-source browser run

Coordinator confirmed source freeze at SHA256 `23AEB5BBB189E352D04D9A801C1EE799660F42972FC4180B219B6371510EF785`. Independent before/after hash checks match. Backend source/test/migration hashes still match the passing 100-test snapshot. Coordinator reports no product source edits by browser agent. Isolation scanner independently passes after its scoped allowlist fix.

Exact independent command, from repository root:

```powershell
$env:PLAYWRIGHT_PACKAGE_JSON='C:\Users\bimok\AppData\Local\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright\package.json'
node --import ./backend/node_modules/tsx/dist/loader.mjs docs/migration/phase3b-closeout-browser.ts *> 'I:\DevData\TEMP\soundpub-qa-f-7bb4f27fa9e942e6a5e0a079aa19d3c1\browser-independent.log'
```

Exit **0**. Independent artifacts: `I:\DevData\TEMP\soundpub-browser-39720-1793186388111\results.json`, `mobile.png`, `tablet.png`, `desktop.png`. Parsed actual results, not Agent B's prior counts:

| Viewport | Implemented checks | Real API responses | Roster document overflow | Result |
| --- | --- | --- | --- | --- |
| Mobile 390×844 | 16 | 75 | None | PASS |
| Tablet 768×1024 | 16 | 76 | None | PASS |
| Desktop 1440×900 | 16 | 76 | None | PASS |

Each set of 16 recorded checks includes two explicitly labeled API-probe groups. Therefore this is not a claim of 16 distinct UI flows per viewport.

Actual fresh stack: Vite/proxy `http://127.0.0.1:62898`, real backend `http://127.0.0.1:62897`, PostgreSQL `127.0.0.1:57729/soundpub_test_browser`, unique container `soundpub-browser-39720-1793186388111`. Blank database applied migrations 0001–0007. Runtime SQL uses `soundpub_app` via role selection; separate restricted-login handshake is established by backend integration, not this browser harness. Synthetic identity bindings are resolved against real DB on requests. No backend response is mocked; controlled 500 is thrown by a harness-only backend hook, and network failure aborts connection. Vite uses `envDir:false` and synthetic frontend configuration.

Independently verified actual UI flows at every viewport:

- Roster list, required-field prevention, create and edit with independent SQL checks and persisted browser reload.
- Admin Users role dialog transfer to Label B, SQL parent B and persisted Users row; independent artist assign to Label A, SQL parent A and persisted Users row.
- Whitelabel roster confirmation detach, SQL null parent and artist absence after reload. Synthetic label role is temporarily changed to whitelabel; ordinary label card deletion-request UI is a different path.
- Invalid 51-character phone produces real 400 and visible `VALIDATION_ERROR`, SQL phone unchanged.
- Identity verification revoked after loading edit dialog produces real 401 and visible `UNAUTHENTICATED`, dialog retained. This is loaded-session identity denial, not full login-screen acceptance.
- Label authority revoked after loading create dialog produces real 403 and visible `FORBIDDEN`, dialog retained and no artist row.
- Missing Artist detail route produces real 404 and visible product error.
- UI transfer after competing API detach produces real 409, visible `CONFLICT`, retained dialog and SQL still detached. API detach only establishes conflict precondition; subsequent transfer submission is actual UI.
- Controlled backend 500 has visible error, stable request count over 1.2 seconds and manual recovery; aborted roster connection has visible error and manual recovery.

Browser fetch list/detail Artist/Label and initial transfer/assign/detach/status probes remain API evidence only. SQL assertions independently read persisted rows inside the harness; browser history fixtures are absent. Populated historical non-rewrite is proved separately by fresh backend tests. Error strings remain raw codes; no claim of comprehensive localization, every error's retry behavior, all-dialog visual review or exhaustive optimistic-state checks.

Teardown reports browser/server/pools closed and owned container removed. Independent `docker ps -a --filter 'name=soundpub-browser-39720-1793186388111' --format '{{.Names}}'` returned no container. Non-frontend-origin browser requests are aborted before network access. Recorded attempts include local synthetic Supabase profiles/settings/notifications/role-stat endpoints and Google Fonts; these are not successful business traffic and must not be hidden by a global zero-Supabase-request claim.

## Production isolation and ownership

Production data imported: NO. Production credentials used: NO. Production traffic switched: NO. Shared Supabase mutated: NO. No SSH, deployment, shared/production host connection or project `.env` edit occurred. All database fixtures were synthetic on owned local containers. Only this report is edited by Agent F; build output and logs are generated artifacts. Final report and product source remain owned by other agents.

## Exact remaining acceptance gaps

1. **Dedicated Label list/detail page acceptance:** `src/App.tsx` contains no dedicated Label list/detail route. Label selection is exercised in the actual transfer/assign dialog, and roster is exercised through My Artists. `/api/v1/labels` and `/api/v1/labels/:id` fetches do not prove dedicated page/detail rendering or associated error states. Absence of a route is recorded as missing acceptance surface, not silently waived.
2. **Label-specific validation/stale-authority/error coverage:** exercised 400/401/403/404/409 controls operate on artists/current relationships. Label metadata create/edit forms and their own validation/denial/persisted detail behavior are not exercised. Label lifecycle remains deferred under existing contract; this report does not expand implementation scope or count Artist errors as all Label errors.
3. **Successful full Artist detail-page acceptance:** successful detail reads/editing occur in roster edit dialog; full Artist detail route is tested only for missing-entity 404. Successful full-page read/edit/reload and its complete error matrix remain unproven. `/dashboard/artists` routes to `MyArtists`; no separate additional Artist listing coverage is inferred.
Source freeze, independent fresh browser rerun, actual UI transfer/assign/detach and specified Artist/relationship HTTP-error checks are now complete. They are no longer blockers. Backend, repair, historical/concurrency, authorization, scoped static/routing checks, frontend build and production isolation PASS for documented scope. Full broad browser acceptance remains BLOCKED by the gaps above.

Independent QA execution: **COMPLETE**. Overall closeout acceptance: **BLOCKED**. Artists/Labels: **NOT DECOUPLED** under the original broad browser gate. Coordinator must resolve remaining acceptance gaps or explicitly approve a revised acceptance scope; this QA does not waive requirements.
