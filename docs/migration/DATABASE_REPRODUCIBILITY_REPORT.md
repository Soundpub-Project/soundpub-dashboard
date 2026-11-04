# Database reproducibility report — Phase 1B Agent D

Observation date: 2026-10-27, Asia/Bangkok. **Database Reproducible: NO** under the full Phase 1B gate. **Two independent blank-cluster Soundpub DDL runs: PASS. Normalized application catalog parity against live: PASS.** Auth/platform integration, migration ledger, operational settings and independent QA remain unproven.

This assignment writes only this report, `SECURITY_DEFINER_AUDIT.md`, and `scripts/phase1b-definer-assertions.sql`. Canonical schema, object manifest, drift report, API matrix and every existing migration remain untouched by Agent D. No production data/DDL changes, historical migration replay, Edge deployment or traffic changes occurred.

## Inputs pinned for this test

| Input | Evidence |
| --- | --- |
| Repository HEAD | `48222ffb9c9e60da82d224e1e8aaccd4dd597442`; shared dirty working tree preserved |
| Canonical baseline | `docs/migration/CANONICAL_SCHEMA.sql` |
| Canonical file SHA-256 | `786688db5d38b717fa3d3b33860d03c67438a09ca7cd11bc1adfde8d4e8776e8` |
| Assertion/fingerprint SQL | `scripts/phase1b-definer-assertions.sql` |
| Assertion file SHA-256 | `845b140c0cc393d10e705debfd69be6170cca4b92d66efb459095f84a910de23` |
| Local image | `postgres:17.6-bookworm` |
| Local image ID | `sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3` |
| Live database | PostgreSQL 17.6, schema `soundpub`, database `postgres` |
| Live inspection path | `ssh maskhar@20.20.20.3`, then `cd /data/supabase/instances/supabase-01/config`, `docker compose exec -T db psql -X -U postgres -d postgres` |
| Production boundary | Metadata-only SELECTs/DO catalog assertions in READ ONLY transactions; no application function execution |

The earlier drift report's historical checksum predates the current integrated baseline. This test pins the current file actually loaded rather than treating that old checksum as current. Function identity privacy substitutions are deliberate: two private identity values appear at **four function sites**, not two sites.

## Executed sequence and results

1. Confirmed local Docker daemon and an already-installed PostgreSQL 17.6 image. Created two separate containers, each with its own newly initialized tmpfs PGDATA, no network and no published ports. No production mount, data copy, environment file or provider credential was passed.
2. A bare canonical load was attempted before prerequisites in the first disposable setup. It failed `schema "auth" does not exist` under `--single-transaction`; it did not leave partial Soundpub DDL. This proves the canonical file alone is not a self-contained initializer.
3. A preliminary attempt to demote the image's bootstrap postgres role failed `The bootstrap superuser must have the SUPERUSER attribute`. That transaction rolled back; both preliminary disposable containers were removed. Final runs used a differently named bootstrap admin and a separate **non-superuser** postgres owner.
4. Initialized both final containers from fresh PGDATA; created roles and minimal auth contracts below. Canonical DDL was loaded once in each with `ON_ERROR_STOP=1 --single-transaction` as `postgres`, verified `rolsuper=false`, `rolbypassrls=true`.
5. Ran the same catalog fingerprint transaction against each fresh schema and live production. **All 949 records and SHA-256 fingerprints match** after narrowly declared identity/line-ending/ACL-order normalization.
6. Exercised synthetic role/definer behavior only in run 1, rolled all fixture data back, and checked profile count is zero. This reproduced outstanding authorization failures; it does not turn schema parity into security approval.
7. Reapplying the baseline to populated run 2 failed `schema "soundpub" already exists` under one transaction, as expected for an apply-once baseline. Counts stayed unchanged. No idempotent migration runner exists to skip an already-applied checksum.
8. Ran default security assertions against isolated and live catalogs: both nonzero, with the same five gate failures documented in the definer audit. Fingerprint-only collection explicitly set `enforce_security=false`.
9. Local containers were removed after validation. Remote sessions made no filesystem changes and no production mutation.

