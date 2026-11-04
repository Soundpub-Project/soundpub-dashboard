# Phase 3B closeout browser acceptance — Agent B

Date: 2026-10-28 (Asia/Bangkok). Latest expanded live run: **PASS** for supported UI mutation/error matrix, mobile/tablet/desktop. Complete broad browser gate remains **BLOCKED** only for remaining page/Label-specific coverage described below. No backend response was mocked. API probes below are explicitly not product UI acceptance.

## Latest expanded run — authoritative results

This section supersedes earlier-run results and resolved blockers retained below for traceability. Exact command remains unchanged. Final command exit code **0**; each viewport passed **16 checks**, observed **76 real API responses**, and had no document overflow on final roster page.

Final artifacts: `I:\DevData\TEMP\soundpub-browser-26796-1793186165536\results.json`, `mobile.png`, `tablet.png`, `desktop.png`. Log: `I:\DevData\TEMP\phase3b-browser-agent-b.log`.

Actual final endpoints: Vite `http://127.0.0.1:65202`, Soundpub backend `http://127.0.0.1:65201`, PostgreSQL `127.0.0.1:50338/soundpub_test_browser`. Owned container `soundpub-browser-26796-1793186165536`, migrations 0001–0007, runtime role `soundpub_app`. Browser/API/DB remain exclusively loopback and disposable; no production access. Teardown succeeded; no `soundpub-browser-` container remained.

| Newly exercised product UI flow | Mobile | Tablet | Desktop |
| --- | --- | --- | --- |
| Admin Users → row menu Ubah Role → select label B → PINDAH LABEL → Simpan → real transfer → SQL parent B → reload row label B | PASS | PASS | PASS |
| Open same transfer UI toward A → competing real API detach → submit stale UI → 409 + visible CONFLICT + retained dialog + SQL remains detached | PASS | PASS | PASS |
| Admin Users independent artist → select label A + confirmation → Simpan → real assign → SQL parent A → persisted reload row | PASS | PASS | PASS |
| Whitelabel My Artists table → Hapus dari Label → confirmation → real remove → SQL null parent → reload artist absent | PASS | PASS | PASS |
| Edit dialog 51-character phone → submit → real 400 + visible VALIDATION_ERROR + independent SQL phone unchanged | PASS | PASS | PASS |
| Loaded edit dialog → synthetic identity verification removed in DB → submit → real 401 + visible UNAUTHENTICATED + dialog retained | PASS | PASS | PASS |
| Navigate missing Artist detail route → actual Artist GET 404 + visible product error with retry | PASS | PASS | PASS |

Earlier verified UI create/edit, persistence, client validation, controlled real backend 500/recovery, aborted connection/recovery, and role-revoked UI create 403 all passed again in this expanded run. Real DB role/identity changes produce errors; no response interception or fixture fulfills API requests. The competing detach sets up stale state; the assertion under test is the subsequent actual UI transfer and its real 409 handling.

No UI glue or product edits were needed. Reused `ChangeRoleDialog` through actual admin Users page. Independent assign uses existing artist role and null parent; dialog requires `PINDAH LABEL` even for assign. Detach uses existing whitelabel roster table because label-role cards expose deletion request instead. Harness temporarily changes only its synthetic label A role to whitelabel, then restores label role after detach. The admin dialog cannot directly select independent/null because artist requires a nonempty label. Existing Users banner incorrectly says transfer deferred despite working dialog; no source text edited by this agent.

Remaining broad coverage constraints: no dedicated Label list/detail product route was found in `src/App.tsx`; actual label list selection is exercised inside ChangeRoleDialog, while direct Label list/detail checks remain clearly labeled API probes. Successful full Artist detail-page editing remains outside this harness; successful Artist detail GET is covered via actual edit dialog, and missing full detail route is now exercised. No Label metadata create/edit form exists in this tested path; label creation/account lifecycle is deferred in current product. Historical Release/Royalty assertions belong to coordinator fixtures, not this browser harness. Complete broad gate must not be promoted based solely on these supported UI flows.

Final changed files remain only this report and `docs/migration/phase3b-closeout-browser.ts`. No product source, shared final report, `.env`, package manifest, lockfile, or production setting changed. Coordinator/QA: final harness edits complete and ready for independent fresh rerun.

## Prior run record (superseded where expanded above)

## Changed files

- `docs/migration/phase3b-closeout-browser.ts` — separate runnable live harness.
- `docs/migration/PHASE3B_CLOSEOUT_BROWSER_REPORT.md` — this report.

Shared final reports, product source, existing harness, package manifests, lockfiles, `.env`, and production settings were not edited by Agent B.

## Exact final command and result

Run from repository root in PowerShell:

```powershell
$env:PLAYWRIGHT_PACKAGE_JSON='C:\Users\bimok\AppData\Local\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright\package.json'
node --import ./backend/node_modules/tsx/dist/loader.mjs docs/migration/phase3b-closeout-browser.ts > "$env:TEMP\phase3b-browser-agent-b.log" 2>&1
```

Exit code **0**. Existing Node v24.22.1, Docker server 29.9.2, cached `postgres:17-alpine`, installed tsx/Vite/backend dependencies, and cached Playwright Chromium were available. No dependency installed.

