# Phase 2 execution log

Snapshot: 2026-10-28 (Asia/Bangkok). Isolated local Docker only; no production SSH, shared infrastructure mutation, provider callbacks, production credentials or frontend cutover. Existing unrelated worktree changes preserved. This supersedes earlier stale 30-test snapshot.

## Foundation delivered

- Dedicated Compose PostgreSQL 17, RustFS, non-root API and worker, private service network plus loopback host bindings; the port-publishing bridge is not a hard egress firewall.
- Five ordered, checksum-protected and repeatable migrations; separate non-superuser `soundpub_owner` migration and `soundpub_app` runtime accounts. Migration test copies all five migration files and uses disposable `soundpub_test` only. Synthetic seed runs as migration owner; API/worker retain restricted app credentials.
- DB-backed mock principals and active-status authorization; admin audit/outbox; private S3-compatible storage with signed staging/verified completion and MIME byte signatures; transaction-bound idempotency, signed webhook receipt, retry/dead-letter outbox and mock providers.
- Versioned API, structured errors and OpenAPI request/response contracts; route rate limits, request timing, aggregate API/worker/DB/queue metrics, storage-dependent readiness, heartbeat health and graceful SIGTERM.

## Commands and results

- `npm test --prefix backend` with explicit local `DB_TEST_URL` to `soundpub_test`: 33 passed, 0 failed, 0 skipped. Only disposable test schema reset; `soundpub_dev` left intact.
- `npm run typecheck --prefix backend`, `npm run build --prefix backend`, `npm run lint --prefix backend`, `npm audit --prefix backend --omit=dev --audit-level=moderate`, `node backend/scripts/check-isolation.mjs`: passed; npm audit found 0 vulnerabilities.
- `docker compose --project-directory backend -f backend/docker-compose.yml up -d --build`: passed. Four services healthy, local `/health` and `/ready` returned 200.
- Local PostgreSQL role probe: both app and owner non-super, no CREATEDB/CREATEROLE/BYPASSRLS. Runtime schema DDL denied; user/role INSERT, storage DELETE, ledger INSERT and audit UPDATE denied; audit INSERT permitted.
- Signed-download storage rate probe: 120 x 404, then 5 x 429. Synthetic image/png request with incorrect byte signature: 400. OpenAPI notification route documents `Idempotency-Key` and 200/400/401/403/404/409/413/415/429/500/503 responses. CLI and seed reject PostgreSQL URL query host override before connection.
- Local idle API DB connection terminated; API remained running without restart, `/ready` 200. Local DB temporarily stopped; `/ready` 503 and worker heartbeat script exit 1; after restart `/ready` 200 and heartbeat exit 0. Backend/worker Compose health cadence reduced to five-second interval/three retries.

- After 0004, live `/api/v1/me` returned 200 and notification enqueue returned 200; worker logged processed. A request without JSON Content-Type returned 415 as expected.

- After 0005, role DELETE under owner credentials timed out with SQLSTATE `55P03` while API held matching authority lock; admin request completed 200 after release. DB migration test repeats this with a separate connection. 33/33 tests pass after fix.

## Boundaries

No real provider, production data migration, production Auth/Storage import, shared-Supabase change or traffic cutover. Mock-only side effects, in-memory per-instance rate limits, MIME signature rather than full decoder validation, and later tenant/domain RLS remain explicit ceilings. Independent QA required for final acceptance; see `PHASE2_INDEPENDENT_QA.md`.