| Target | psql fingerprint-only exit | Records | Fingerprint SHA-256 |
| --- | ---: | ---: | --- |
| Blank run 1 | 0 | 949 | `d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c` |
| Blank run 2 | 0 | 949 | `d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c` |
| Live canonical application catalog | 0 | 949 | `d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c` |

**run_1_fingerprint == run_2_fingerprint == normalized_live_fingerprint.** No unexplained application-catalog differences remain within the fingerprint's stated coverage. This is stronger than matching counts and preserves statement/body order inside each function; it does not sort SQL lines into a multiset.

## Fingerprint definition and coverage

Version `phase1b_soundpub_catalog_v1` in the runnable SQL script emits SHA-256 of an ordered newline-separated sequence of JSON arrays `[kind, identity, definition]`. Sort uses explicit `COLLATE "C"`; identities are text, avoiding PostgreSQL name-type truncation at 63 bytes. OIDs are resolved to names; effective default ACLs are expanded to named grantee/grantor/privilege/grant-option tuples and sorted. Policy role lists are semantically unordered and sorted by role name.

| Record category | Count | Compared attributes |
| --- | ---: | --- |
| Schema | 1 | Name, owner |
| Schema ACL | 1 | Named USAGE/CREATE privilege entries |
| Relations | 33 | Kind, owner, persistence, RLS/forced RLS, replica identity, reloptions, partition marker/bounds |
| Columns | 426 | Position, name, type/typmod, nullability, identity/generated/storage/collation, default expression |
| Constraints | 109 | Full definition, validation, deferrability |
| Indexes | 101 | Full definition, valid/ready/replica flags, reloptions |
| Functions | 56 | Owner and full pg_get_functiondef, including invokers, signatures, language, security, volatility/config/body |
| Function ACL | 56 | Grantee, grantor, privilege, grant option |
| Enums / enum ACL | 4 / 4 | Owner, ordered labels / grants |
| Policies | 78 | Command, permissiveness, named roles, USING/WITH CHECK expressions |
| Application table triggers | 47 | Complete trigger definition, enable state |
| Table/relation ACL | 33 | Grantee, grantor, privilege, grant option |
| **Total** | **949** | Includes all current application definition categories above |

Column ACLs and Soundpub/database-global default ACLs participate if present; none were found. Soundpub currently has **zero sequences, views, materialized views and procedures**, so sequence state and view-query coverage are not exercised and need extension if those object kinds are introduced. No table data, comments, statistics, database ownership, role passwords/memberships, external schemas, external trigger, extension binaries, storage objects or migration ledger is included. Fingerprint is an application catalog contract, not a full-cluster byte hash.

Expected normalization only:

- CR characters in function definitions are removed to compare existing CRLF/LF source transport; function statement order and all other body text are preserved.
- One UUID literal in each of `auto_assign_artist_role` / `auto_assign_new_user_to_soundpub_label` maps to `current_setting('soundpub.migration_signup_label_id')::uuid`.
- One UUID literal in each of `get_royalty_artist_breakdown` / `get_royalty_track_breakdown` maps to `current_setting('soundpub.migration_reporting_label_id')::uuid`.
- ACL and policy-role entry order normalize without weakening privilege/role comparison. Catalog OIDs are compared through object/role names.

No original private identities are reported. The substitutions intentionally prevent raw-body byte equality and do **not** prove the target settings identify the correct business entities.

## Reproduction prerequisites actually used

These are **test stubs**, not a replacement authentication implementation. In each blank local cluster the bootstrap user was `phase1b_cluster_admin`; DDL/function owner postgres is a separate non-superuser with BYPASSRLS, matching live security flags. Roles are cluster-level, so each run uses its own independent cluster.

