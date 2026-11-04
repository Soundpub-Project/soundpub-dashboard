# Database object manifest

Inspected 2026-10-27, Asia/Bangkok. Source: read-only SSH `maskhar@20.20.20.3`, Compose directory `/data/supabase/instances/supabase-01/config`, service `db`, database `postgres`, schema `soundpub`. PostgreSQL and pg_dump 17.6. Repository baseline: `main`, `48222ffb9c9e60da82d224e1e8aaccd4dd597442`. Pre-existing working changes preserved. No production writes, function execution, user records, token values, or storage contents collected.

## Verified totals

| Object | Count |
| --- | --- |
| Tables | 33 |
| Columns | 426 |
| Functions | 56 |
| SECURITY DEFINER functions | 51 |
| Policies | 78 |
| Non-internal table triggers | 47 |
| Indexes including constraint-backed indexes | 101 |
| Constraints | 109 |
| Foreign keys | 43 |
| Enums | 4 |
| Views / materialized views | 0 / 0 |
| Sequences / procedures | 0 / 0 |
| RLS enabled / forced | 32 / 0 |
| Invalid or unready indexes | 0 |
| Unvalidated constraints | 0 |

The previous audit's table/function/definer/policy totals remain correct. Counts concern Soundpub only, not other applications on this shared host. Row counts below are exact aggregate SELECT counts observed in one READ ONLY transaction (READ COMMITTED); they are not a synchronized backup snapshot and may change during normal traffic.

## Tables, RLS, policies and aggregate counts

| Table | Rows | RLS | Policies |
| --- | --- | --- | --- |
| app_settings | 20 | ON | 2 |
| archived_royalties | 0 | ON | 0 |
| artist_deletion_requests | 0 | ON | 4 |
| artist_profiles | 81 | ON | 8 |
| artists | 132 | ON | 2 |
| audit_logs | 18307 | ON | 1 |
| auth_events | 0 | ON | 1 |
| balance_adjustments | 33 | ON | 0 |
| composer_royalties | 0 | ON | 2 |
| copyright_contracts | 0 | ON | 2 |
| copyright_registration_files | 10 | ON | 3 |
| copyright_registration_payments | 2 | ON | 3 |
| copyright_registration_works | 4 | ON | 2 |
| copyright_registrations | 4 | ON | 4 |
| email_send_log | 169 | ON | 1 |
| notifications | 41 | ON | 3 |
| payout_balance_reservations | 5 | ON | 0 |
| payout_requests | 3 | ON | 2 |
| profiles | 182 | ON | 6 |
| rate_limits | 2 | OFF | 0 |
| release_payments | 9 | ON | 3 |
| releases | 292 | ON | 3 |
| royalties | 14474 | ON | 3 |
| royalty_uploads | 10 | ON | 2 |
| storage_backup_log | 0 | ON | 1 |
| storage_backup_runs | 2 | ON | 1 |
| takedown_request_documents | 0 | ON | 2 |
| takedown_request_items | 24 | ON | 2 |
| takedown_request_targets | 3 | ON | 3 |
| takedown_requests | 3 | ON | 4 |
| takedown_status_history | 0 | ON | 2 |
| tracks | 431 | ON | 3 |
| user_roles | 182 | ON | 3 |

All table and function owners are `postgres`; live postgres is not superuser but has BYPASSRLS. `service_role` also has BYPASSRLS; `anon` and `authenticated` do not. No Soundpub table has FORCE RLS. RLS does not constrain these bypass roles.

## Function security inventory

Effective execution was checked with `has_function_privilege`, including inherited PUBLIC grants. All functions below are owned by postgres. Trigger-return functions cannot be invoked as ordinary RPCs merely because EXECUTE is granted. These checks establish ACL reachability, not successful authorized execution or HTTP exposure.

