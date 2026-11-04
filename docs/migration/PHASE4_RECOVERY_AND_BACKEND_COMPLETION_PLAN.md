# Phase 4 Recovery and Backend Completion Plan

Status: IN PROGRESS

Baseline: 2026-11-02 Asia/Bangkok

## Changed circumstance

The former production Supabase installation is unavailable: local files were lost and its Docker services cannot start. Phase 3E gates requiring fresh read-only access to that installation can no longer run as written.

Phase 4 uses the preserved encrypted backup as recovery evidence and completes the independent backend as the future runtime authority. This plan does not approve production cutover.

## Verified baseline

- All 24 backup artifacts passed SHA-256 and AES-256-GCM verification.
- Manifest scope: 33 SoundPub tables, 198 Auth users, 2,339 Storage object rows, and 2,409 physical files.
- Backup was captured sequentially from a live source; it is not an atomic database/Auth/Storage snapshot.
- Backend tests: 194 total, 190 passed, 0 failed, 4 skipped.
- Backend typecheck passed.
- Frontend production build passed with a large-chunk warning.
- Current scan: 81 frontend TypeScript files reference Supabase; 53 reference backend API code.
- Legacy tree contains 34 Edge Function directories.
- Working tree contains extensive uncommitted migration work and must not be reset or cleaned.

## Target state

- Fastify `/api/v1` is the only application API.
- Dedicated PostgreSQL is the only business-data write authority.
- Private S3-compatible storage is the only media write authority.
- One approved identity provider maps provider subjects to stable application user IDs.
- Supabase code remains read-only migration reference until parity evidence permits removal.

## Hard rules

1. No server mutation during audit and recovery design.
2. Never inspect, stop, restart, rebuild, or modify the currently running production Docker deployment.
3. Local Docker work must use the exact isolated Compose project name `dashboard-sounpub-dev` and separate containers, networks, volumes, ports, env files, and credentials.
4. No direct restore into an active environment.
5. No dual writes between Supabase and backend.
6. No legacy session or refresh-token migration without an approved security design.
7. No financial posting inferred from local `PAID` values alone.
8. No composer allocation before identity, share, correction, replay, and payout rules are approved.
9. No cutover while browser, reconciliation, security, or rollback gates remain open.

## Workstreams

### A. Preserve recovery evidence

- Record inventory, hashes, source scope, and key custody without exposing the key.
- Keep a second verified encrypted copy outside the repository.
- Keep originals immutable; decrypt only into a private ignored location.

Exit: two verified encrypted copies and documented recovery ownership.

### B. Build source-to-target contract

- Extract the 33-table schema in an isolated workspace.
- Map each table, identity, bucket, RPC, trigger, policy, and Edge Function to a backend module or retirement decision.
- Classify each frontend Supabase call as replaced, pending, retired, or blocked.

Exit: zero unclassified runtime dependencies.

### C. Complete domain parity

Priority:

1. Identity, users, roles, status, impersonation, and ownership.
2. Artists, labels, releases, tracks, contracts, submissions, and media.
3. Notifications, settings, email, audit logs, and exports.
4. Royalties, balances, payouts, payments, invoices, refunds, and reconciliation.
5. Copyright, composers, takedowns, providers, and remaining admin tools.

For each domain, freeze expected behavior, close API and authorization gaps, add database constraints, add tests, switch reads, then switch writes with no fallback write path.

Exit: one authority and complete acceptance evidence per domain.

### D. Build repeatable recovery importer

- Restore only into disposable PostgreSQL and object storage.
- Preserve stable IDs where contracts require them.
- Map identities without importing active sessions or refresh tokens.
- Import database, identity references, Storage metadata, then objects using explicit ordering.
- Produce counts, orphan reports, checksums, financial reconciliation, and rejected-record output.

Exit: two fresh isolated restores produce identical accepted and rejected results.

### E. Finish frontend cutover

- Replace remaining PostgREST, RPC, Edge Function, Storage, Auth, and Realtime calls.
- Remove development-only routing after each domain becomes authoritative.
- Test offline, timeout, expired identity, forbidden role, missing media, replay, and provider failures.

Exit: production build contains no unintended Supabase URL, key, client, or financial egress.

### F. Release operations

- Define environment separation, secrets, migrations, backups, restore drills, logs, metrics, alerts, and rollback.
- Run security, API, database, backend, performance, and browser acceptance.
- Reconcile imported totals and provider evidence before enabling finance.

Exit: independent review approves release.

## Immediate slice

1. Preserve backup and document second-copy custody.
2. Generate current frontend Supabase and Edge Function inventory.
3. Compare inventory with backend routes and reach zero unclassified dependencies.
4. Close first incomplete non-financial domain end to end.
5. Keep financial and composer posting disabled until reconciliation contracts are approved.

## Completed baseline actions

- Added scoped backend safety and migration instructions in `backend/AGENTS.md`.
- Verified every encrypted backup artifact with its detached key; 24 of 24 passed.
- Ran the backend suite: 190 passed, 0 failed, 4 environment-gated skips.
- Ran backend typecheck and frontend production build successfully.
- Removed the development-only restriction from domain routing. Backend domains now activate only through explicit `VITE_SOUNDPUB_BACKEND_DOMAINS` membership in any build mode; current local env files enable zero domains.
- Updated and passed the focused frontend routing and users-adapter test.
- Completed public catalog frontend cutover: `/catalog` now uses `/api/v1/public/releases` only and no longer invokes the legacy `get-catalog-tracks` Edge Function.
- Passed the isolated PostgreSQL public-catalog API test, Release/Track Supabase static gate, and frontend production build after cutover.
- Isolated local Compose under exact project name `dashboard-sounpub-dev`, dedicated image tag, scoped volumes/networks, and default loopback ports API `3300`, PostgreSQL `55433`, and object storage `9100`.
- Locked backend Docker npm scripts and documentation to `-p dashboard-sounpub-dev`; Compose configuration validation passed without starting containers.
- Started only the isolated `dashboard-sounpub-dev` project. PostgreSQL, object storage, backend, and worker became healthy on loopback ports; production Docker was not inspected or modified.
- Passed live development smoke checks for health, readiness, public catalog, authenticated identity resolution, admin denial for a normal user, and admin user listing.
- Confirmed Users core backend is functional, while browser activation remains blocked by the missing production OIDC/Keycloak adapter and remaining Supabase account-lifecycle flows.
- Confirmed standalone SoundPub authentication as the primary model; Keycloak remains partner SSO only.
- Added and applied dev-only migration `0019_local_auth.sql` for credentials, opaque sessions, and one-time tokens, plus tested `scrypt` password and opaque-token primitives.

## Current blockers

- Backup is valid but sequential rather than atomic.
- Source-to-target classification must be regenerated against current files.
- Four backend tests skip when optional disposable database URLs are absent.
- Composer identity and allocation remain unresolved.
- Opening adjustments and provider settlement evidence remain unresolved.
- Browser acceptance retains offline royalty-refresh and slow payment-read failures.
- Working tree lacks a clean migration checkpoint.

## Completion gate

Phase 4 completes only after repeatable recovery dry runs, zero unclassified dependencies, complete parity evidence, passing security and browser gates, passing rollback and restore drills, independent review, and explicit production-cutover approval.
