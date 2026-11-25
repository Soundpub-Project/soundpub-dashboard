# 17 — Backup, Canonical, and Backend Definition Diff

Date: 2026-11-25
Status: **PRELIMINARY STATIC COMPARISON — NOT AUTHORITATIVE**

## Scope and evidence

Compared the schema-only SQL reconstructed from the verified 2026-10-30 custom dump with the current `docs/migration/CANONICAL_SCHEMA.sql`. The backup SQL and all generated plaintext remain outside the repository and OneDrive. No row data, auth sessions, refresh tokens, Storage objects, secrets, or production host was accessed. Separately, focused backend tests used fresh disposable PostgreSQL 17 containers with tmpfs data, loopback-only ports, and synthetic fixtures; they did not load or restore the backup.

| Input | Evidence |
|---|---|
| Backup archive | PostgreSQL/pg_dump 15.8; decrypted dump SHA-256 `9ff5c67218247440d6238f099f974bb1afe4cb252b524beaf899f41392eb9daa` |
| Backup schema SQL | SHA-256 `d05f8339416ee85b60affe2797011267b11ba27024d2c4601ad8c100e134a691` |
| Canonical schema | PostgreSQL/pg_dump 17.6; current file SHA-256 `786688db5d38b717fa3d3b33860d03c67438a09ca7cd11bc1adfde8d4e8776e8` |

The comparator lexes SQL statements, removes comments and session/database setup, normalizes whitespace and unquoted identifiers, and preserves function bodies and quoted values. It reports LF/CRLF-only differences separately as candidates, not as semantic matches. It does not parse PostgreSQL grammar or prove effective privileges, applied migration history, data integrity, or runtime behavior. It never writes SQL definitions or literal values into the report.

## Disposable backend migration verification

On 2026-11-25, `RUN_DOCKER_TESTS=1` enabled four focused test files: managed-artist identity, royalty reporting, CSV commit, and staged royalty import. All 6 tests passed (0 failed, 0 skipped). The test helper created a fresh PostgreSQL 17 database per test, applied the backend migration chain, verified that a second migration pass returned no pending migrations, and used only synthetic rows. The fixture uses tmpfs storage and binds its ephemeral port to `127.0.0.1`; this was not a backup restore or production migration.

## Final backend migration schema comparison

On 2026-11-25, a fresh PostgreSQL 17 database used the disposable test Compose fixture. All 82 backend migrations were applied by `soundpub_owner`; a second pass returned no pending migrations. `pg_dump --schema-only --no-owner -n soundpub` exported the schema. The temporary SQL export was outside the repository and OneDrive and was removed after comparison. It was 421,771 bytes with SHA-256 `cd7c1c8e01e27f0b97ada48dd838a2b5d8642c54f548cba31364e160667caae0`. No backup was restored or loaded into this database; only synthetic database initialization and backend migrations were used.

| Comparison | Input groups / statements | Backend groups / statements | Textually different groups | LF/CRLF-only |
|---|---:|---:|---:|---:|
| Verified backup schema vs backend export | 605 / 725 | 848 / 1,206 | 1,431 | 0 |
| Canonical schema vs backend export | 494 / 615 | 848 / 1,206 | 1,320 | 0 |

These are comparator statement-group counts, not counts of missing application features or semantic incompatibilities. In both comparisons, 20 table groups changed textually, 13 were present only in the first input, and 56 only in the backend export. The changed table groups were `artist_deletion_requests`, `artist_profiles`, `artists`, `audit_logs`, `copyright_contracts`, `copyright_registration_files`, `copyright_registration_payments`, `copyright_registration_works`, `copyright_registrations`, `notifications`, `payout_requests`, `profiles`, `releases`, `takedown_request_documents`, `takedown_request_items`, `takedown_request_targets`, `takedown_requests`, `takedown_status_history`, `tracks`, and `user_roles`. Function, trigger, policy, index, type, and privilege groups also differ substantially; the comparator did not emit SQL bodies or values.

The export used `--no-owner`, so it cannot establish owner parity. The comparator is lexical rather than a PostgreSQL parser; these large differences are evidence that schema parity is not established, not proof that the backend migration chain failed or that every difference is a defect. Reconcile intended backend redesigns, table definitions, grants, functions, and runtime behavior before any readiness decision.

## Cross-area reconciliation

This is a source-level reconciliation, not a row-data migration plan. The decrypted artifact used here is the schema-only dump for `soundpub`; other encrypted backup artifacts were not decrypted. Supabase Auth rows, sessions, tokens, balances, royalty records, payout history, and payment records were not opened.

