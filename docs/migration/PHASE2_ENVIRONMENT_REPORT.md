# Phase 2 environment report

Status: isolated local foundation running, 2026-10-28 (Asia/Bangkok). Supersedes the 2026-10-27 review, whose superuser and skipped-test findings were fixed. No production SSH, remote Supabase operation, provider call, or frontend routing change was performed.

## Isolation

- Compose project `soundpub-foundation-v2` uses local Docker Desktop and dedicated `soundpub_dev` PostgreSQL 17, RustFS object storage, API, worker, one-shot migration and seed containers. Database tests use only local disposable `soundpub_test`.
- Host bindings: API `127.0.0.1:3000`, PostgreSQL `127.0.0.1:55432`, object storage `127.0.0.1:9000`. An internal service network isolates service discovery; a standard bridge is also required for loopback port publishing and is not a hard egress deny. Runtime config rejects remote DB/storage targets, and providers are mocks.
- `postgres` bootstrap stays inside database container. `soundpub_owner` runs migration; `soundpub_app` runs API and worker. Both are non-superusers, without CREATEDB, CREATEROLE, or BYPASSRLS. Runtime CREATE TABLE denied. Runtime cannot write migration ledger or modify audit records, but can append audits.
- Runtime env permits only development/test and dedicated local database URLs. Query/fragment overrides fail before connection. Local `.env` is ignored and never printed. Docker context and source isolation scan checked; `npm audit --omit=dev` found zero vulnerabilities.

## Runtime and observability

- `docker compose --project-directory backend -f backend/docker-compose.yml up -d --build` built and started local PostgreSQL, RustFS, backend, worker; all four reported healthy. Migration and seed jobs exited successfully. `/health` and `/ready` returned 200.
- API emits JSON request ID, route, status and duration; periodic aggregate request/error/latency and DB pool logs. Worker emits outcome/retry/error counts, poll duration, bounded queue sample and pool counts. Neither emits tokens or signed URLs in sampled logs.
- An idle API PostgreSQL session terminated by exact local client IP did not restart API; `/ready` returned 200 after recovery. A local PostgreSQL outage returned `/ready` 503 and stale worker heartbeat check exited 1; both recovered after database restart. Compose backend/worker health interval is now 5 seconds with three retries; this shortens but cannot eliminate detection delay.
- Rate limiter applies to storage, async, admin and webhook routes; 125 same-IP signed-download attempts produced 120 resource 404 responses and 5 rate-limit 429 responses. In-memory map caps at 5,000 entries; distributed quotas require future shared state.

## Validation

- Full local test run with explicit owner URL for `soundpub_test`: 33 passed, zero failed/skipped. Build, typecheck, lint (TypeScript typecheck), isolation scan, and production npm audit pass.
- No production credential, user, session, financial row, private media, callback or provider integration entered Phase 2. Independent QA verdict is recorded separately in `PHASE2_INDEPENDENT_QA.md`; this report is not independent acceptance.



