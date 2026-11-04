# Phase 3C Independent QA

Date: 2026-10-28, Asia/Bangkok. Final local source review and independent validation. No production access, SSH, deployment, provider call, live Supabase database or credential read. Only this report edited.

## Verdict

**PASS for implemented Release/Track metadata slice. FAIL/BLOCKED for full Phase 3C parity.** Routes, restricted grants, current-management authority, versioned aggregate writes, frontend guards, focused API/race behavior, build and three-viewport happy path have direct evidence. Media, payments/invoices/refunds, activation/distribution, complete aggregate submission, public catalog and full browser error/race matrix remain unresolved. Disabled workflows are safe boundaries, not parity passes.

## Final candidate re-review

- `backend/src/api/index.ts` registers `registerReleaseTrackRoutes`; `backend/src/api/release-tracks.ts` exposes Release list/create/detail/update/delete and Track list/create/detail/update/delete/reorder; `backend/src/main.ts` injects both services.
- `backend/migrations/0008_release_tracks.sql` grants named columns to `soundpub_app`, denies direct version writes and Release DELETE, and uses `release_track_guard` for versions and immutable historical IDs. Repositories no longer assign trigger-owned versions. Previous route, grant and Track-list findings are closed by source and execution.
- Release and Track services reload and lock current DB principals and verified Artist/Label management. Historical Label/creator IDs stay immutable attribution. Former Label denial and new manager access passed; current authority matches `PHASE3C_RELEASE_STATE_MACHINE.md` and clarified `PHASE3C_DATABASE_MODEL.md`.
- Latest actor-authority removal race: `phase3c-concurrency.test.ts` blocks a Release write behind an actor status lock, commits suspension, then asserts `403` and unchanged title. Independently rerun as part of focused 23/23. This proves that tested race, not every possible role/transfer interleaving.
- `PHASE3C_FINAL_REPORT.md` and `PHASE3C_SECURITY_REPORT.md` retain overall blocked decision. Reports are context, not substitute for executions below.

## Independent validation

| Gate | Result |
| --- | --- |
| Focused Release/Track service, disposable HTTP and race tests | **23/23 pass, 0 skip**; independently rerun after latest race fix |
| Full backend `npm test` | **113 total, 109 pass, 0 fail, 4 environment-gated skips** |
| Separate restricted-login `release-track-db.test.ts` on disposable loopback PostgreSQL | **1/1 pass, 0 skip**; runtime asserted `soundpub_app`; container removed |
| `npm run typecheck` from `backend` | **PASS** |
| `npm run security:check` from `backend` | **PASS**: isolation and secret scan |
| `node src/components/releases/backend-mode.test.cjs` | **PASS**: guards and API contracts |
| `npm run build` from root | **PASS**, 3332 modules; existing chunk-size warning |
| `docs/migration/phase3c-browser.ts` with cached Playwright | **PASS core happy path** at 390x844, 768x1024, 1440x900 |

Full-suite skipped files: `api-artists-labels-db.test.ts`, `api-users.test.ts`, `db.test.ts`, `release-track-db.test.ts`. Only last is Phase 3C specific; it passed separately with owner/runtime URLs. Other three remain skipped here. Self-provisioned Phase 3B history/concurrency tests ran within 109 passes. Focused HTTP test covered selected `400/401/404/409` failures, accepted Release/Track CRUD and OpenAPI; deterministic race test covered seven aggregate/authority cases. Restricted-login DB test covered grants, immutable owners, versions, FK/order constraints, same-version writer race and rollback.

## Guarded frontend calls

Literal `.from('releases'|'tracks')` scan of `src` TS/TSX found **70 legacy call sites: 35 Release and 35 Track across 18 files**. Reviewed backend-first returns in Releases, ReleaseDetail, Tracks, Dashboard and CSV exports; ReleaseCreate/Edit use `BackendReleaseForm`; Release dialog wrappers, Invoices, MediaLibrary, Takedown, UploadRoyalty and WhitelabelDashboard block legacy mounts; LandingPage returns before `get-catalog-tracks`. Guard test passed. Legacy textual references do not equal backend-mode requests.

**Exact unexpected backend-mode direct Release/Track Supabase business calls in reviewed guarded pages: 0.** Browser observed **0** direct Release/Track PostgREST or Release/Track RPC requests on exercised paths and **30 accepted backend Release/Track API responses, 10 per viewport, all HTTP 200**. Browser verified persisted Release create, Track create/reload/delete and Release detail/list against disposable PostgreSQL. This is guarded-source and exercised-browser evidence, not application-wide network tracing.

## Unresolved blockers

| Workflow | State |
| --- | --- |
| Atomic Release plus initial Track create/edit; complete submit/resubmit | BLOCKED: metadata-only form disables submission and saves rows separately |
| Artwork/audio/clip upload, playback and media reference lifecycle | BLOCKED; Phase 3D dependency |
| Paid state, invoice, callback and transactional refund/delete | BLOCKED; Release delete deliberately `409` |
| Activation and distribution with Track/ISRC validation | BLOCKED; activation deliberately `409` |
| Public catalog | BLOCKED; backend mode returns empty result |
| Invoice, Takedown, royalty upload, media orphan scan, Whitelabel combined views | DEFERRED behind unavailable UI, not migrated |
| Three-viewport loading/empty and `401/403/404/409/500/network/recovery`, stale-authority and historical-transfer display matrix | NOT RUN in browser; selected failures covered by API tests only |

**Phase 3C decision: NOT DECOUPLED.** Metadata-slice PASS does not authorize production cutover or full Phase 3C PASS. Source hashes must be refreshed if concurrent edits continue.