```sql
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator NOLOGIN NOINHERIT;
CREATE ROLE supabase_auth_admin NOLOGIN;
CREATE ROLE postgres LOGIN BYPASSRLS;
GRANT CREATE ON DATABASE postgres TO postgres;
CREATE SCHEMA auth AUTHORIZATION postgres;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
ALTER TABLE auth.users OWNER TO postgres;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role',true),'') $$;
ALTER FUNCTION auth.uid() OWNER TO postgres;
ALTER FUNCTION auth.role() OWNER TO postgres;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role,supabase_auth_admin;
GRANT anon,authenticated,service_role TO authenticator;
GRANT anon,authenticated,service_role,authenticator TO postgres;
```

Only `auth.users(id)` is required for the **eight external FK references** during DDL creation: auth_events, artist_profiles, copyright_registration_files, copyright_registration_payments, copyright_registrations, notifications, profiles and user_roles. Real signup also needs email/raw_user_meta_data/raw_app_meta_data, which this stub omits. `check_function_bodies=false` in the baseline lets DDL load without proving every deferred runtime reference.

No extra extension was needed to load application DDL on PostgreSQL 17.6; only built-in plpgsql and native gen_random_uuid were present. Live additionally has uuid-ossp 1.1, pgcrypto 1.3, pg_net 0.20.3, pg_stat_statements 1.11, supabase_vault 0.3.1, hypopg 1.4.1, index_advisor 0.2.0 and pg_trgm 1.6. Loading DDL without these is **not** proof that the wider auth/platform/runtime has no extension dependency.

Local locale is `en_US.utf8`; live reports `en_US.UTF-8`. Both identify US-English UTF-8, but libc/collation-version equivalence and sorted-query behavior across images were not proven; no locale-sensitive behavioral PASS is claimed.

## Runnable local procedure

Run only against newly created disposable containers. No production connection belongs in this sequence. Replace the tag with the verified image ID when exact image pinning is required.

```powershell
docker run --detach --name soundpub-phase1b-run1 --network none --memory 512m --cpus 1 --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=phase1b_cluster_admin -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17.6-bookworm
docker exec soundpub-phase1b-run1 pg_isready -U phase1b_cluster_admin -d postgres
```

After readiness, pass the prerequisite SQL block to `docker exec -i soundpub-phase1b-run1 psql -X -U phase1b_cluster_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction`. Each pipeline must have its exit checked before the next step.

```powershell
Get-Content docs/migration/CANONICAL_SCHEMA.sql -Raw |
  docker exec -i soundpub-phase1b-run1 psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction
Get-Content scripts/phase1b-definer-assertions.sql -Raw |
  docker exec -i soundpub-phase1b-run1 psql -X -qAt -U postgres -d postgres -v enforce_security=false
Get-Content scripts/phase1b-definer-assertions.sql -Raw |
  docker exec -i soundpub-phase1b-run1 psql -X -qAt -U postgres -d postgres
```

The last command must currently fail; do not suppress it as an expected overall PASS. Repeat creation/prerequisites/load/fingerprint in a separate fresh `soundpub-phase1b-run2`, compare exact first output lines, and remove only the explicitly named disposable containers. Use the read-only SSH invocation in the definer audit to compare live catalog; never load the baseline into production.

## Canonical migration history strategy

**Recommended, not implemented under this write scope.** Preserve historical files as provenance, not an executable trustworthy chain. Use the reviewed/hardened canonical DDL as a single apply-once baseline only for an empty target namespace, after a separately versioned platform-prerequisite stage. Validate exact current production equivalence before adopting an existing installation.

A runner must use one unique full-width migration version per file, SHA-256 checksum, applied timestamp/status, serialization/advisory lock, transactional application and rollback on failure. Reject modified applied checksums and ambiguous duplicate versions. Record prerequisites, baseline, subsequent migrations and independent verification; do not fabricate historical “applied” entries from filenames. The baseline is intentionally not idempotent; its ledger controls one-time application.

