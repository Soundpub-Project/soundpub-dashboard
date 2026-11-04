# Phase 3B Final Browser Execution Log

Date: 2026-10-28 (Asia/Bangkok). Final run exit: 0. Source: `docs/migration/phase3b-final-browser.ts`.

`$env:PLAYWRIGHT_PACKAGE_JSON='C:\Users\bimok\AppData\Local\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright\package.json'`

`node --import ./backend/node_modules/tsx/dist/loader.mjs docs/migration/phase3b-final-browser.ts`

| Viewport | Result | Asserted checks | Backend Artist/Label responses with request ID | Missing IDs | Unexpected direct Supabase Artist/Label |
| --- | --- | ---: | ---: | ---: | ---: |
| Mobile 390x844 | PASS | 27 | 63 | 0 | 0 |
| Tablet 768x1024 | PASS | 27 | 64 | 0 | 0 |
| Desktop 1440x900 | PASS | 27 | 64 | 0 | 0 |

Final owned container: `soundpub-browser-41964-1793193176505`, fresh database `soundpub_test_browser`, PostgreSQL 17 on loopback only. It was removed by harness; no persistent volumes. Three viewport runs share the owned database and use distinct per-viewport Artists; each assertion checks its own state. No production/shared host was contacted.

Raw execution evidence: `docs/migration/phase3b-final-browser/results.json`, `docs/migration/phase3b-final-browser/browser.log`, and viewport screenshots in that directory. Backend logs contain method, route, status and matching request IDs; browser records include request IDs. Proxy is Vite `/api` -> loopback Fastify, not a response fixture. Only external origins are blocked; browser errors abort connections without supplying a mock response.

Backend regression on separate owned disposable PostgreSQL: 100 passed, 0 failed, 0 skipped. Earlier unconfigured run had 3 DB skips and is not final regression evidence. Backend typecheck, frontend adapter/client/routing tests, isolation scan and Vite build pass (existing large-chunk warning).
