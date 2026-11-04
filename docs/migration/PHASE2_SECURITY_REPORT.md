# Phase 2 security report

Evidence: 2026-10-28, approximately 02:00–02:03 UTC. Status: listed self-checks PASS; overall security/runtime acceptance NOT ESTABLISHED by this update. Implementation review and scoped self-checks, not independent QA. Author implemented MIME validation; that area has limited independence. No production endpoints contacted, source edited or deployment performed.

## Checks executed

Run from `backend/`:

```powershell
node --import tsx --test test/storage.test.ts test/storage-s3.test.ts test/auth.test.ts test/authorization.test.ts test/config.test.ts test/observability.test.ts
node --import tsx --test test/api.test.ts test/api-slices.test.ts test/webhook.test.ts
npm run typecheck
npm run security:check
npm audit --json
```

Results: 21 + 6 tests passed, zero failures/skips; typecheck and isolation scanner exited 0. Audit exited 0 with zero vulnerabilities across all severities. Metadata: 124 total dependencies, 89 prod, 35 dev, 28 optional; categories overlap. Advisory result is time-specific, not proof of defect-free dependencies. npm advisory traffic is tooling traffic, not production application contact.

Scanner covers selected backend text and finite secret/production-target patterns. It excludes .env, node_modules, dist and package-lock.json; deny-list literals are allowed in config/tests. This is not exhaustive secret/history/image attestation. These tests did not exercise real PostgreSQL workers or Docker HTTP. No disposable DB repeatability claim.

## Current code controls

- Config permits development/test only. Shared DB parser restricts protocol, local/container hostname, development/test DB name and dedicated username; query/fragment overrides reject before connection. CLI requires owner role; runtime requires app role and seed requires owner role. Reset requires exact database-name confirmation. Runtime config rejection tests passed; CLI/seed subprocess guards were not rerun here.
- Configured development tokens map to issuer/subject. Repositories resolve verified local identity, current status and roles. Shared authorizer denies unknown policies, empty/mixed unsupported roles and inactive/suspended users. Client actor/roles are not authority. Development identity provider is not production authentication/session parity.
- Admin suspension denies self/privileged targets according to explicit hierarchy. Transaction locks actor and target user rows, takes matching per-user advisory authority locks, then reads verified global roles, then rechecks status/hierarchy before target update, audit and outbox commit together. Local lock-contention probe denied a concurrent actor-status change with PostgreSQL `55P03`; role-change trigger now uses the same transaction lock; independent QA still required.
- API validates schemas, bounds bodies at 1 MiB, generates request IDs and returns safe errors. Shared preHandler now limits storage/actions too: me 60, admin 30, webhook/storage/actions 120, other routes 300 per 60 seconds, per IP/route. Retry-After is returned; map is bounded near 5,000 entries with eviction. State is process-local; restarts, replicas and eviction affect enforcement. Parser/validation failures can precede preHandler. Local storage-route threshold probe saw 120 resource 404 replies followed by 5 rate-limit 429 replies; broader flood resilience remains unproved.
- Webhook HMAC binds timestamp/event ID/exact bytes with timing-safe comparison. Freshness, size, strict UTF-8 and non-null JSON object checks precede DB work. Replay hash and handler update share transaction. No provider-specific business schema; providers remain mocks. Notification idempotency is actor-scoped and DB-backed; current wiring checks completion result.

## Database grants and no-RLS rationale

Fresh local read-only catalog query through `docker exec soundpub-foundation-v2-postgres-1 psql -U postgres -d soundpub_dev` observed:

- Ledger contains 0001_foundation.sql through 0005_role_authority_lock.sql.
- soundpub_owner and soundpub_app both have superuser, createdb, createrole and bypassrls false. App schema CREATE is false.
- App audit_logs grants: SELECT/INSERT; roles: SELECT; no schema_migrations table grants returned. 0003 revokes broad table/default grants; 0004 removes unused INSERT/DELETE on identity and storage tables and restricts runtime operations to current API/worker needs. Sequence USAGE/SELECT from 0002 remains.
- All 12 foundation tables have RLS disabled and forced RLS disabled. This is a catalog observation, not an RLS test pass. App-credential privilege-denial transactions were not executed here.

[Database design](../backend/DATABASE_DESIGN.md) treats these as private foundation system tables behind a trusted backend role, server authorization and restricted grants. Browsers receive no DB credentials or arbitrary SQL interface. Domain/tenant policy translation is deferred to Phase 3 when domain tables arrive. This explains the foundation design; it does not provide row isolation. Compromised app credentials or authorization defects can cross users for user-status and operational rows, but current grants deny identity/role insertion and audit-history mutation. Loopback Postgres still requires credentials; network placement alone is not authorization.

[Authorization model](../backend/AUTHORIZATION_MODEL.md) still calls for required RLS/forced RLS defense in depth; Phase1G retains policy translation obligations. This report does not waive requirements or declare policy parity. Acceptance owner must resolve that documentation/scope tension. Domain migration needs explicit tenant/owner policies and negative tests before claiming DB-enforced isolation.

## Storage and runtime limits

MIME byte gates now run for direct uploads and signed completion: PNG/JPEG/PDF prefixes, strict UTF-8/no-NUL text. Full structure, polyglots, malware and safe rendering remain outside checks. See [storage report](PHASE2_STORAGE_REPORT.md) for exact ceiling and nontransactional lifecycle risks. Final-key access does not independently require persisted ready status. Signed URLs are bearer capabilities; development object credentials are not demonstrated scoped IAM.

Current source checks DB plus bucket readiness, handles idle-pool errors in API/worker, emits aggregate metrics and refreshes worker heartbeat after successful polls. Compose health rejects heartbeat older than 10 seconds. These supersede stale missing-hook/static-marker descriptions; outage/recovery and pool resilience were not rerun here.

Compose publishes API 3000, storage 9000 and Postgres 55432 on loopback; worker is internal-only. API/DB/storage also attach ingress network, so blanket egress prevention is unproven. Dockerfile runs API/worker as node with production-only npm dependencies. All four local services reported healthy after final rebuild and loopback probes returned 200. No production image parity or hard egress-firewall verdict follows.

Independent runtime QA, S3 expiry/tamper, cross-store reconciliation and worker recovery remain outside this report's demonstrated PASS scope. Coordinator separately ran repeatable migrations, local DB denial, actor-lock contention and rate-threshold probes; consult execution log and independent QA for acceptance. No production readiness, cutover or final acceptance is granted.