Final artifacts: `I:\DevData\TEMP\soundpub-browser-9612-1793185781177\results.json`, `mobile.png`, `tablet.png`, `desktop.png`. Console/backend log: `I:\DevData\TEMP\phase3b-browser-agent-b.log`. These are local temporary evidence files, not tracked repo artifacts. Every rerun prints its unique output directory.

Final actual stack:

- Browser/Vite proxy: `http://127.0.0.1:59774`.
- Real Fastify Soundpub API: `http://127.0.0.1:59773`.
- Owned PostgreSQL: `127.0.0.1:65128/soundpub_test_browser`, isolated container `soundpub-browser-9612-1793185781177`.
- Blank database; actual migrations `0001_foundation.sql` through `0007_artists_labels.sql`; synthetic label A, label B, admin, and browser-created artists.
- Runtime queries use `SET ROLE soundpub_app`; no-login role under isolated bootstrap connection. This proves runtime SQL privileges, not a separate application login/password handshake.
- Synthetic local identity bindings are resolved through real DB principal repository on every request. Supabase session storage is initialized with synthetic tokens; production auth/provider integration is outside this harness.
- Proxy rewrites Origin to backend's existing allowed local development origin `http://127.0.0.1:8181`; nothing listens on or claims occupied port 8181.

## Actual UI acceptance

| Check | Mobile 390×844 | Tablet 768×1024 | Desktop 1440×900 |
| --- | --- | --- | --- |
| Product roster page and create dialog | PASS | PASS | PASS |
| Required fields disable create | PASS | PASS | PASS |
| UI create → real API transaction → independent DB parent row → browser reload | PASS | PASS | PASS |
| UI edit opens real detail GET, changes name → real PATCH → independent DB name → reload | PASS | PASS | PASS |
| Real backend controlled 500 → visible roster error → stable request count for 1.2 seconds → manual recovery | PASS | PASS | PASS |
| Roster network connection aborted → visible error → manual recovery | PASS | PASS | PASS |
| Loaded create dialog → label role removed in DB → UI submit denied 403 → visible FORBIDDEN, dialog retained, no artist row | PASS | PASS | PASS |
| Roster page horizontal document overflow | NONE | NONE | NONE |

Each viewport observed 39 real API responses. Error injections: a harness-only backend preHandler throws for Artist/roster requests during controlled failure; network failure aborts connection without fulfilling a response. No response fixtures or `route.fulfill` are used.

The 403 toast shows literal `FORBIDDEN`; denial is visible but localization/action guidance remains limited. Overflow checks cover final roster page, not every dialog or screenshot layout.

## Live browser API probes, separate from UI flows

At every viewport, browser `fetch` traverses the same local proxy and real backend:

- Artist list/detail and Label list/detail return 200.
- Invalid artist creation returns 400; unknown synthetic token returns 401; missing artist returns 404.
- Transfer to label B returns 200; independent SQL confirms current parent B; stale expected parent returns 409. Reloaded label A UI no longer renders moved artist.
- Detach returns 200; independent SQL confirms null parent. Assign back to label A returns 200; reloaded roster renders artist again.

These probes exercise actual services/transactions and persisted state but do **not** satisfy required UI transfer, detach, assign, Label detail/list, or error interaction acceptance. No populated historical Release/Royalty assertions are performed here; coordinator owns those fixtures/evidence.

## Remaining required acceptance blockers

- Product UI transfer/assign/detach controls were not exercised. Transfer control exists in `ChangeRoleDialog`; the roster menu exercised here exposes edit/deletion request. Complete admin Users interaction coverage is still needed.
- Full Artist list/detail page and Label list/detail page acceptance is incomplete; UI detail loading within edit and real API list/detail probes do not replace it.
- Required 400, 401, 404, 409 product error states remain unproven. Client required-field prevention, browser API statuses, and one visible stale-authority 403 must not be promoted to this full matrix.
- Label-specific validation and stale-privilege mutation cases beyond artist creation remain unproven.
- Full no-corruption/no-optimistic-update behavior for each error path is not established by this subset. Current checks independently prove no row for revoked-authority create and persisted successful create/edit/current-parent changes.

Therefore the final Phase 3B browser completion gate remains **BLOCKED**, despite all implemented live checks passing. No required unimplemented case is counted as PASS.

## Isolation and teardown

Every run creates its own uniquely named Docker container, fresh database, random synthetic bootstrap password, and dynamically assigned loopback DB/API/frontend ports. No existing database or schema is reused. All non-frontend-origin browser requests are aborted, including Google Fonts and deferred local Supabase settings/notifications/profile/role-stat requests; raw request lists preserve those attempts. This report makes no global zero-Supabase-reference claim.

Final cleanup closed browser, Vite, backend and pools, then removed only owned container. No named persistent volume used. `docker ps -a --filter 'name=soundpub-browser-' --format '{{.Names}}'` returned no containers after completion. Earlier harness-development setup failures and timing-race runs also removed their containers; they are not final acceptance evidence. TCP readiness was corrected to avoid PostgreSQL bootstrap Unix-socket readiness race.

No connection to `20.20.20.3` or `20.20.20.173`; no SSH; no production data, credentials, provider, or settings used. No shared final report edited. QA can rerun the exact command independently; it provisions and tears down its own stack.