| Function (identity arguments) | Definer | anon EXECUTE | authenticated EXECUTE | search_path |
| --- | --- | --- | --- | --- |
| `admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text, _revision_notes text, _composer_code text, _contract_number text)` | yes | no | yes | search_path=soundpub |
| `admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text, _draft_pdf_url text, _generated_pdf_url text, _stamped_pdf_url text)` | yes | no | yes | search_path=soundpub |
| `audit_row_change()` | yes | yes | yes | search_path=soundpub, public |
| `audit_sanitize(payload jsonb)` | no | yes | yes | UNSET |
| `auto_assign_artist_role()` | yes | yes | yes | search_path=soundpub, public |
| `auto_assign_new_user_to_soundpub_label()` | yes | yes | yes | search_path=soundpub, public |
| `can_access_takedown_release(_user_id uuid, _release_id uuid)` | yes | yes | yes | search_path=soundpub, public |
| `can_create_takedown_request(_user_id uuid, _label_id uuid)` | yes | yes | yes | search_path=soundpub, public |
| `check_rate_limit(p_identifier text, p_action_type text, p_max_attempts integer, p_window_minutes integer)` | yes | no (post-remediation) | no (post-remediation) | search_path=soundpub, public |
| `cleanup_expired_tokens()` | yes | yes | yes | UNSET |
| `cleanup_rate_limits()` | yes | no (post-remediation) | no (post-remediation) | UNSET |
| `commit_royalty_upload(p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text, p_replace_existing boolean, p_replace_mode text, p_idempotency_key text)` | yes | no | no | search_path=soundpub, public |
| `complete_payout(_payout_id uuid)` | yes | no | no | search_path=soundpub, auth |
| `current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid)` | yes | yes | yes | search_path=soundpub, auth |
| `delete_release_with_refund(p_release_id uuid)` | yes | no | yes | search_path=soundpub, auth, public |
| `enforce_registered_label_release_artist()` | yes | yes | yes | search_path=soundpub, auth, pg_temp |
| `enforce_registered_label_track_artist()` | yes | yes | yes | search_path=soundpub, auth, pg_temp |
| `enforce_release_distribution_service()` | yes | yes | yes | search_path=soundpub, auth, pg_temp |
| `enforce_takedown_request_required_fields()` | yes | yes | yes | search_path=soundpub, pg_temp |
| `generate_composer_code(_prefix text)` | yes | no | yes | search_path=soundpub |
| `generate_copyright_contract_number(_prefix text)` | yes | no | yes | search_path=soundpub |
| `generate_managed_artist_email(_artist_name text)` | no | yes | yes | UNSET |
| `get_artist_profile_summary(_artist_user_id uuid)` | yes | yes | yes | search_path=soundpub, auth |
| `get_dashboard_role_stats()` | yes | yes | yes | search_path=soundpub, auth |
| `get_my_composer_royalties(_period text)` | yes | no | yes | search_path=soundpub |
| `get_royalty_artist_breakdown(_period text, _limit integer)` | yes | yes | yes | search_path=soundpub |
| `get_royalty_comparison(_current_periods text[], _previous_periods text[])` | yes | yes | yes | search_path=soundpub |
| `get_royalty_country_summary(_limit integer)` | yes | yes | yes | search_path=soundpub |
| `get_royalty_label_breakdown(_period text)` | yes | yes | yes | search_path=soundpub |
| `get_royalty_monthly_summary()` | yes | yes | yes | search_path=soundpub |
| `get_royalty_period_summary()` | yes | yes | yes | search_path=soundpub |
| `get_royalty_periods()` | yes | yes | yes | search_path=soundpub |
| `get_royalty_platform_summary(_limit integer)` | yes | yes | yes | search_path=soundpub |
| `get_royalty_stats()` | yes | yes | yes | search_path=soundpub |
| `get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text, _limit integer)` | yes | yes | yes | search_path=soundpub |
| `get_royalty_track_breakdown(_period text)` | yes | yes | yes | search_path=soundpub |
| `get_soundpub_label_id()` | yes | yes | yes | search_path=soundpub, public |
| `get_user_full_name(user_id uuid)` | yes | yes | yes | search_path=soundpub |
| `guard_profile_sensitive_update()` | no | yes | yes | search_path=soundpub, auth, public |
| `handle_new_user()` | yes | no | no | search_path=soundpub, public, auth |
| `has_role(user_id uuid, role soundpub.app_role)` | yes | no | yes | search_path=soundpub |
| `is_admin(user_id uuid)` | yes | no | yes | search_path=soundpub |
| `is_managed_artist_email(_email text)` | no | yes | yes | UNSET |
| `is_soundpub_artist_for_release(_user_id uuid, _label_id uuid)` | yes | yes | yes | search_path=soundpub, pg_temp |
| `is_soundpub_takedown_user(_user_id uuid)` | yes | yes | yes | search_path=soundpub, public |
| `is_superadmin(user_id uuid)` | yes | yes | yes | search_path=soundpub, pg_temp |
| `rebuild_royalty_balances()` | yes | no | no | search_path=soundpub, public |
| `record_auth_audit(p_action text, p_target_id uuid)` | yes | yes | yes | search_path=soundpub, public |
| `repair_orphan_artist_link(_issue_type text, _profile_id uuid, _full_name text, _related_label_id uuid)` | yes | yes | yes | search_path=soundpub, public |
| `request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text)` | yes | no | yes | search_path=soundpub, auth, public |
| `reverse_royalty_upload(p_upload_id uuid, p_actor_id uuid, p_reason text)` | yes | no | no | search_path=soundpub, public |
| `scan_orphan_artist_links()` | yes | yes | yes | search_path=soundpub, public |
| `sync_managed_artist_markers()` | yes | yes | yes | search_path=soundpub, public |
| `update_balance_on_payout_status_change()` | yes | yes | yes | search_path=soundpub |
| `update_payout_status(_payout_id uuid, _status text, _notes text, _proof_path text, _proof_name text)` | yes | no | yes | search_path=soundpub, auth, public |
| `update_timestamp()` | no | yes | yes | UNSET |