Live `to_regclass('supabase_migrations.schema_migrations')` returned NULL. Current repository scan observed **32 migration files** during concurrent Phase 1B work; the Phase 1 baseline had 30. Repeated eight-digit prefixes remain `20260816`, `20260901`, `20260904`, `20260907`, `20260909`. Neither file count nor matching deployed bodies proves migration ordering or complete application. Existing reset/balance-repair scripts remain unsuitable for blind replay.

## Missing RPC closure classification

Full catalog search across **all schemas** found no function of any signature for the four names below. Repository routes import both pages and expose them through `ProtectedRoute requireAdmin` at `src/App.tsx:308` and `:316`; they are not proven dead code. No alternate schema/name implementation or approved equivalent replacement was found. Therefore all four are **BROKEN FEATURE**, with required functionality if the current Copyright feature is retained; none remains UNKNOWN.

| RPC | Active source flow and contract | Classification / evidence |
| --- | --- | --- |
| `validate_royalty_csv_row` | `src/pages/CopyrightRoyaltyUpload.tsx:135`; sends _composer_code, _composer_name, _total_net_royalti, _period; expects validity/errors and normalized composer/amount/period | **BROKEN FEATURE**. First CSV validation request cannot resolve. Error branch skips row, so all failures can misleadingly toast “All 0 rows are valid!” |
| `import_composer_royalties` | Same page `:184`; sends validated _csv_rows, _period, _filename, _replace_existing; expects success/success_rows/error | **BROKEN FEATURE**. Import SQL contract missing, normally blocked earlier by failed validation |
| `get_royalty_upload_history` | `src/pages/CopyrightRoyaltyUploadHistory.tsx:63`; mount for admin calls _limit=100; expects upload provenance/status/error_summary fields | **BROKEN FEATURE**. Loading history must fail SQL lookup; catches error and shows failure toast |
| `delete_royalty_upload` | Same page `:82`; _upload_id, expects deleted_royalty_records | **BROKEN FEATURE**. Missing destructive SQL contract; no legitimate production deletion was attempted |

The Edge endpoint `delete-royalty-upload` invokes service-only `reverse_royalty_upload` for distribution royalties. It has different naming, transport, response and domain; it does not replace the Copyright composer RPC. Likewise `commit_royalty_upload` imports distribution royalties, not composer_code/total_net_royalti rows. Do not manufacture wrappers from frontend names alone.

This is source-route plus live-catalog proof of a broken backend contract, **not** a real-user browser/API end-to-end run. Public hostname deployment/caching and actual user activity were not exercised. A coordinator/API owner must copy this classification into `API_COMPATIBILITY_MATRIX.md` (outside Agent D write scope), decide whether to repair or formally retire the current feature, specify authorization/accounting contracts, and test the chosen resolution in isolation. No migration-critical RPC remains unclassified; the features remain unresolved.

## Exact blockers to full reproducibility

| Blocker | Independent evidence | Required closure |
| --- | --- | --- |
| Real auth contracts/schema absent | DDL harness has only auth.users(id), auth.uid/role stubs; live auth helpers have different owner and real JWT behavior | Reproduce versioned genuine Supabase auth prerequisites, role ownership/grants and identity/session behavior without production secrets |
| Shared auth trigger omitted | Live enabled `on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION soundpub.handle_new_user()`; absent from schema-filtered canonical baseline | Approved shared-auth ownership integration and trigger stage; isolated signup/profile/role and cross-application tests |
| Two required identity settings unresolved | Four canonical sites call required current_setting; no real target values loaded | Privately resolve distinct signup/reporting labels, provide controlled settings and approved seed/configuration; validate triggers/royalty flags |
| Business label seed dependency | handle_new_user looks up a label profile by role and normalized display name, raises if missing | Deterministic approved seed/ownership procedure; do not create production identities or assume label names uniquely identify tenants |
| Migration ledger/runner absent | Live ledger NULL; repeated version prefixes; baseline second application rejects existing schema | Adopt reviewed checksum/version strategy and isolated failure/rollback tests |
| Privilege model only partly reproduced | Function owner flags and app ACLs match; auth owner/platform memberships/default database state are stubbed/omitted | Reproduce required platform role inheritance, CREATE/TEMP ownership and no extra privilege escalation |
| Storage metadata/platform missing | Canonical includes only soundpub namespace; storage schemas/buckets/policies/objects not initialized here | Versioned storage prerequisites and approved ownership/privacy model; object recovery handled by storage workstream |
| Runtime/extension/collation closure unproven | Stock image loads DDL; real shared platform has additional extensions and locale/image differences | Pin compatible platform images/extensions/collation; exercise deferred runtime dependencies |
| Four active Copyright RPCs absent | All-schema catalog search + active admin routes above | Implement approved contracts or deliberately retire flows with regression proof |
| Canonical security defects intentionally reproduced | READ ONLY regression fails five gates; isolated metadata disclosure/token cleanup/audit spoofing reproduced | Separate reviewed remediation migration with rollback and independent authorization QA |
| Independent verification incomplete | These runs performed by implementation/audit Agent D | QA reruns blank-cluster fingerprints, security checks and full auth/storage/runtime integration |

