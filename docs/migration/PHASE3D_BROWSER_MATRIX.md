# Expanded browser matrix

## Final closeout addendum (2026-10-29)

Real Vite/proxy/backend/disposable PostgreSQL/RustFS browser matrix now includes anonymous light/dark/favicon signed image delivery through admin UI, safe audit detail UI, inactive-admin denial, label/audio forged binding denial and audio size limit. Historical 84-check run below predates these additions. Final artifacts: `C:/Users/bimok/.codex/visualizations/2026/10/29/01a185a4-4cdb-7183-af76-b3927c51f1d0/phase3d-browser-final-8/`. See final report for authoritative result. Six out-of-scope royalty RPC attempts on denial redirects were blocked by browser egress rule; migrated-domain calls remain zero.

Continuation execution, 2026-10-29: **84 PASS, 0 FAIL; exit 0; {'mobile': 28, 'tablet': 28, 'desktop': 28}**. This supersedes the earlier 36-check core result for browser coverage, without discarding historical evidence. Expanded requirements remain **PARTIAL** because audit detail has no product browser control and human audibility cannot be measured headlessly.

Evidence directory: `C:/Users/bimok/.codex/visualizations/2026/10/29/01a185a4-4cdb-7183-af76-b3927c51f1d0/phase3d-browser-expanded-verified/`. Contains exact executed `harness.ts`, `browser-results.json`, `browser.log`, `browser.exit`, per-viewport settings/audit screenshots and denial JSON. Executed command from repository root:

```powershell
node --import ./backend/node_modules/tsx/dist/loader.mjs docs/migration/phase3d-browser.ts <absolute-disposable-evidence-directory>
```

Dedicated UUID PostgreSQL and RustFS containers, random loopback ports, real migrations/services/UI, synthetic identity adapter backed by real principal lookup. Docker Desktop named-pipe context asserted. No domain responses mocked. Notification loading delays real requests; PUT/completion fault cases abort transport; unauthorized UI cases remove Authorization before forwarding to real backend. External browser traffic blocked. No production/shared service used or mutated. Existing dirty tree preserved; writes limited to four assigned files and disposable evidence. No source/backend changes. No subagent tool was available; this is direct execution, not a second-agent review.

Zero browser page errors. Network response counts (not test counts): `{'200': 899, '409': 3, '500': 8, '403': 9, '401': 12, '404': 6, '400': 9}`. Blocked external requests: 426; paths: `['/css2', '/rest/v1/rpc/get_royalty_monthly_summary', '/rest/v1/rpc/get_royalty_platform_summary', '/rest/v1/rpc/get_royalty_stats']`.

| Check | Mobile 390x844 | Tablet 768x1024 | Desktop 1440x900 |
| --- | --- | --- | --- |
| Avatar UI upload, replace, display, reload | PASS | PASS | PASS |
| Label logo UI upload, replace, reload | PASS | PASS | PASS |
| Dark logo UI upload, replace, reload | PASS | PASS | PASS |
| Invalid size UI rejects empty and oversized logo without upload intent | PASS | PASS | PASS |
| Interrupted real PUT UI error and retained logo | PASS | PASS | PASS |
| Missing completion UI error; prior binding retained after reload | PASS | PASS | PASS |
| Keyboard Tab reaches notification; Enter opens; Escape returns focus | PASS | PASS | PASS |
| Settings stale version real 409 rendered in UI | PASS | PASS | PASS |
| User settings UI persists | PASS | PASS | PASS |
| Release cover UI upload, replace, reload; real readiness | PASS | PASS | PASS |
| Track audio UI upload, complete, reload and readiness | PASS | PASS | PASS |
| Track audio UI invalid MIME error | PASS | PASS | PASS |
| Audio product playback | PASS | PASS | PASS |
| Notification empty and loading real UI | PASS | PASS | PASS |
| Announcement real service delivered and read through inbox UI | PASS | PASS | PASS |
| Notifications UI list/read/read-all/reload | PASS | PASS | PASS |
| Notifications controlled real server failure UI | PASS | PASS | PASS |
| Browser API denial/validation/secret projection (API evidence) | PASS | PASS | PASS |
| 400 invalid settings types and secret writes; 404 absent audit API | PASS | PASS | PASS |
| Ordinary user audit route denial UI | PASS | PASS | PASS |
| Settings unauthorized real 401 UI | PASS | PASS | PASS |
| Notification unauthorized real 401 UI | PASS | PASS | PASS |
| Settings viewport no horizontal document overflow | PASS | PASS | PASS |
| Admin settings UI save and persisted reload | PASS | PASS | PASS |
| Admin settings live role revocation 403 UI | PASS | PASS | PASS |
| Audit UI list/filter and bounded pagination control | PASS | PASS | PASS |
| Audit malformed actor real 400 UI | PASS | PASS | PASS |
| Audit real multi-page traversal and safe UI projection | PASS | PASS | PASS |