At the initial snapshot, 41 functions had effective anon EXECUTE, including 36 definers. Post-remediation, 34/51 definers are anon-executable; client execution of the two limiter functions was revoked. Two definers lack a fixed search_path: `cleanup_expired_tokens`, `cleanup_rate_limits`. Fixed paths containing public still require trust analysis; anon cannot CREATE in public at inspection time. Even soundpub-only paths without explicit pg_temp-last placement need object-resolution review. Fixed search_path alone is not authorization.

## Security findings requiring remediation elsewhere

- CRITICAL: `rate_limits` RLS OFF; anon SELECT, authenticated SELECT/INSERT/UPDATE/DELETE. No row policy protects this table.
- CRITICAL: authenticated has INSERT on `user_roles`; policy `Admins can manage permitted roles` WITH CHECK permits a row for another user with a role other than superadmin without requiring actor-admin. INSERT uses WITH CHECK, so the admin predicate in USING does not protect that path. Constraints still apply. No exploit or mutation was executed.
- HIGH: `scan_orphan_artist_links()` is a postgres definer with effective anon EXECUTE and no actor check in its SQL body. It returns names, UUIDs and cross-label business counts. No output rows were requested.
- HIGH: cleanup functions have PUBLIC-derived anon EXECUTE, no actor check and no fixed search_path; one clears expired profile tokens, one deletes old rate-limit records. The latter lost anonymous EXECUTE after remediation. Neither was executed.
- `record_auth_audit` rejects null auth.uid(), but accepts arbitrary action/target from authenticated callers; event authenticity needs authorization/allowlisting. Anon EXECUTE does not bypass that body check.
- `repair_orphan_artist_link` has broad EXECUTE but explicitly requires admin/superadmin in its body. Broad ACL alone is not proof of anonymous mutation.
- Financial hardening present: commit/reverse/rebuild restricted to service_role (and owner); complete_payout owner-only; request/update payout and delete-with-refund authenticated with body checks. Full financial and role behavior tests remain for security/QA agents.

## Grants and default privileges

Canonical SQL includes all schema, function and relation ACL DDL emitted for soundpub. Schema USAGE: anon, authenticated, service_role, authenticator, supabase_auth_admin; CREATE only postgres. Most application tables grant anon SELECT and authenticated CRUD, constrained by RLS. Exceptions include service-only archived_royalties, balance_adjustments and payout_balance_reservations; financial tables royalties/royalty_uploads/payout_requests grant client SELECT only; auth_events authenticated SELECT only; takedown grants differ and are preserved verbatim. No soundpub-scoped or database-global pg_default_acl rows exist. Standard PostgreSQL defaults therefore matter: new functions default to PUBLIC EXECUTE absent explicit revocation. Other-schema default ACLs are outside this application's baseline.