No application-data restore, password migration, off-host backup, payment webhook replay or external-provider call is part of this proof. Those gates remain assigned to their owners. A matching unsafe schema cannot satisfy the security/recovery gates.

**Decision: deterministic application DDL proven twice; full database reproducibility remains NO; Agent D workstream BLOCKED; Phase 2 NOT READY.**

## Phase 1C Agent D repeatable verification — 2026-10-27

**Full DATABASE REPRODUCIBLE = NO.** Prior observations remain historical evidence. This update adds an executable repeat rather than upgrading the platform gate from application-only parity.

Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/phase1c-database-reproduction.ps1`. Docker must already have `postgres:17.6-bookworm`; the runner verifies its image ID is `sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3` and starts containers by that immutable ID. Each run starts a uniquely named container with fresh tmpfs PGDATA, no network, no published ports, no production files or provider credentials; cleanup occurs in finally. Local trust authentication is confined to these isolated containers. It creates the explicitly limited auth adapters and platform-role prerequisites in source, then loads the unchanged canonical baseline as non-superuser BYPASSRLS postgres. These are test adapters, not genuine GoTrue/Auth/Storage initialization.

| Phase 1C target | Records | Normalized SHA-256 |
| --- | ---: | --- |
| Fresh run 1 | 949 | `d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c` |
| Fresh run 2 | 949 | `d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c` |
| Independently re-read live catalog | 949 | `d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c` |

Canonical file SHA-256 independently remains `786688db5d38b717fa3d3b33860d03c67438a09ca7cd11bc1adfde8d4e8776e8`. The runner asserts equality between fresh runs. Comparison to live is the separately observed result above. Both fresh runs reproduce private-media/metadata disclosure and verify staged maintenance-function ACL/path changes. Restoring the observed original ACL/path state returns the **entire** application catalog to its original fingerprint in both runs. No disposable Agent D containers remain after execution.

Initial runner setup failed because non-superuser postgres lacked CREATE on database postgres; the runner now explicitly grants that isolated baseline prerequisite. A complete subsequent run succeeds twice. This is explicit initialization, not a grant made on production.

Fresh production inspection again finds no supabase_migrations.schema_migrations relation and zero implementations of all four active composer RPC names across all schemas. Live security assertions still exit 3 with the same five Phase 1B failures. No production functions were invoked or changed. See `SECURITY_DEFINER_CLOSURE_REPORT.md`, `TENANT_ISOLATION_REPORT.md` and the appended Phase 1C section in `MISSING_RPC_CLOSURE.md`.

Full genuine Auth/Storage prerequisites, extensions/collation/runtime parity, shared signup trigger and ownership, private label configuration/seed, function/default-grant platform ownership, migration ledger/checksum runner, four composer contracts and independent QA remain the exact outstanding reproduction requirements. The new maintenance migration is **not deployed**, and its local checks do not earn production gate credit. Credential incident and routing clearance must precede production mutation. Neither Phase 2 nor traffic migration is authorized by these results.