Network caveat: ordinary-user audit denial redirects to dashboard, which attempted six royalty RPC requests (two each get_royalty_stats, get_royalty_monthly_summary, get_royalty_platform_summary); all were blocked before network delivery. Do not claim zero attempted Supabase business requests for this expanded run. Console errors include handled TEMPORARY_FAILURE messages; zero page errors means no uncaught pageerror events, not a clean console. All eight HTTP 500 responses belong to the controlled notification outage (four list, four unread-count).

Evidence limits: interrupted PUT is a browser connection-reset injection before delivery, not a proven mid-stream partial-byte server failure. Missing completion aborts request before server receives it; no lost-response-after-commit claim. Empty/oversized size checks cover label-logo boundaries; no exhaustive 500 MiB audio boundary. Image checks confirm displayed element, not pixel/decoder correctness. Keyboard covers Tab reachability, Enter open and Escape focus return for notification popover; no full accessibility audit or focus-ring contrast proof. Audio uses generated 1-second nonzero 440 Hz PCM WAV through real UI upload and product audio element; play() succeeds and currentTime advances while unpaused, but no speaker/loopback recording. Announcement created through real service fixture and consumed/read via inbox; announcement-management UI not covered. Settings invalid types/unknown secret writes and public projection use browser fetch API assertions, not form manipulation; no seeded persisted-secret leakage proof. Audit detail and missing/forged-resource 404 are API-only; product audit table has no detail action. Audit safe projection seeds synthetic secret metadata, checks UI omission and detail API omission. UI covers 400 audit filter, 401 settings/inbox, 403 live admin revocation, 409 stale settings; 404 UI rendering remains untested. Signed URL expiry, exhaustive roles/concurrency and recovery cleanup of pending uploads remain outside this run.

- `browser-results.json` SHA-256: `93bb2b6a5b959c67d1f46a20f21e8fdf5b25c60950a4a77d0b3078dedf809e60`
- `browser.log` SHA-256: `754293f942ec0e377b266d9fb1a910ec048f660acdfdb56f956ad6b3a28c9171`
- `harness.ts` SHA-256: `fb1dccf917620fee17fb79c27976a151831ff9dc5a7c942bccbb4a523b6482fe`

---

Historical evidence retained verbatim below; earlier PASS statements apply only to their documented core scope.

# Phase 3D browser matrix

Final reviewed status: **PASS — 36 passed, 0 failed, exit 0**. Coordinator executed final run; Agent G independently reviewed JSON/log/exit/denial evidence. Supersedes initial 27/9 and intermediate 33/3 results.

Actual local frontend/proxy/backend domain services/disposable PostgreSQL/RustFS; synthetic identities; no domain API response mocks. Core acceptance matrix:

| Check | Mobile 390x844 | Tablet 768x1024 | Desktop 1440x900 |
| --- | --- | --- | --- |
| Avatar upload/replace/display element/reload | PASS | PASS | PASS |
| Label light logo upload/replace/display element/reload | PASS | PASS | PASS |
| User preferences save/reload | PASS | PASS | PASS |
| Cover upload/replace/reload; real media readiness | PASS | PASS | PASS |
| Audio upload/complete/reload; real readiness | PASS | PASS | PASS |
| Invalid audio MIME UI error | PASS | PASS | PASS |
| Notification list/read/read-all/reload | PASS | PASS | PASS |
| Controlled real notification server failure UI | PASS | PASS | PASS |
| Browser API denials/public secret projection/forged resource | PASS | PASS | PASS |
| Settings document horizontal overflow check | PASS | PASS | PASS |
| Superadmin settings save/reload | PASS | PASS | PASS |
| Superadmin audit list/filter/pagination control | PASS | PASS | PASS |

Each viewport: 12/12. Last check: desktop audit PASS. Zero page errors. 210 non-loopback font CSS requests blocked; zero recorded migrated Supabase business requests. Network statuses: 502 responses with 200, 3 with 401, 6 with 403, 3 with 404, 6 controlled failures with 500. These are response counts, not case counts; expected negative-path responses passed assertions.

Final evidence: `C:/Users/bimok/.codex/visualizations/2026/10/29/01a185a4-4cdb-7183-af76-b3927c51f1d0/phase3d-browser-final-2/`. Reviewed browser-results.json, browser.log, browser.exit and per-viewport denial JSON. Browser log contains 36 final PASS entries; exit file is 0. Settings/audit PNGs available there. No independent final browser rerun performed.

Closed earlier failures: string query schemas fix notification/audit 400s; explicit fixture variant/visibility permits forged-resource authorization test; monotonic request_order migration addresses replacement race. Broader matrix limits remain: image element visibility is not separate decoder verification; audio readiness is not audible playback; pagination control check is not exhaustive multi-page traversal; no exhaustive dark-logo, interruption/expiry/size, announcement, keyboard or race matrix claimed.

## Authoritative final result

**87 PASS, 0 FAIL; mobile/tablet/desktop 29 each; 0 page errors; 0 gaps.** Evidence and hashes are recorded in `PHASE3D_FINAL_REPORT.md`. Historical runs below remain provenance only.

