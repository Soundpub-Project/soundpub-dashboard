# Phase 2 database report — current grants and expiry

Live read-only query confirms soundpub_dev migration history contains 0001_foundation.sql through 0005_role_authority_lock.sql. Both soundpub_owner and soundpub_app have superuser, createdb, createrole and bypassrls false. App schema CREATE false.

0002 broad table grants are superseded by 0003 and 0004. Migration 0005 serializes role assignment changes with the same transaction advisory lock used by admin operations, without granting runtime role writes. Default table DML is revoked. Runtime can read identities/roles, update user status, read/insert/update storage/outbox/idempotency/webhook rows, insert integration guards, and read/append audit. Runtime user/role INSERT, storage DELETE, ledger INSERT and audit UPDATE all return false in live privilege probes. Sequence usage/select remains. Foundation system tables use trusted-backend authorization rather than RLS; tenant/domain RLS starts with Phase 3 domain tables. No database row-isolation claim is made.

Idempotency begin uses atomic INSERT ON CONFLICT UPDATE only where expires_at <= now(); resets hash, created_at, expiry, processing state and cached response. Unexpired conflicting hash still conflicts; completed replay retains result. Expired processing rows also reclaim: callers must keep claim, effects and completion on same transaction client. Notification does so; fresh UUID suffix on new outbox key prevents old event key collisions after expiry. Failed completion returns conflict and rolls back transaction. Reclaim is deliberate permission to execute again after retention, not perpetual exactly-once protection.

Latest full suite 33/33 passed including real DB test. Test now copies all five migrations, checks repeatability/checksum/rollback, concurrent reclaim (one new, one processing), changed hash/stale response clearing, reclaim rollback and queue sample. Previous 0001-only test limitation superseded. Initial refresh run 32/33 with DB failure; isolated DB rerun 1/1 and final full rerun 33/33. Initial failure cause not captured; shared test DB contention not established.

Commands from repository root:
```powershell
Get-Content backend/migrations/0002_app_grants.sql,backend/migrations/0003_restrict_runtime.sql,backend/migrations/0004_runtime_least_privilege.sql,backend/migrations/0005_role_authority_lock.sql
docker exec soundpub-foundation-v2-postgres-1 psql -U postgres -d soundpub_dev -X -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT name FROM soundpub.schema_migrations ORDER BY name; SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname IN ('soundpub_owner','soundpub_app'); SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee='soundpub_app' AND table_schema='soundpub' AND table_name IN ('audit_logs','schema_migrations','roles') ORDER BY table_name,privilege_type; SELECT has_schema_privilege('soundpub_app','soundpub','CREATE') AS app_schema_create; COMMIT;"
```

Full suite command in PHASE2_TEST_REPORT.md. No explicit destructive app DDL-denial attempt, second clean full-schema comparison, backup/restore or restart durability rerun.


Snapshot: 2026-10-28 approximately 02:00 UTC. Isolation: local code, dedicated local Docker and synthetic soundpub_test only; no production contact, deployment, restart or source edits. Only DATABASE, WORKER and TEST reports updated. Reporting/self-check evidence, not independent QA. Earlier execution log describes historical checks; current facts below supersede conflicting older statements.