| Area | Legacy backup/canonical model | Backend migration model | Disposition |
|---|---|---|---|
| Auth and roles | `profiles.id` and `user_roles.user_id` reference `auth.users`; the `app_role` labels are `superadmin`, `admin`, `label`, `artist`, `user`, `copyright`, and `whitelabel`. Policies resolve the signed-in user through `auth.uid()`. | `backend_users` is the identity root; `external_identities` can retain source auth IDs; credentials, sessions, and one-time tokens are separate backend tables. The same seven role labels exist, but `user_roles` now references `backend_users` and adds tenant and verification attributes. | Intentional replatform, not schema parity. The source-ID columns provide a crosswalk mechanism, not populated mappings. Build and validate an explicit identity/role/tenant mapping before moving Auth data. Existing managed-artist tests do not establish the full role matrix or session migration. |
| Finance | Legacy balances and adjustments live alongside mutable royalty, payout, and release-payment records. The legacy `payout_requests` shape stores a direct amount and payout details. | Balances are derived from append-only `finance_events`; payout reservations, allocations, settlement evidence, and separate adjustment approvals are represented explicitly. The backend reuses the `payout_requests` name with a different shape. | Intentional workflow redesign. Do not copy legacy balances or payout/royalty rows directly into backend ledgers. A conversion specification must preserve owner identity, currency/units, historical totals, payout terminal state, and evidence, then reconcile totals. Schema-only evidence cannot establish those values. |
| RLS and authorization | Backup schema enables RLS on 32 tables; canonical enables it on 33, adding `rate_limits`. The role-management policy also differs; canonical blocks self-role changes and prevents non-superadmins from changing or assigning superadmin roles. Legacy policies use Supabase JWT identity and roles. | The backend migrations enable RLS on a limited set of 23 finance, payout, royalty, and related tables. Its policies target database service roles; `soundpub_app` policies are not per-end-user policies. Core backend identity/profile/role tables do not use RLS and rely on API authorization plus explicit SQL privileges. | Not equivalent controls. The new API authorization model needs route-by-role/tenant coverage in addition to the database policies. The legacy `rate_limits` discrepancy and every legacy policy difference remain cutover blockers until intentionally mapped or retired. |
| Database grants | Legacy ACLs target `anon`, `authenticated`, `service_role`, and historical roles; backup also contains database grants to `dashboard_user` and `buzzerhood_app`. Canonical and backup ACL sets differ. | Bootstrap creates separate `soundpub_owner`, `soundpub_app`, `soundpub_reconciler`, and `soundpub_auditor` roles. Migrations narrow table/column grants and isolate reconciliation/audit access. | Do not copy Supabase ACLs or historical database-wide grants. Provision backend roles independently and verify effective privileges under the actual migration owner and each runtime login. |

### Grant correction and verification

Source review found that migration `0002_app_grants.sql` granted `USAGE, SELECT` on existing and future sequences to `soundpub_app`, while `0003_restrict_runtime.sql` revoked table grants/defaults but left sequence grants/defaults in place. Migration `0012_media_request_order.sql` later created an identity sequence. A fresh disposable database migrated as the real `soundpub_owner` role confirmed the app role received sequence access; after revoking it, the identity-backed insert still succeeded.

Migration `backend/migrations/0082_restrict_app_sequence_privileges.sql` now revokes existing sequence privileges and the default sequence privileges from `soundpub_app`. Verification after the change: 82 migrations applied, second pass empty, no sequence default grants or current sequence access for `soundpub_app`, and the identity-backed insert still passed. This closes that specific least-privilege gap; it does not resolve the broader ACL differences or prove the deployed roles match.

The regular Docker test helper applies migrations as PostgreSQL superuser, which does not mirror production ownership. For the check above, a separate owned disposable container made `soundpub_owner` own the test database and applied migrations through that login. This confirms migration/default-ACL behavior under the configured owner role without touching production.

On 2026-11-25, focused disposable tests for sequence privileges, finance reconciliation, managed-artist identity, and payout flows passed **7/7** (0 failed, 0 skipped); backend typecheck passed. These tests cover selected synthetic flows, not legacy data conversion or complete auth/RLS parity.

## Synthetic Storage and media verification

On 2026-11-25, the following Docker-gated test files ran sequentially with `RUN_DOCKER_TESTS=1`:

