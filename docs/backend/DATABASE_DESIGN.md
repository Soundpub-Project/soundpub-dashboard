# Database design

Status: target foundation design. Migration SQL defines actual physical columns; this document defines their required semantics. No production rows are imported.

## Isolation and ownership

Use dedicated PostgreSQL 17 and application database, with `soundpub` application schema and separate migration/staging ownership. Tests use a separate disposable database. Never load shared Supabase `auth`, `storage`, `public`, `net`, `vault`, global roles or extensions from source.

Use dedicated non-superuser migration owner `soundpub_owner` and restricted API/worker login role `soundpub_app`; container bootstrap `postgres` is not supplied to application services. Runtime roles must not own tables, have superuser/BYPASSRLS, or run DDL. Revoke public schema creation and PUBLIC routine execution; set restrictive default privileges before creating routines. Grant only required schema/table/sequence operations. Foundation system tables are reachable only through the private backend DB role and are protected by server-side authorization plus restricted grants. Domain-table RLS translations remain Phase 3 work when tenant-owned domain tables are introduced. PostgreSQL privilege denial and API authorization are tested.

If policies use a request actor, set transaction-local context from the authenticated principal on the checked-out client. Do not accept arbitrary actor settings from a request. Avoid session-level settings that can leak across pooled connections. Worker policies use explicit service permissions, not impersonated arbitrary users.

## Foundation relations

Initial physical names come from `backend/migrations/0001_foundation.sql`. The table distinguishes those names from semantic requirements that need integration/QA evidence.

| Relation | Required fields and invariants |
| --- | --- |
| `backend_users` | `id uuid` PK equals application UUID; nullable email/contact; explicit active/inactive/suspended status; created/updated timestamps; restricted migration provenance. Unknown source status never becomes active by default. |
| `external_identities` | UUID PK; `application_user_id` FK; provider, issuer, subject, `verified_at`, `binding_provenance`, optional paired `source_system`/`source_auth_user_id`; unique provider binding and source mapping. Unverified binding cannot authenticate. Provider email is optional future contact metadata, not currently a separate column. |
| `user_roles` | User FK and role; application-local uniqueness, explicit scope if needed. Role assignment comes from trusted administration. |
| `identity_references` | UUID PK; `source_system`, restricted `source_user_id`, `reference_kind`, `source_table`/`source_column`/`source_record_locator`, reason, validation state, optional `resolved_application_user_id`. No email, password, session, role or login permission. |
| `audit_logs` | UUID; `actor_user_id` or historical `actor_reference_id`, action, resource type/ID, `request_id`, allowlisted metadata and timestamp. New privileged events require server actor; application runtime must not rewrite history. |
| `outbox_events` | UUID, `topic`, safe payload, unique `idempotency_key`, pending/processing/processed/dead status, attempts, `available_at`, optional `locked_at`/`locked_by`, safe `last_error`, created/processed timestamps. Aggregate/version/correlation may be explicit payload fields; no separate columns currently. |
| `idempotency_keys` | Composite PK `(scope,key)`, SHA-256 request hash, processing/completed status, `response_status`/`response_body`, creation and expiry; conflicts cannot overwrite prior request identity. |
| `storage_assets` | UUID, bucket/key, `owner_user_id` or `owner_reference_id` with exactly one set, `content_type`, `size_bytes`, `checksum_sha256`, pending/ready/deleted/failed status, metadata and timestamps. Initial uniqueness is bucket/key. |
| `integration_effects` | Composite PK `(consumer,idempotency_key)` for transactionally deduplicating local handler effects. Not a guarantee of external provider exactly-once execution. |
| `webhook_events` | UUID, provider/event ID unique pair, payload digest, optional payload, status/attempts, safe error and received/processed timestamps. Receipt and local handler effect are transactional. |
| `schema_migrations` | Migration filename, SHA-256 checksum and `applied_at`; runner rejects history divergence. |

Phase1G calls canonical media entities `storage_assets`; the Phase 2 spec's `storage_objects` and `audit_events` are illustrative names. Implementation chooses `storage_assets` and `audit_logs`. Provider identity and PRIVATE visibility are currently adapter context rather than dedicated asset columns. Extending to multiple providers/public/admin-only objects requires explicit metadata/schema mapping; do not infer these fields already exist. Separate resource links must preserve multiple logical references when those domains are built. No permanent signed URL column.

