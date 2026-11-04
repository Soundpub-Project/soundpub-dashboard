# Phase 2 authorization report

Updated 2026-10-28, approximately 02:00 UTC. Evidence: current code/migrations and local focused tests. Only this report and `PHASE2_AUTH_REPORT.md` are edited by this refresh. No source changes, production contact, live suspensions or privilege changes. Results do not constitute an independent security approval or final acceptance verdict.

## Principal and policy guards

[Shared authorizer](../../backend/src/auth/index.ts) denies by default. Every supported policy requires an active principal with a nonempty ID and a nonempty, fully recognized role array. The API applies `authenticated` to protected requests and `admin` to the suspension route. No client role/owner fields grant authority. [Repository lookup](../../backend/src/db/repositories.ts) requires one verified identity binding and verified global assignments; any unsupported global role empties the principal's role set, which API denies.

| Policy | Source behavior |
| --- | --- |
| `authenticated` | Active principal with recognized nonempty roles. |
| `owner` | Supplied server-resolved owner ID equals principal ID; admin alone does not bypass ownership. |
| `owner-or-admin` | Owner, admin or superadmin; active-status and recognized-role requirements still apply. |
| `admin` | Admin or superadmin. Target-sensitive mutations additionally check target hierarchy. |
| `superadmin` | Superadmin only. |
| Unknown policy, inactive/suspended status, missing owner for owner-only access, empty/unknown roles | Deny. |

Schema preserves seven role names, including `copyright` and `whitelabel`; policy code supports five. Unsupported compatibility roles do not gain fallback capabilities. Tenant-scoped assignments do not grant global roles; artist/label names alone do not grant tenant, roster or cross-owner access. Those domain capabilities are not implemented here.

## Suspension transaction

Current [runtime service](../../backend/src/main.ts) performs the following checks inside `withTransaction` after route authentication/admin authorization:

1. Deny self-suspension. Lock actor and target user rows in UUID order, acquire matching per-user advisory authority locks, then read both sets of verified global role rows. Missing target or verified target role returns 404.
2. Re-evaluate actor status from locked user rows and verified global roles in the same transaction inside the mutation transaction. Reject inactive actors, missing/unsupported roles and actors without admin/superadmin.
3. Allow ordinary admin targets only when every target role is `user`, `artist` or `label`. Superadmin additionally permits `admin` targets. Superadmin and unsupported compatibility-role targets are denied; no peer-superadmin exception exists.
4. Update local status and insert audit/outbox records on the same transaction client. No provider-side ban or production account mutation is performed by this synthetic slice.

Source inspection and local concurrency probe establish this control flow. While suspension was paused on an audit-table lock, a concurrent actor-status update with 500 ms lock timeout failed with PostgreSQL `55P03`; suspension then completed 200 and synthetic statuses were restored. A role-revocation contention probe now fails with PostgreSQL `55P03` while admin authority lock is held; full production-scale contention remains later-phase work.

## Storage and async guards

[Runtime wiring](../../backend/src/main.ts) derives Storage actor ID and elevated admin role from the authenticated principal. [Storage access checks](../../backend/src/storage/index.ts) compare actor ID against stored metadata ownership, with explicit admin access; S3 operations load metadata and call these checks before downloads, signing, completion or deletion. Creation derives owner from actor, not request body. PostgreSQL metadata lookup constrains object ID/bucket/status, while owner access is enforced in the service; it is not an owner-scoped SQL/RLS predicate.

Memory/mocked-S3 tests cover anonymous/non-owner denial, owner/admin access, signed URL tampering/expiry and upload validation. They do not prove live object-store or database isolation. Issued S3 signed URLs are bearer capabilities; route TTL is 300 seconds and object-store downloads do not rerun application principal status checks.

Notification enqueue derives scope from authenticated actor ID and validates `Idempotency-Key`; claim, outbox intent and completion share a transaction. API documents success bodies and 404/409/429/500 envelopes. Focused tests verify injected HTTP behavior; they do not establish authorization for future domain actions or live SQL race handling.

## No RLS in the foundation: rationale and guards

[Database design](../backend/DATABASE_DESIGN.md) scopes Phase 2 to private backend system tables. Runtime connects as shared server login `soundpub_app`; end users are represented by application principals, with no implemented per-user PostgreSQL identity/RLS context. Tenant-domain RLS translation is deferred to Phase 3 when domain tables and membership policies are introduced. Current migrations neither enable/force RLS nor define policies. This records the foundation boundary, not approval to omit RLS from future tenant-domain tables or a claim of source-policy parity.

Source-defined supporting guards are:

- API principal/status/role checks, explicit hierarchy checks and service ownership enforcement described above; schema constraints, foreign keys and bound SQL parameters protect data shape and query inputs.
- Bootstrap init creates distinct `soundpub_owner` and `soundpub_app` logins with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`; migration and synthetic seed use owner credentials; API/worker use runtime credentials. Runtime config permits only `soundpub_app`; CLI permits only `soundpub_owner`; shared URL/environment guards reject remote/production/staging targets and URL-option overrides.
- Current Compose exposes API/object storage/PostgreSQL only on loopback and supplies no client database credential flow. This is a local deployment boundary, not evidence of end-user row isolation.
- [Migration 0003](../../backend/migrations/0003_restrict_runtime.sql) revokes earlier blanket/default grants. [Migration 0004](../../backend/migrations/0004_runtime_least_privilege.sql) grants only required operations: identity/role reads, user status update, storage/outbox/idempotency/webhook writes, integration guard insert, and audit append. Live probe confirms user/role INSERT, storage DELETE, ledger INSERT and audit UPDATE are denied.

Residual boundary: runtime can read identity/role data, update user status, and write operational Storage/outbox/idempotency/webhook rows across users. It cannot insert users/roles/identities, delete Storage metadata, mutate audit history or write migration history. Without RLS, HTTP/service guards remain the per-user boundary. Restricted grants are defense in depth, not complete tenant isolation; Phase 3 domain tables need explicit tenant policy and RLS decisions.

## Verified evidence and acceptance limits

Run from `I:\website-devops\soundpub-project\soundpub-dashboard\backend`:

```powershell
npx tsx --test test/auth.test.ts test/authorization.test.ts test/config.test.ts test/api.test.ts test/api-slices.test.ts test/storage.test.ts test/storage-s3.test.ts
npm run typecheck
```

Observed result: 20 passed, 0 failed/skipped; source typecheck exited 0. Two tests exercise the pure role/status/owner-policy matrix, four exercise auth helpers, three configuration guards, three injected API behavior and eight memory/mocked-S3 Storage checks. This invocation omits the real PostgreSQL integration test and does not boot `main.ts` or execute live suspension SQL.

Docker context check returned local named pipe `npipe:////./pipe/dockerDesktopLinuxEngine`. A read-only `psql` inspection was attempted through `docker --context desktop-linux exec soundpub-foundation-v2-postgres-1`; Docker rejected it because the container was not running. No role/RLS/ownership query executed, no privileges were mutated, and no stack restart was attempted. Prior reported live `/me`, pending-object denial or role-split results are not claimed as freshly rerun evidence.

No independent PASS is asserted. Independent account/tenant/ownership HTTP matrix, real Storage access and later domain RLS remain separate acceptance evidence.