| Test file | Result | Coverage |
|---|---:|---|
| `backend/test/media-live.test.ts` | Pass | Live synthetic API against disposable PostgreSQL/RustFS: upload/download, signed URLs, CORS, multipart upload/abort, invalid MIME rejection, deletion, and cleanup |
| `backend/test/phase3d-media-security.test.ts` | Pass | Private-object authorization, actor/role checks, upload validation, signed completion, and media binding rules |
| `backend/test/storage-s3.test.ts` | Pass | S3 development-adapter privacy, persistence, scoped signing, validation, and authorization |
| `backend/test/storage.test.ts` | Pass | Ownership, download/sign/delete authorization, URL tamper/expiry, MIME/size/checksum validation |

Combined result: **22/22 passed**, 0 failed, 0 skipped. The live fixture used disposable PostgreSQL/RustFS services, synthetic credentials/content, and loopback-bound ports. It did not use backup rows or objects and did not connect to production. This verifies selected backend Storage behavior; it does not establish parity with legacy Supabase bucket policies, migration of existing objects, or compatibility of previously stored object metadata.

## Full backend suite and synthetic recovery rehearsal

On 2026-11-25, `RUN_DOCKER_TESTS=1 npm run test:docker` completed with **475 passed, 0 failed, and 9 skipped** out of 484 tests. The skipped tests include browser E2E tests that require a separately running local frontend. The dedicated recovery rehearsal was skipped by that suite's separate opt-in and was run afterward.

`RUN_RECOVERY_REHEARSAL=1` enabled `backend/test/label-custom-recovery-rehearsal.test.ts`; all **5/5 tests passed**. Its live rehearsal generated ten synthetic JSON records and replayed them to two fresh PostgreSQL 17 databases, each in its own loopback-only, tmpfs-backed container. Both targets produced identical results; source hashes remained unchanged; unresolved owners and credential/session fields were rejected; a conflicting replay rolled back without partial writes; and owned containers were removed.

This rehearsal validates the recovery helper's synthetic staging contract, not restoration of the verified backup, the complete backend schema, real Auth/session migration, or a production dataset. No backup rows or objects were loaded. It improves test evidence but does not close data-conversion or production-readiness gates.

## Findings

| Object area | Static result |
|---|---|
| Tables | 32 of 33 object groups match; `soundpub.rate_limits` differs in RLS state. |
| RLS | Backup enables RLS on 32 tables and omits `rate_limits`; canonical enables it on 33, including `rate_limits`. The backup has no `rate_limits` policy. |
| Functions | 10 exact text matches, 41 LF/CRLF-only candidates, and 5 body-text differences. |
| Policies | 75 match; one `user_roles` policy differs. The backup has two admin manage-all royalty/upload policies where canonical has two view-only policies. |
| Grants/default privileges | 214 statement groups match; 117 occur only in backup SQL and 5 only in canonical SQL. Role/object semantics need review; no grant SQL is reproduced here. |
| Indexes | 55 match; canonical additionally has `tracks_normalized_isrc_idx`. |
| Triggers and types | All 47 triggers and 4 types match textually. |
| Owners | Not compared. The backup custom-dump TOC stores owner metadata separately, while its generated schema SQL has no owner statements; canonical SQL contains 94. |

Count-only ACL classification: the 117 backup-only groups comprise 15 default-privilege groups (5 each for tables, sequences, and functions), 51 function grants, 48 table grants, 1 schema grant, and 2 database grants. Their target-role counts are `postgres` 77, `authenticated` 25, `anon` 8, `service_role` 5, plus one each for `dashboard_user` and `buzzerhood_app`. The two database grants are `ALL` to `dashboard_user` and `CONNECT` to `buzzerhood_app`; the SQL is not reproduced here. The 5 canonical-only groups are 3 table grants to `authenticated` and 2 function revokes from `PUBLIC`.

The historical role inventory in `docs/migration/PHASE1F_DATABASE_SCOPE.md` records `dashboard_user` as NOLOGIN with no Soundpub schema privileges, and `buzzerhood_app` as LOGIN but without Soundpub schema USAGE or CREATE. This is separate historical evidence, not proof of present applied state. The classifications above are statement groups, not effective-privilege checks. Do not carry the `dashboard_user` database-wide `ALL` grant forward without reconciling login, membership, and intended role state.

The five function body differences are `auto_assign_artist_role`, `auto_assign_new_user_to_soundpub_label`, `commit_royalty_upload`, `get_royalty_artist_breakdown`, and `get_royalty_track_breakdown`. The canonical schema header documents privacy substitutions for the first and fourth names. The other three remain unexplained and need source/version and behavior review, especially the role-assignment and royalty-import routines. The 41 newline-only candidates are not proof of body equivalence.

