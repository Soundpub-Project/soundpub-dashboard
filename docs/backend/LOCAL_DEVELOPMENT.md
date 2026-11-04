# Local development

Status: tested isolated Phase 2 runtime. Root frontend commands remain unchanged; backend commands run from `backend/` or with `npm --prefix backend`.

## Prerequisites

- Node.js 22-24, npm, Docker Engine and Docker Compose.
- Copy `backend/.env.example` to ignored `backend/.env`; generate unique local-only values for PostgreSQL owner/app, RustFS access, mock webhook and dev token mappings.
- Never reuse production credentials, URLs, users, media or provider callbacks.

## Commands

| Purpose | Command |
| --- | --- |
| Install | `npm ci --prefix backend` |
| Typecheck/lint | `npm run typecheck --prefix backend` / `npm run lint --prefix backend` |
| Build | `npm run build --prefix backend` |
| Tests | `npm test --prefix backend` |
| Security scan | `npm run security:check --prefix backend` |
| Dependency audit | `npm audit --prefix backend --omit=dev --audit-level=moderate` |
| Compose validate | `docker compose -p dashboard-sounpub-dev --project-directory backend -f backend/docker-compose.yml config --quiet` |
| Compose up/down | `docker compose -p dashboard-sounpub-dev --project-directory backend -f backend/docker-compose.yml up -d --build` / `docker compose -p dashboard-sounpub-dev --project-directory backend -f backend/docker-compose.yml down` |
| Migration status | Set owner `DATABASE_URL`, then `npm run migration:status --prefix backend` |
| Guarded reset | Set owner `DATABASE_URL`, `DB_RESET_CONFIRM=soundpub_test`, then `npm run database:reset --prefix backend` |

## Runtime

Compose project `dashboard-sounpub-dev` runs PostgreSQL 17, API, worker, one-shot migrations, one-shot synthetic seed, RustFS S3-compatible object storage and a volume-permission helper. API, object storage and PostgreSQL bind only to loopback ports `3300`, `9100` and `55433` by default. Database/object traffic also uses internal network `isolated`; `ingress` exists only for loopback bindings. Never run these commands without the exact `-p dashboard-sounpub-dev` project selector.

`postgres` is bootstrap-only. Migrations use non-superuser `soundpub_owner`; API and worker use restricted non-superuser `soundpub_app`; synthetic seed uses non-superuser `soundpub_owner`. Runtime credentials cannot create tables or roles. Migrations are checksum-verified and transactional. Fresh Compose startup applies all backend migrations in order, then loads deterministic synthetic identities as migration owner.

API endpoints include `/health`, `/ready`, `/openapi.json`, `/api/v1/me`, admin suspension, private object upload/signed upload/download and idempotent notification enqueue. Readiness checks PostgreSQL and object storage. Worker polls PostgreSQL outbox with `FOR UPDATE SKIP LOCKED`, bounded retry and dead-letter handling.

## Tests

For mandatory DB repeatability, use the precreated disposable `soundpub_test` database through loopback `55433`:

```powershell
$env:DB_TEST_URL = 'postgres://soundpub_owner:<migration-password>@127.0.0.1:55433/soundpub_test'
npm test --prefix backend
Remove-Item Env:DB_TEST_URL
```

Only `soundpub_test*` databases and local service hosts are accepted. The reset command requires exact confirmation. `docker compose -p dashboard-sounpub-dev down` preserves volumes; use volume deletion only after confirming the exact project name.

Signed URLs use internal endpoint `object-storage:9000` for API I/O and `127.0.0.1:9100` for local consumers. Buckets remain private. No production migration or cutover is authorized by local success.