## Dependencies and boundary

Enums: app_role, takedown_request_type, takedown_status, takedown_target_status. Full ordered labels, column types/defaults/nullability, constraints, FKs, index definitions, trigger definitions, policies and grants appear in CANONICAL_SCHEMA.sql; it is the per-object DDL inventory companion to this manifest.

43 FKs include 8 references to auth.users(id). auth.uid() and auth.role() are external runtime contracts. One external trigger is required on auth.users: `on_auth_user_created AFTER INSERT FOR EACH ROW EXECUTE FUNCTION soundpub.handle_new_user()`. A schema-filtered dump omits it; it is not installed by the canonical artifact because shared-auth integration needs its own ownership and restore plan. Auth users, auth identities, storage metadata/policies and host role membership are not included in this application schema baseline.

Installed extensions: hypopg 1.4.1 (extensions), index_advisor 0.2.0 (extensions), pg_net 0.20.3 (extensions), pg_stat_statements 1.11 (extensions), pg_trgm 1.6 (public), pgcrypto 1.3 (extensions), plpgsql 1.0 (pg_catalog), supabase_vault 0.3.1 (vault), uuid-ossp 1.1 (extensions). No direct Soundpub relation/function dependency on pg_extension was found by catalog query; that does not prove absence of dynamic function references. Schema creation succeeds on stock PostgreSQL 17.6 with standard plpgsql only and native gen_random_uuid(); no added extension is required for tested DDL. Other host extensions are not automatically Soundpub requirements. External auth/runtime behavior remains untested.

## Privacy transformations

Two embedded identity UUID constants in auto_assign_artist_role and get_royalty_artist_breakdown were replaced by current_setting('soundpub.migration_signup_label_id') and current_setting('soundpub.migration_reporting_label_id'). No original identifiers are recorded. These two privately supplied settings are required when those paths execute; missing settings fail rather than silently choosing an identity. Function definitions consequently differ deliberately from live. The managed-email domain pattern is code logic, not an extracted identity. Dump comments and random psql restriction markers were omitted; ownership and ACLs retained.

## Reproduction result

PASS for application DDL with declared external prerequisites; BLOCKED for complete production-equivalent backend reproduction. Local isolated container used postgres:17.6-bookworm, network none, tmpfs database, no published ports or production connection. Minimal auth contracts and roles were created locally, then canonical SQL loaded with psql ON_ERROR_STOP and --single-transaction. All seven primary object totals matched: 33/56/51/78/101/47/109. A schema-only round trip matched the entire multiset of non-comment non-empty dump lines after exactly two declared privacy substitutions and normalization of one semantically unordered policy-role list. This is stronger than count equality but does not validate function behavior, auth integration, data or independent QA. Container removed after inspection.


## Post-baseline live remediation (2026-10-27)

After the initial read-only inventory, production applied `supabase/migrations/20261026202235_harden_database_security_boundaries.sql` manually because no migration ledger exists. It changes no object counts or data rows: authenticated clients retain `user_roles` SELECT but lose INSERT/UPDATE/DELETE; role policy adds admin/self/target hierarchy checks; `rate_limits` RLS is enabled; anon/authenticated limiter table/function access is revoked; service-role access retained. Corrected isolated and production assertions passed. `CANONICAL_SCHEMA.sql` was updated for these policy/RLS/ACL changes. The private full DB archive predates remediation and must replay this migration after restore.
## Phase 1B addendum — 2026-10-27

Two fresh isolated application-schema runs emitted 949 normalized catalog records with identical SHA-256 fingerprints matching normalized live. Full platform reproducibility remains NO because real auth/storage prerequisites, auth trigger/settings, migration ledger and broken RPCs are absent. See `DATABASE_REPRODUCIBILITY_REPORT.md`.