The `rate_limits` difference aligns with the security-boundary migration and the post-baseline remediation notes: the canonical schema enables RLS, and that migration revokes client access, while the verified backup definition does not show those changes. The prior `32/32` RLS count comparison checked totals only, not table identities. Although repository notes date the manual remediation to 2026-10-27, the labeled backup is dated 2026-10-30 yet lacks it; reconcile that chronology and the backup's capture point before any restore plan.

The historical `SCHEMA_DRIFT_REPORT.md` records canonical SHA-256 `2658C45C2377DD834BB5709FC5BEE42B17CFF1D098F96753216F0F66C863E7D3`, which differs from the current file hash above. Preserve the historical report, but reconcile its artifact version/provenance before treating it as the same canonical snapshot.

## Backend migration relevance

The backend does not reuse the legacy `rate_limits` table. Migration `backend/migrations/0058_shared_rate_limits.sql` creates `rate_limit_windows`, stores only a 64-character hash key, and grants access to the backend application role. `backend/src/api/rate-limiter.ts` and `backend/test/rate-limiter.test.ts` cover the new flow. This is a redesigned backend mechanism, not a row-by-row migration of legacy limiter state. Exact-name searches found no direct backend counterparts for the five changed legacy functions; the static crosswalk below identifies related application flows, but does not establish behavioral parity.

Static crosswalk for the changed functions:

- `get_royalty_artist_breakdown` and `get_royalty_track_breakdown` are defined in the historical local migration files `docs/soundpub-local-migration/05-royalty-dashboard-rpcs.sql` and `17-role-aware-royalty-rpcs.sql`. The backend exposes reporting and analytics routes, including artist/track analytics views. `backend/test/royalty-reporting.test.ts` covers role-scoped reports and track analytics, but is Docker-gated. This is a conceptual counterpart, not proof that calculations, filters, or visibility match the legacy RPCs.
- `commit_royalty_upload` appears in the Supabase royalty-import migration revisions, most recently `supabase/migrations/20261023055703_royalty_artist_history_guard.sql`. The backend instead implements CSV and staged-file import/commit workflows in `backend/src/royalties/index.ts`, with focused import tests. Treat this as an application-layer redesign until its validation, idempotency, correction, and posting semantics are compared.
- `auto_assign_artist_role` and `auto_assign_new_user_to_soundpub_label` appear in historical local migration scripts. Backend user creation writes role assignments explicitly in `backend/src/users/repository.ts`, and `backend/migrations/0078_managed_artist_login_boundary.sql` adds managed-artist guards. The legacy role routines are not implemented under those names in the backend, and their trigger behavior has not been shown equivalent to the backend flows.

The three unexplained functions were also compared against all SQL files in `supabase/migrations` and `docs/soundpub-local-migration`. Repository definitions exist for each, but none is an exact normalized statement match for either the backup or canonical definition. The source history therefore does not identify which version was captured or applied; reconcile the mismatch with migration provenance before behavioral sign-off.

## Remaining gates

- Review the 3 unexplained function-body differences against approved source and backend API behavior; the focused role/royalty tests passed, but the static crosswalk above is not a legacy parity test.
- Reconcile the remaining ACL differences and owner metadata against intended backend roles; specifically resolve the backup's `dashboard_user` database-wide `ALL` grant, `buzzerhood_app` grant, and legacy default privileges. The backend app's sequence defaults were separately revoked in migration 0082.
- Specify and test legacy-to-backend identity/role/tenant conversion and finance-history conversion; no backup rows were opened or transformed in this audit.
- Map legacy Storage buckets/policies and define an existing-object transfer/compatibility plan; the passing tests cover only synthetic backend Storage flows.
- Run a full isolated PostgreSQL restore rehearsal with an approved, controlled input and verify the actual target schema/data conversion; the passing recovery test above uses generated JSON fixtures, not the verified backup.
- Resolve the substantial backup/canonical-to-backend schema differences above, including intended redesigns, table definitions, privileges, and owner strategy; then add targeted behavioral parity tests where applicable. The migration chain applies cleanly in disposable test databases, but static comparison does not establish parity. `psql` and `pg_restore` are not installed; the disposable database used the repository's Node/PostgreSQL test harness.
- Do not replay the backup directly as a current schema, restore production data, contact production, deploy, or cut over based on this report.
