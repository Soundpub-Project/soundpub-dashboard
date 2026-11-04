# Phase 2 authentication report

Updated 2026-10-28, approximately 02:00 UTC. Evidence: current source inspection and local focused tests. This refresh edits only this report and `PHASE2_AUTHORIZATION_REPORT.md`; no source edits, production contact, identity provisioning or status/role mutations. Test results below are bounded implementation checks, not an independent security approval or production-readiness verdict.

## Implemented authentication path

[Runtime wiring](../../backend/src/main.ts) parses server-configured `DEV_AUTH_TOKENS_JSON` into token-to-issuer/subject mappings. [API authentication](../../backend/src/api/index.ts) accepts a Bearer token and resolves it through that mapping and the database repository on each protected request. It does not verify an OIDC/JWT signature or accept client-supplied roles, owner IDs or email as authority. The reusable identity/principal resolver helpers are separately tested; runtime token lookup calls the repository directly rather than using those helpers as HTTP middleware.

[Principal lookup](../../backend/src/db/repositories.ts) uses bound issuer/subject parameters and requires exactly one identity binding with `verified_at IS NOT NULL`. Unknown, unverified or ambiguous bindings return no principal. It loads the current local user's status and only verified global role assignments (`tenant_id IS NULL`). No login-time registration or email linking occurs. Roles outside `user`, `artist`, `label`, `admin`, `superadmin` yield an empty role set, including mixtures of supported and unsupported roles. API then applies the shared `authenticated` policy: inactive/suspended users, empty roles and unknown roles deny. Missing or invalid credentials return 401; a resolved principal failing that policy returns 403.

[Configuration guards](../../backend/src/config/index.ts) and [database-target validation](../../backend/src/config/database-target.ts) restrict runtime to development/test, require approved local DB hosts and `soundpub_dev`/`soundpub_test` database names, require explicit credentials and runtime username `soundpub_app`, and reject URL query overrides/fragments. Development identity JSON is validated before runtime DB connections. Production/staging refusal and invalid-config handling have focused test coverage. The reusable dev/mock resolver also refuses production mode; this does not constitute a production identity provider.

## Foundation trust boundary and no RLS

Foundation uses server-side principal/authorization guards over dedicated PostgreSQL system tables. Per [database design](../backend/DATABASE_DESIGN.md), these tables are accessed through the backend's DB role; browser clients are not given that role as an authentication mechanism. End-user identity is an application principal, not a distinct database login or per-user RLS session context. Current foundation migrations contain no RLS policies or RLS enablement. Tenant-domain RLS translation is deferred to Phase 3 when those domain tables and relationships exist.

This scoped rationale depends on trusted backend code, private development deployment, separated migration/runtime credentials and restricted grants. It does not make application checks equivalent to row-level DB isolation. Current grants still let runtime modify identity bindings and user-role assignments; a compromised runtime DB connection can bypass HTTP identity checks. Source-defined restrictions and remaining verification gaps are detailed in [authorization report](PHASE2_AUTHORIZATION_REPORT.md).

## Verified evidence and limits

From `I:\website-devops\soundpub-project\soundpub-dashboard\backend`:

```powershell
npx tsx --test test/auth.test.ts test/authorization.test.ts test/config.test.ts test/api.test.ts test/api-slices.test.ts test/storage.test.ts test/storage-s3.test.ts
npm run typecheck
```

Results: 20 tests passed, 0 failed, 0 skipped; source typecheck exited 0. Breakdown: four auth-helper tests, two authorization-policy tests, three config tests, three API tests and eight Storage tests. API checks use injected dependencies; Storage checks use memory or mocked S3 transport. This command does not execute the real PostgreSQL integration test or the production `main.ts` bootstrap. Helper tests exercise invalid principals, client-authority rejection and stale-hook clearing; they are not a full live HTTP/DB negative-status or binding matrix.

Local Docker context was verified as `npipe:////./pipe/dockerDesktopLinuxEngine`. An attempted read-only role/RLS query through `soundpub-foundation-v2-postgres-1` failed because the container was no longer running. No SQL evidence was obtained in this refresh; no stack was started or recreated. Previous `/me` and database claims in older report snapshots are not promoted into new verification results.

Real OIDC/JWT validation, password/recovery flows, sessions, revocation, MFA and source identity migration remain unimplemented or unverified here. Synthetic tokens have no implemented issuer-backed expiry/session lifecycle. Principal status and role reads are separate queries rather than an atomic authorization snapshot. Suspension now rechecks actor status/roles inside its mutation transaction, correcting the earlier report, but lacks locks preventing every concurrent role/status change. There is no new independent acceptance or production cutover claim.