`soundpub.app_role` source vocabulary/order is `superadmin`, `admin`, `label`, `artist`, `user`, `copyright`, `whitelabel`. Initial target uses `soundpub.roles(name)` lookup and `user_roles.role` FK with all seven values; this is the explicit target compatibility mapping, not a copied source enum. Lookup rows have no ordering semantics. Preserve all values and review any domain function expecting enum order/casts before later migration. Supporting a role value does not grant undocumented capabilities.

## User selection and typed references

Future selected principals are strictly Auth R1/R2: 110 INCLUDE plus 16 INCLUDE_SHARED_IDENTITY in the pinned snapshot. The 29 excluded and 56 deferred identities do not become users, profiles, artists, role assignments or provider bindings because an FK points at them. Phase 2 uses only synthetic equivalents of these cases.

Non-null historical relationship endpoints can use a nullable local-user FK and nullable identity-reference FK with exactly one set:

```sql
CHECK ((local_user_id IS NOT NULL) <> (identity_reference_id IS NOT NULL))
```

For a source-nullable relationship, source null may be represented by both null; then use an at-most-one constraint plus the source-nullability rule. Keep original non-null source UUID and semantic locator in restricted provenance. Reference deletion is RESTRICT while business rows depend on it. Optional resolution never provisions a user or authorizes access automatically. Preserve legal/financial history through local soft-deletion rules.

| Source Auth FK | Target rule |
| --- | --- |
| `profiles.id` | Selected local user required; no deferred/excluded profile import |
| `user_roles.user_id` | Selected local user required; references never carry roles |
| `artist_profiles.user_id` | Selected operational user required; historical endpoints use adapters on business records |
| `auth_events.user_id` | Rebuild empty; new authenticated events use local user; later archives may use typed actor reference |
| `notifications.user_id` | Local user for active delivery; historical recipient reference grants no delivery/login |
| `copyright_registrations.user_id` | Selected owner or retained historical owner reference; new submissions require local actor |
| `copyright_registration_files.uploaded_by` | Selected uploader or historical typed reference; preserve permitted source null |
| `copyright_registration_payments.user_id` | Selected payer or historical typed reference; reference never authorizes payment |

Parent-label defaults, undeclared UUID links, nested historical actors and Storage owner paths follow the same representation rule. Do not silently null owners, replace owners with fixtures, or transfer balances.

## Domain compatibility baseline

Phase1G inventories 33 source application tables. Its 27 business-state dispositions remain scoped future retention requirements. Six operational histories rebuild empty: `audit_logs`, `auth_events`, `rate_limits`, `email_send_log`, `storage_backup_runs`, `storage_backup_log`. Historical `archived_royalties` remains business provenance. New foundation table names do not change those dispositions.

Preserve business UUIDs, source nullability, reviewed FK/delete semantics, decimal precision, provider IDs, statuses and adjustment provenance in later schema work. Use PostgreSQL numeric for money; JSON contracts serialize exact amounts as decimal strings. No balance recomputation, production-specific UUID defaults, source password/reset fields, or blind SECURITY DEFINER/ACL replay.

The reviewed canonical catalog is input for schema compatibility, not an executable migration. Document any source-table/constraint/policy parity still absent from foundation migrations. Four missing Copyright RPCs remain later domain implementation, never advertised as working parity.

## Migrations and access

SQL files have immutable ordered versions and SHA-256 checksums. Current runner validates numeric filename prefixes, sorts filenames lexically, then applies all pending files and ledger inserts in one transaction under an advisory transaction lock. Use fixed-width prefixes such as `0001_`/`0002_` so lexical and intended order agree. `soundpub.schema_migrations` stores full filename, checksum and application timestamp; any applied history that is not an exact prefix fails. Reject changed checksums, duplicate versions and migration-controlled transaction statements. Failure rolls back the pending batch, including ledger changes. Nontransactional operations require a separate reviewed runner; foundation does not support concurrent-index migrations.

Repositories use pooled connections and bound parameters. Pool defaults are maximum 10 clients, 5-second connect timeout, 30-second idle timeout and `soundpub,public` search path; these are implementation defaults, not permission for PUBLIC schema writes. Transaction helper checks out one client, begins, commits on success, rolls back on error and releases in finally, discarding a client when rollback fails. Nested services reuse caller context; no implicit independent transaction or nested-helper guarantee. Worker uses an explicit savepoint for local delivery effects. Do not retry unknown external side effects with a SQL transaction retry.

Use fresh-database migrations twice and compare schema expectations/checksums, rollback assertions, pool-release tests, checksum-drift rejection, runtime grant/RLS negatives and typed-reference negatives. See [test strategy](PHASE2_TEST_STRATEGY.md) and [worker design](WORKER_OUTBOX_DESIGN.md).



