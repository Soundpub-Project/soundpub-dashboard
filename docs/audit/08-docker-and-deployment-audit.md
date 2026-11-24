# 08 — Docker and Deployment Audit

Status: **DEVELOPMENT PACKAGING PRESENT; PRODUCTION CUTOVER PACKAGING INCOMPLETE**

## Root frontend packaging

- Root Compose defines one `web` service only (`docker-compose.yml:1-21`).
- Container name is `soundpub-dashboard` and port mapping is `8181:80` (`docker-compose.yml:7-10`).
- External network is used at `docker-compose.yml:29-31`.
- Root Dockerfile builds with Node 22 and serves static assets through nginx (`Dockerfile:1-54`).
- Build args and fail-fast checks for required Vite environment values are at `Dockerfile:6-35`.
- nginx denies exports/test pages and falls back to SPA routing (`nginx.conf:1-19`).

Gaps: no documented health check, TLS termination, HSTS, security headers, rate limiting, container resource limits, or production log pipeline were found in the root packaging. These may be handled upstream, but the repository does not provide evidence.

## Backend development packaging

- Backend dev stack uses Compose project `dashboard-sounpub-dev` (`backend/docker-compose.yml:1`).
- Local-only Postgres and object-storage ports are at `backend/docker-compose.yml:19-20,47-48`.
- Backend API port is at `:129-136`; frontend dev port at `:171-180`.
- Internal networks and volumes are at `:182-188`.
- `backend/package.json:25-27` enforces the same Compose project name.

This separation is good: it prevents accidental reuse of the backend dev stack as production. The runtime config gate agrees by rejecting environments other than `development` and `test` (`backend/src/config/database-target.ts:21-24`).

## Deployment policy conflicts

- `AGENTS.md:14` requires every new or changed Edge Function to be deployed through `scp`, not `supabase functions deploy`.
- `AGENTS.md:16-18` requires uploading only intended function directories and shared files, preserving remote secrets/config, reloading or rebuilding, and verifying endpoint/container logs.
- `scripts/deploy-fixed-functions.ps1:14-16` calls `supabase functions deploy $func`.
- `scripts/deploy_functions.sh:60-63` calls `supabase functions deploy $func --project-ref $ENV`.

These scripts conflict with repository instructions and must not be used for self-hosted Supabase Edge Function deployment until corrected or explicitly retired.

## Self-hosted Supabase context

- `AGENTS.md` requires direct SSH target `maskhar@20.20.20.3` for Supabase operations.
- Docker directory on the server is `/data/supabase/instances/supabase-01/config`.
- Confirmed Edge Function source volume: `/data/supabase/instances/supabase-01/config/volumes/functions`.
- The Docker Compose service name is `functions`; it reads `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` through Compose environment interpolation.
- Required recreate command from the Docker directory is `docker compose up -d --force-recreate functions`.

No SSH or server operation was performed during this audit.

## CI/CD

Audit-time finding: no CI configuration was found under common GitHub, GitLab, Azure, Jenkins, Bitbucket, CircleCI, Travis, or Cloud Build paths. Local follow-up added `.github/workflows/ci.yml` covering lint, secret scan, contract tests, frontend build, browser egress, backend typecheck, backend build, and backend tests with dummy env only. Docker-dependent tests are still not included, and the first remote run plus branch protection remain unverified.

## Required production gates

- Correct or retire Edge Function deployment scripts that call the Supabase CLI.
- Define production backend service packaging separate from `dashboard-sounpub-dev`.
- Add health checks, TLS, HSTS/security headers, rate limiting, resource limits, structured logs, and alerting.
- Add CI with required checks for root and backend scripts.
- Document a tested rollback procedure; DNS-only rollback is insufficient after target writes (`SUPABASE_MIGRATION_AUDIT.md:158`).
- Obtain explicit approval before any production deployment or cutover.

## Finding

Development packaging is isolated and useful, but production deployment evidence is incomplete and deployment policy conflicts remain unresolved.
