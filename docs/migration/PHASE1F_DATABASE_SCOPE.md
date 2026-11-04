# Phase 1F Database Scope — Agent G

**Production isolation gate: FAIL. Financial integrity gate: FAIL. Inventory completed read-only; no production changes authorized or performed.**

## Evidence boundary and method

- Target: `maskhar@20.20.20.3`; every remote operation started in `/data/supabase/instances/supabase-01/config`.
- Active Compose database image: `supabase/postgres:17.6.1.136`; SQL server reports PostgreSQL `17.6`, database `postgres`.
- Main catalog/row-count snapshot: **2026-10-27T13:18:50.116086 UTC**. Dependency snapshot: **2026-10-27T13:20:13.824116 UTC**. Shared-identity/Storage snapshot: **2026-10-27T13:22:51.856713 UTC**.
- Final financial assertions and payment/document populations share one **REPEATABLE READ, READ ONLY** transaction at **2026-10-27T13:31:07.912225 UTC**. This is fresh active-production evidence, not a copied Phase 1E result.
- Queries used `psql -X -v ON_ERROR_STOP=1`, explicit read-only transactions, statement timeouts (20–45 seconds), and later batches a three-second lock timeout. Completed audit batches ended with `ROLLBACK`; catalog-query errors also aborted their read-only transactions and were corrected. No DDL, DML, test fixtures, application RPC execution, deployments, container recreation, uploads, or remote file writes.
- Only metadata, aggregate counts, and server-side redacted expressions crossed SSH. No identity IDs, names, emails, bank data, invoice IDs/URLs, object paths, record payloads, credentials, raw environment dumps, or raw function definitions were printed. Policy string literals are `[redacted]`.
- The only repository file created by this audit is this report. Existing worktree changes belong to other work and were left untouched.
- Snapshots from separate transactions are point-in-time observations, not a production freeze. Row estimates were not used as exact row counts.

## Scope decision: application SQL versus shared platform and other apps

A `soundpub`-only schema dump is **not a complete isolated application migration**. Application DDL has concrete Auth dependencies; shared Auth and Storage also depend back on Soundpub objects. Other-app schemas are shared tenancy context, not automatically application SQL prerequisites.

| Scope class | Objects / evidence | Migration boundary |
| --- | --- | --- |
| Application SQL owned here | soundpub: 33 tables, 56 functions, 78 policies, 47 non-internal table triggers, 101 B-tree indexes, 109 constraints (43 FKs), 4 enums; no views, materialized views, sequences, foreign tables, or partitioned tables observed. | Migrate intended app DDL/data with explicit ownership, grants, ordering, and financial reconciliation. |
| Required external SQL contract | auth.users(id uuid); auth.uid(); shared API roles; PL/pgSQL and PostgreSQL built-ins. | Provide real target Auth contract or reviewed identity remapping. Reduced auth stubs establish DDL compatibility only. |
| Shared objects with inbound Soundpub dependency | auth.users.on_auth_user_created calls soundpub.handle_new_user(); storage.objects policies call Soundpub helpers/tables. | Separate explicitly from app schema DDL. Recreating only soundpub omits these hooks/policies; dropping Soundpub can break shared platform behavior. |
| Application migrations touching shared platform | Four local migration files reference storage; signup migration replaces shared Auth trigger function. | Review shared-object changes separately. File presence does not establish live deployment. |
| Shared extensions / roles / search paths | 9 database-wide extensions; shared anon/authenticated/service_role and platform/admin roles; shared PostgREST schema list and fallback search path. | Recreate only required target contracts. Do not clone source cluster authority or all extensions as app-owned state. |
| Other applications sharing database | artikel, buzzerhood, carubra, carubra_db, chatten_cafe, honda, sehatta, utero-artikel, utero_academy, whatsapp; plus mixed public schema. | No direct Soundpub↔other-app FK or catalog dependency found. Shared identities/roles/API exposure create isolation dependencies, not a reason to copy other-app data. |
| Outside SQL proof | Auth lifecycle, gateway/JWT configuration, Storage bytes, deployed Edge Functions, Xendit provider state, backups/restores. | NOT REVERIFIED by this database audit. |


### Local SQL migration evidence

- Local `supabase/migrations` contains **33 SQL files**. Schema-reference scan groups: **17** reference only Soundpub, **12** Auth + Soundpub, **3** Auth + Soundpub + Storage, **1** Soundpub + Storage. This is a textual reference inventory; comments/string references are not parsed SQL execution proof.
- `docs/migration/CANONICAL_SCHEMA.sql` declares **33 Soundpub tables and 56 functions** and contains Soundpub/Auth qualified references. File SHA-256: `786688db5d38b717fa3d3b33860d03c67438a09ca7cd11bc1adfde8d4e8776e8`. Matching object counts alone do not establish definition equality or full reproducibility.
- `scripts/phase1c-database-reproduction.ps1` bootstraps reduced `auth.users(id uuid)`, `auth.uid()`, and roles. It does not recreate real Auth/Storage/runtime state. No reproduction or restore was run in this audit.
- Standard `supabase_migrations.schema_migrations` relation is **absent** in active database. Migration deployment order/history is therefore **NOT REVERIFIED** from a standard ledger.
- Shared-Storage references occur in `20260901_create_takedown_feature.sql`, `20260904_payout_reserve_and_proof.sql`, `20260906_release_invoice_pdfs.sql`, and `20261026215612_make_contracts_private.sql`. The latter's dedicated contract policies were absent from fresh live Storage policy inventory; do not assume staged SQL is deployed.

### Shared schema inventory

Counts describe existing source platform, not the export allowlist. Other-app rows were not exported.

| Schema | Owner | Tables | Views / materialized views |
| --- | --- | --- | --- |
| `_realtime` | `supabase_admin` | 4 | 0 |
| `artikel` | `postgres` | 17 | 0 |
| `auth` | `supabase_admin` | 23 | 0 |
| `buzzerhood` | `postgres` | 34 | 18 |
| `carubra` | `postgres` | 7 | 0 |
| `carubra_db` | `postgres` | 9 | 0 |
| `chatten_cafe` | `postgres` | 21 | 0 |
| `extensions` | `postgres` | 0 | 4 |
| `graphql` | `supabase_admin` | 0 | 0 |
| `graphql_public` | `supabase_admin` | 0 | 0 |
| `honda` | `postgres` | 1 | 0 |
| `net` | `supabase_admin` | 2 | 0 |
| `pgbouncer` | `pgbouncer` | 0 | 0 |
| `public` | `pg_database_owner` | 8 | 1 |
| `realtime` | `supabase_admin` | 10 | 0 |
| `sehatta` | `postgres` | 0 | 0 |
| `soundpub` | `postgres` | 33 | 0 |
| `storage` | `supabase_admin` | 10 | 0 |
| `supabase_functions` | `supabase_admin` | 2 | 0 |
| `utero-artikel` | `postgres` | 2 | 0 |
| `utero_academy` | `postgres` | 62 | 1 |
| `vault` | `supabase_admin` | 1 | 1 |
| `whatsapp` | `postgres` | 1 | 0 |


## Application relation and grant inventory

All 33 tables are owned by `postgres`, enable RLS, and have **FORCE RLS off**. Owner `postgres` has BYPASSRLS; RLS enablement is not owner/service isolation. Four tables have no policies: `archived_royalties`, `balance_adjustments`, `payout_balance_reservations`, `rate_limits`. Ordinary roles with no matching policy are denied; bypass roles remain separate.

Counts below are exact `count(*)` within main catalog snapshot. Grants are ACLs, not proof that rows pass RLS. `ALL (8)` = SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. Owner `postgres` has ALL (8) on every table. All listed explicit table grants were issued by `postgres`, without grant option. No table grants to PUBLIC or other named app roles, column ACLs, or Soundpub/global custom default ACL entries were found.

| soundpub table | Rows | Indexes | Constraints | Policies | anon ACL | authenticated ACL | service_role ACL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `app_settings` | 20 | 2 | 2 | 2 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `archived_royalties` | 0 | 1 | 1 | 0 | — | — | ALL (8) |
| `artist_deletion_requests` | 0 | 1 | 4 | 4 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `artist_profiles` | 81 | 4 | 3 | 8 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `artists` | 132 | 2 | 2 | 2 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `audit_logs` | 18307 | 7 | 1 | 1 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `auth_events` | 0 | 4 | 2 | 1 | — | SELECT | ALL (8) |
| `balance_adjustments` | 33 | 2 | 4 | 0 | — | — | ALL (8) |
| `composer_royalties` | 0 | 4 | 1 | 2 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `copyright_contracts` | 0 | 4 | 5 | 2 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `copyright_registration_files` | 10 | 2 | 5 | 3 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `copyright_registration_payments` | 2 | 3 | 6 | 3 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `copyright_registration_works` | 4 | 2 | 4 | 2 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `copyright_registrations` | 4 | 4 | 4 | 4 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `email_send_log` | 169 | 2 | 1 | 1 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `notifications` | 41 | 2 | 2 | 3 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `payout_balance_reservations` | 5 | 1 | 4 | 0 | — | — | ALL (8) |
| `payout_requests` | 3 | 2 | 4 | 2 | SELECT | SELECT | ALL (8) |
| `profiles` | 182 | 7 | 6 | 6 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `rate_limits` | 2 | 4 | 2 | 0 | — | — | ALL (8) |
| `release_payments` | 9 | 4 | 2 | 3 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `releases` | 292 | 4 | 8 | 3 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `royalties` | 14474 | 8 | 4 | 3 | SELECT | SELECT | ALL (8) |
| `royalty_uploads` | 10 | 3 | 3 | 2 | SELECT | SELECT | ALL (8) |
| `storage_backup_log` | 0 | 2 | 2 | 1 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `storage_backup_runs` | 3 | 1 | 1 | 1 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `takedown_request_documents` | 0 | 3 | 4 | 2 | — | INSERT,SELECT,UPDATE | — |
| `takedown_request_items` | 24 | 2 | 4 | 2 | — | INSERT,SELECT,UPDATE | — |
| `takedown_request_targets` | 3 | 2 | 2 | 3 | — | INSERT,SELECT,UPDATE | — |
| `takedown_requests` | 3 | 3 | 6 | 4 | — | INSERT,SELECT,UPDATE | — |
| `takedown_status_history` | 0 | 1 | 3 | 2 | — | INSERT,SELECT | — |
| `tracks` | 431 | 5 | 4 | 3 | SELECT | SELECT, INSERT, UPDATE, DELETE | ALL (8) |
| `user_roles` | 182 | 3 | 3 | 3 | SELECT | SELECT | ALL (8) |


All 101 indexes were valid and ready; observed operator classes are PostgreSQL built-ins (bool, enum, int4, numeric, text, timestamptz, uuid). No Soundpub publication membership or all-tables publication was observed.

Enums: `soundpub.app_role`, `soundpub.takedown_request_type`, `soundpub.takedown_status`, `soundpub.takedown_target_status`; all owned by `postgres`, with USAGE for owner and PUBLIC. Enum labels were not needed for this boundary audit.

### Foreign keys and migration order

**43 FKs total: 35 within Soundpub, 8 to Auth, no inbound FK from other apps.** All inventoried FKs are validated. Delete actions below are operational dependencies, not authorization to delete data.

| Source table / columns | Referenced table / columns | ON DELETE |
| --- | --- | --- |
| `soundpub.artist_deletion_requests(artist_id)` | `soundpub.profiles(id)` | CASCADE |
| `soundpub.artist_deletion_requests(label_id)` | `soundpub.profiles(id)` | CASCADE |
| `soundpub.artist_profiles(user_id)` | `auth.users(id)` | CASCADE |
| `soundpub.artists(label_id)` | `soundpub.profiles(id)` | CASCADE |
| `soundpub.auth_events(user_id)` | `auth.users(id)` | CASCADE |
| `soundpub.balance_adjustments(profile_id)` | `soundpub.profiles(id)` | NO ACTION |
| `soundpub.copyright_contracts(registration_id)` | `soundpub.copyright_registrations(id)` | CASCADE |
| `soundpub.copyright_registration_files(registration_id)` | `soundpub.copyright_registrations(id)` | CASCADE |
| `soundpub.copyright_registration_files(uploaded_by)` | `auth.users(id)` | SET NULL |
| `soundpub.copyright_registration_files(work_id)` | `soundpub.copyright_registration_works(id)` | CASCADE |
| `soundpub.copyright_registration_payments(registration_id)` | `soundpub.copyright_registrations(id)` | CASCADE |
| `soundpub.copyright_registration_payments(user_id)` | `auth.users(id)` | CASCADE |
| `soundpub.copyright_registration_works(registration_id)` | `soundpub.copyright_registrations(id)` | CASCADE |
| `soundpub.copyright_registrations(user_id)` | `auth.users(id)` | CASCADE |
| `soundpub.notifications(user_id)` | `auth.users(id)` | CASCADE |
| `soundpub.payout_balance_reservations(payout_id)` | `soundpub.payout_requests(id)` | CASCADE |
| `soundpub.payout_balance_reservations(profile_id)` | `soundpub.profiles(id)` | NO ACTION |
| `soundpub.payout_requests(processed_by)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.payout_requests(user_id)` | `soundpub.profiles(id)` | NO ACTION |
| `soundpub.profiles(id)` | `auth.users(id)` | CASCADE |
| `soundpub.profiles(parent_label_id)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.release_payments(release_id)` | `soundpub.releases(id)` | CASCADE |
| `soundpub.releases(artist_user_id)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.releases(created_by)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.releases(label_id)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.royalties(artist_user_id)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.royalties(label_user_id)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.royalties(upload_id)` | `soundpub.royalty_uploads(id)` | NO ACTION |
| `soundpub.royalty_uploads(user_id)` | `soundpub.profiles(id)` | NO ACTION |
| `soundpub.takedown_request_documents(request_id)` | `soundpub.takedown_requests(id)` | CASCADE |
| `soundpub.takedown_request_documents(uploaded_by)` | `soundpub.profiles(id)` | CASCADE |
| `soundpub.takedown_request_items(release_id)` | `soundpub.releases(id)` | RESTRICT |
| `soundpub.takedown_request_items(request_id)` | `soundpub.takedown_requests(id)` | CASCADE |
| `soundpub.takedown_request_items(track_id)` | `soundpub.tracks(id)` | RESTRICT |
| `soundpub.takedown_request_targets(request_id)` | `soundpub.takedown_requests(id)` | CASCADE |
| `soundpub.takedown_requests(label_id)` | `soundpub.profiles(id)` | RESTRICT |
| `soundpub.takedown_requests(requester_id)` | `soundpub.profiles(id)` | CASCADE |
| `soundpub.takedown_requests(reviewer_id)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.takedown_status_history(changed_by)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.takedown_status_history(request_id)` | `soundpub.takedown_requests(id)` | CASCADE |
| `soundpub.tracks(artist_user_id)` | `soundpub.profiles(id)` | SET NULL |
| `soundpub.tracks(release_id)` | `soundpub.releases(id)` | CASCADE |
| `soundpub.user_roles(user_id)` | `auth.users(id)` | CASCADE |


Target ordering requires platform roles/Auth contract first, then Soundpub schema/enums/tables/data/FKs/functions/grants/policies/triggers in dependency-safe order, then separately reviewed shared Auth trigger and Storage policies. Financial and identity decisions remain migration gates.

## Function and execute-grant inventory

**56 functions: 51 SECURITY DEFINER, 5 invoker; 12 return trigger.** All owned by `postgres`. Effective EXECUTE: anon **39**, authenticated **49**, service_role **54**; **34 definers** are executable by anon. **39 functions** have PUBLIC EXECUTE. A grant on a trigger function does not make it directly callable as an ordinary RPC. Effective grants also do not prove function-body authorization.

Columns A/U/S/P mean effective anon/authenticated/service_role EXECUTE and explicit/default PUBLIC EXECUTE. `—` search path means no function-level setting. Table shows full identities; no routine was invoked.

| Function identity | Language / result | Security | search_path | A/U/S/P |
| --- | --- | --- | --- | --- |
| `admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text, _revision_notes text, _composer_code text, _contract_number text)` | plpgsql / `soundpub.copyright_registrations` | DEFINER | `soundpub` | N/Y/Y/N |
| `admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text, _draft_pdf_url text, _generated_pdf_url text, _stamped_pdf_url text)` | plpgsql / `soundpub.copyright_contracts` | DEFINER | `soundpub` | N/Y/Y/N |
| `audit_row_change()` | plpgsql / `trigger` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `audit_sanitize(payload jsonb)` | sql / `jsonb` | INVOKER | `—` | Y/Y/Y/Y |
| `auto_assign_artist_role()` | plpgsql / `trigger` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `auto_assign_new_user_to_soundpub_label()` | plpgsql / `trigger` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `can_access_takedown_release(_user_id uuid, _release_id uuid)` | sql / `boolean` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `can_create_takedown_request(_user_id uuid, _label_id uuid)` | sql / `boolean` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `check_rate_limit(p_identifier text, p_action_type text, p_max_attempts integer, p_window_minutes integer)` | plpgsql / `jsonb` | DEFINER | `soundpub, public` | N/N/Y/N |
| `cleanup_expired_tokens()` | plpgsql / `void` | DEFINER | `—` | Y/Y/Y/Y |
| `cleanup_rate_limits()` | plpgsql / `void` | DEFINER | `—` | N/N/Y/N |
| `commit_royalty_upload(p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text, p_replace_existing boolean, p_replace_mode text, p_idempotency_key text)` | plpgsql / `jsonb` | DEFINER | `soundpub, public` | N/N/Y/N |
| `complete_payout(_payout_id uuid)` | plpgsql / `void` | DEFINER | `soundpub, auth` | N/N/N/N |
| `current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid)` | sql / `boolean` | DEFINER | `soundpub, auth` | Y/Y/Y/N |
| `delete_release_with_refund(p_release_id uuid)` | plpgsql / `jsonb` | DEFINER | `soundpub, auth, public` | N/Y/N/N |
| `enforce_registered_label_release_artist()` | plpgsql / `trigger` | DEFINER | `soundpub, auth, pg_temp` | Y/Y/Y/Y |
| `enforce_registered_label_track_artist()` | plpgsql / `trigger` | DEFINER | `soundpub, auth, pg_temp` | Y/Y/Y/Y |
| `enforce_release_distribution_service()` | plpgsql / `trigger` | DEFINER | `soundpub, auth, pg_temp` | Y/Y/Y/Y |
| `enforce_takedown_request_required_fields()` | plpgsql / `trigger` | DEFINER | `soundpub, pg_temp` | Y/Y/Y/Y |
| `generate_composer_code(_prefix text)` | plpgsql / `text` | DEFINER | `soundpub` | N/Y/Y/N |
| `generate_copyright_contract_number(_prefix text)` | plpgsql / `TABLE(contract_sequence integer, contract_month_roman text, contract_code text, contract_year integer, contract_number text)` | DEFINER | `soundpub` | N/Y/Y/N |
| `generate_managed_artist_email(_artist_name text)` | plpgsql / `text` | INVOKER | `—` | Y/Y/Y/Y |
| `get_artist_profile_summary(_artist_user_id uuid)` | plpgsql / `jsonb` | DEFINER | `soundpub, auth` | Y/Y/Y/Y |
| `get_dashboard_role_stats()` | plpgsql / `TABLE(total_revenue numeric, available_balance numeric, total_streams bigint, unique_tracks bigint)` | DEFINER | `soundpub, auth` | Y/Y/Y/Y |
| `get_my_composer_royalties(_period text)` | plpgsql / `TABLE(id uuid, composer_code text, composer_name text, total_net_royalti numeric, period text, upload_id uuid, created_at timestamp with time zone)` | DEFINER | `soundpub` | N/Y/Y/N |
| `get_royalty_artist_breakdown(_period text, _limit integer)` | sql / `TABLE(artist_name text, revenue numeric, streams bigint, track_count bigint, is_soundpub boolean, artist_share numeric, label_share numeric, admin_share numeric)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_royalty_comparison(_current_periods text[], _previous_periods text[])` | sql / `TABLE(data_type text, period text, revenue numeric, streams bigint)` | DEFINER | `soundpub` | Y/Y/Y/N |
| `get_royalty_country_summary(_limit integer)` | sql / `TABLE(country text, revenue numeric, streams bigint)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_royalty_label_breakdown(_period text)` | sql / `TABLE(label_name text, revenue numeric, streams bigint, artist_share numeric, label_share numeric, admin_share numeric)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_royalty_monthly_summary()` | sql / `TABLE(period text, revenue numeric, streams bigint)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_royalty_period_summary()` | sql / `TABLE(period text, revenue numeric, streams bigint, unique_tracks bigint, unique_artists bigint, unique_labels bigint, top_platform text, top_country text, growth numeric)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_royalty_periods()` | sql / `TABLE(period text)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_royalty_platform_summary(_limit integer)` | sql / `TABLE(platform text, revenue numeric, streams bigint)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_royalty_stats()` | sql / `TABLE(total_revenue numeric, total_streams bigint, unique_artists bigint, unique_labels bigint, unique_platforms bigint, unique_tracks bigint)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text, _limit integer)` | plpgsql / `TABLE(name text, revenue numeric, streams bigint, growth numeric)` | DEFINER | `soundpub` | Y/Y/Y/N |
| `get_royalty_track_breakdown(_period text)` | sql / `TABLE(isrc text, title text, artist_name text, label text, revenue numeric, streams bigint, platform_count bigint, country_count bigint, is_soundpub boolean, artist_share numeric, label_share numeric, admin_share numeric)` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `get_soundpub_label_id()` | sql / `uuid` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `get_user_full_name(user_id uuid)` | plpgsql / `text` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `guard_profile_sensitive_update()` | plpgsql / `trigger` | INVOKER | `soundpub, auth, public` | Y/Y/Y/Y |
| `handle_new_user()` | plpgsql / `trigger` | DEFINER | `soundpub, public, auth` | N/N/Y/N |
| `has_role(user_id uuid, role soundpub.app_role)` | plpgsql / `boolean` | DEFINER | `soundpub` | N/Y/Y/N |
| `is_admin(user_id uuid)` | plpgsql / `boolean` | DEFINER | `soundpub` | N/Y/Y/N |
| `is_managed_artist_email(_email text)` | sql / `boolean` | INVOKER | `—` | Y/Y/Y/Y |
| `is_soundpub_artist_for_release(_user_id uuid, _label_id uuid)` | sql / `boolean` | DEFINER | `soundpub, pg_temp` | Y/Y/Y/Y |
| `is_soundpub_takedown_user(_user_id uuid)` | sql / `boolean` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `is_superadmin(user_id uuid)` | sql / `boolean` | DEFINER | `soundpub, pg_temp` | Y/Y/Y/Y |
| `rebuild_royalty_balances()` | plpgsql / `void` | DEFINER | `soundpub, public` | N/N/Y/N |
| `record_auth_audit(p_action text, p_target_id uuid)` | plpgsql / `void` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `repair_orphan_artist_link(_issue_type text, _profile_id uuid, _full_name text, _related_label_id uuid)` | plpgsql / `jsonb` | DEFINER | `soundpub, public` | Y/Y/Y/N |
| `request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text)` | plpgsql / `uuid` | DEFINER | `soundpub, auth, public` | N/Y/Y/N |
| `reverse_royalty_upload(p_upload_id uuid, p_actor_id uuid, p_reason text)` | plpgsql / `jsonb` | DEFINER | `soundpub, public` | N/N/Y/N |
| `scan_orphan_artist_links()` | sql / `TABLE(issue_type text, profile_id uuid, full_name text, current_label_id uuid, current_label_name text, related_label_id uuid, related_label_name text, release_count bigint, track_count bigint, royalty_count bigint, reason text)` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `sync_managed_artist_markers()` | plpgsql / `trigger` | DEFINER | `soundpub, public` | Y/Y/Y/Y |
| `update_balance_on_payout_status_change()` | plpgsql / `trigger` | DEFINER | `soundpub` | Y/Y/Y/Y |
| `update_payout_status(_payout_id uuid, _status text, _notes text, _proof_path text, _proof_name text)` | plpgsql / `void` | DEFINER | `soundpub, auth, public` | N/Y/Y/N |
| `update_timestamp()` | plpgsql / `trigger` | INVOKER | `—` | Y/Y/Y/Y |


No additional function ACL grantees were found except `supabase_auth_admin` EXECUTE on `handle_new_user()`; owner retains EXECUTE. No grant options were present in function ACL inventory.

### Fresh function findings

- **FAIL:** `cleanup_expired_tokens()` and `cleanup_rate_limits()` lack a fixed function-level search path. The former remains executable by both client roles and updates profile token fields; the latter is service-only. No cleanup was executed.
- **FAIL:** `scan_orphan_artist_links()` and `get_user_full_name(uuid)` retain anon EXECUTE. Redacted source review confirms arbitrary identity name lookup has no actor/ownership gate. Orphan scan outputs include identity/name fields; it was not invoked.
- **FAIL:** all four expected copyright RPC names are absent: `import_composer_royalties`, `validate_royalty_csv_row`, `delete_royalty_upload`, `get_royalty_upload_history`. This is fresh catalog absence, not a frontend or business-contract test.
- **Observed limited boundary:** `check_rate_limit`, `cleanup_rate_limits`, `commit_royalty_upload`, `reverse_royalty_upload`, `rebuild_royalty_balances`, and `complete_payout` are not executable by anon/authenticated. `complete_payout(uuid)` is also **not executable by service_role**; other authorization/success paths were not exercised.
- Many definers include `public` in search path; paths without explicit final `pg_temp` need separate safe-resolution review. No anon/authenticated CREATE on surveyed schemas was found. Fixed-path presence alone is not proof of safety.
- `auto_assign_artist_role`, `auto_assign_new_user_to_soundpub_label`, `get_royalty_artist_breakdown`, and `get_royalty_track_breakdown` contain embedded UUID literals (values suppressed). These are identity-dependent migration inputs.
- All 56 bodies were checked for dynamic `EXECUTE` text; none matched. No Soundpub function body matched `auth.jwt()`; `handle_new_user` references user metadata. These are lexical checks, not a full SQL interpreter or security proof.
- Royalty reporting functions with no direct `auth.uid()` match must not be called ungated solely on that basis: fresh redacted source shows `get_royalty_stats` and `get_royalty_artist_breakdown` call `current_user_can_view_royalty`.

## Policy inventory

**78 Soundpub policies, all permissive; 5 target PUBLIC.** Eight Storage policies were found in total, all on `storage.objects`, all permissive. All eight are included below, including the takedown upload policy without Soundpub in its name.

String constants are redacted before output; identifiers/operators remain. Empty WITH CHECK is shown as `—`; for UPDATE/ALL PostgreSQL can reuse USING when WITH CHECK is omitted. Policy name or role alone does not prove row authorization.

| Schema.table / policy | Command / roles | USING (redacted) | WITH CHECK (redacted) |
| --- | --- | --- | --- |
| `soundpub.app_settings` / `Anyone can view app settings` | SELECT / `anon,authenticated` | `true` | — |
| `soundpub.app_settings` / `Superadmins can manage app settings` | ALL / `PUBLIC` | `soundpub.has_role(auth.uid(), '[redacted]'::soundpub.app_role)` | — |
| `soundpub.artist_deletion_requests` / `Admin can update requests` | UPDATE / `PUBLIC` | `(EXISTS ( SELECT 1 FROM soundpub.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['[redacted]'::soundpub.app_role, '[redacted]'::soundpub.app_role])))))` | — |
| `soundpub.artist_deletion_requests` / `Admin can view all requests` | SELECT / `PUBLIC` | `(EXISTS ( SELECT 1 FROM soundpub.user_roles WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = ANY (ARRAY['[redacted]'::soundpub.app_role, '[redacted]'::soundpub.app_role])))))` | — |
| `soundpub.artist_deletion_requests` / `Label can insert their own requests` | INSERT / `PUBLIC` | — | `(label_id = auth.uid())` |
| `soundpub.artist_deletion_requests` / `Label can view their own requests` | SELECT / `PUBLIC` | `(label_id = auth.uid())` | — |
| `soundpub.artist_profiles` / `Admins can manage all artist profiles` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.artist_profiles` / `Labels can delete artist profiles for their artists` | DELETE / `authenticated` | `(auth.uid() = ( SELECT profiles.parent_label_id FROM soundpub.profiles WHERE (profiles.id = artist_profiles.user_id)))` | — |
| `soundpub.artist_profiles` / `Labels can insert artist profiles for their artists` | INSERT / `authenticated` | — | `(auth.uid() = ( SELECT profiles.parent_label_id FROM soundpub.profiles WHERE (profiles.id = artist_profiles.user_id)))` |
| `soundpub.artist_profiles` / `Labels can update artist profiles for their artists` | UPDATE / `authenticated` | `(auth.uid() = ( SELECT profiles.parent_label_id FROM soundpub.profiles WHERE (profiles.id = artist_profiles.user_id)))` | — |
| `soundpub.artist_profiles` / `Labels can view artist profiles for their artists` | SELECT / `authenticated` | `(auth.uid() = ( SELECT profiles.parent_label_id FROM soundpub.profiles WHERE (profiles.id = artist_profiles.user_id)))` | — |
| `soundpub.artist_profiles` / `Users can insert own artist profile` | INSERT / `authenticated` | — | `(user_id = auth.uid())` |
| `soundpub.artist_profiles` / `Users can update own artist profile` | UPDATE / `authenticated` | `(user_id = auth.uid())` | — |
| `soundpub.artist_profiles` / `Users can view own artist profile` | SELECT / `authenticated` | `(user_id = auth.uid())` | — |
| `soundpub.artists` / `Admins can manage all artists` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.artists` / `Labels can manage their artists` | ALL / `authenticated` | `(label_id = auth.uid())` | — |
| `soundpub.audit_logs` / `Admins can view audit logs` | SELECT / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.auth_events` / `Admins can view auth events` | SELECT / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.composer_royalties` / `Admins can manage composer royalties` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.composer_royalties` / `Copyright users can view royalties by composer code` | SELECT / `authenticated` | `(soundpub.has_role(auth.uid(), '[redacted]'::soundpub.app_role) AND (EXISTS ( SELECT 1 FROM soundpub.profiles p WHERE ((p.id = auth.uid()) AND (p.composer_code IS NOT NULL) AND (p.composer_code = composer_royalties.composer_id)))))` | — |
| `soundpub.copyright_contracts` / `Admins can manage copyright contracts` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | `soundpub.is_admin(auth.uid())` |
| `soundpub.copyright_contracts` / `Users can view their copyright contracts` | SELECT / `authenticated` | `(soundpub.is_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM soundpub.copyright_registrations cr WHERE ((cr.id = copyright_contracts.registration_id) AND (cr.user_id = auth.uid())))))` | — |
| `soundpub.copyright_registration_files` / `Admins can manage copyright files` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | `soundpub.is_admin(auth.uid())` |
| `soundpub.copyright_registration_files` / `Users can upload copyright files` | INSERT / `authenticated` | — | `((uploaded_by = auth.uid()) AND (soundpub.is_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM soundpub.copyright_registrations cr WHERE ((cr.id = copyright_registration_files.registration_id) AND (cr.user_id = auth.uid()) AND (cr.status = ANY (ARRAY['[redacted]'::text, '[redacted]'::text])))))))` |
| `soundpub.copyright_registration_files` / `Users can view their copyright files` | SELECT / `authenticated` | `(soundpub.is_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM soundpub.copyright_registrations cr WHERE ((cr.id = copyright_registration_files.registration_id) AND (cr.user_id = auth.uid())))))` | — |
| `soundpub.copyright_registration_payments` / `Admins can manage copyright payments` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | `soundpub.is_admin(auth.uid())` |
| `soundpub.copyright_registration_payments` / `Users can create their copyright payments` | INSERT / `authenticated` | — | `((user_id = auth.uid()) AND (amount = (100000)::numeric) AND (includes_emeterai = true) AND (emeterai_quantity = 1) AND (EXISTS ( SELECT 1 FROM soundpub.copyright_registrations cr WHERE ((cr.id = copyright_registration_payments.registration_id) AND (cr.user_id = auth.uid())))))` |
| `soundpub.copyright_registration_payments` / `Users can view their copyright payments` | SELECT / `authenticated` | `((user_id = auth.uid()) OR soundpub.is_admin(auth.uid()))` | — |
| `soundpub.copyright_registration_works` / `Users can manage draft copyright works` | ALL / `authenticated` | `((EXISTS ( SELECT 1 FROM soundpub.copyright_registrations cr WHERE ((cr.id = copyright_registration_works.registration_id) AND (cr.user_id = auth.uid()) AND (cr.status = ANY (ARRAY['[redacted]'::text, '[redacted]'::text]))))) OR soundpub.is_admin(auth.uid()))` | `((EXISTS ( SELECT 1 FROM soundpub.copyright_registrations cr WHERE ((cr.id = copyright_registration_works.registration_id) AND (cr.user_id = auth.uid()) AND (cr.status = ANY (ARRAY['[redacted]'::text, '[redacted]'::text]))))) OR soundpub.is_admin(auth.uid()))` |
| `soundpub.copyright_registration_works` / `Users can view their copyright works` | SELECT / `authenticated` | `(soundpub.is_admin(auth.uid()) OR (EXISTS ( SELECT 1 FROM soundpub.copyright_registrations cr WHERE ((cr.id = copyright_registration_works.registration_id) AND (cr.user_id = auth.uid())))))` | — |
| `soundpub.copyright_registrations` / `Admins can manage copyright registrations` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | `soundpub.is_admin(auth.uid())` |
| `soundpub.copyright_registrations` / `Users can create their copyright registrations` | INSERT / `authenticated` | — | `(user_id = auth.uid())` |
| `soundpub.copyright_registrations` / `Users can update draft copyright registrations` | UPDATE / `authenticated` | `((user_id = auth.uid()) AND (status = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text])))` | `((user_id = auth.uid()) AND (status = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text])) AND (composer_code IS NULL) AND (contract_number IS NULL))` |
| `soundpub.copyright_registrations` / `Users can view their copyright registrations` | SELECT / `authenticated` | `((user_id = auth.uid()) OR soundpub.is_admin(auth.uid()))` | — |
| `soundpub.email_send_log` / `Admins can view email logs` | SELECT / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.notifications` / `Admins can manage all notifications` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.notifications` / `Users can update own notifications` | UPDATE / `authenticated` | `((user_id = auth.uid()) OR (is_global = true))` | — |
| `soundpub.notifications` / `Users can view own and global notifications` | SELECT / `authenticated` | `((user_id = auth.uid()) OR (is_global = true))` | — |
| `soundpub.payout_requests` / `Admins can manage all payouts` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.payout_requests` / `Users can view own payouts` | SELECT / `authenticated` | `(user_id = auth.uid())` | — |
| `soundpub.profiles` / `Admins can manage all profiles` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.profiles` / `Admins can view all profiles` | SELECT / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.profiles` / `Labels can update their artists` | UPDATE / `authenticated` | `(parent_label_id = auth.uid())` | — |
| `soundpub.profiles` / `Labels can view their artists` | SELECT / `authenticated` | `(parent_label_id = auth.uid())` | — |
| `soundpub.profiles` / `Users can update own profile` | UPDATE / `authenticated` | `(id = auth.uid())` | `(id = auth.uid())` |
| `soundpub.profiles` / `Users can view own profile` | SELECT / `authenticated` | `(id = auth.uid())` | — |
| `soundpub.release_payments` / `Admins can manage all payments` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.release_payments` / `Users can insert their own payments` | INSERT / `authenticated` | — | `(user_id = auth.uid())` |
| `soundpub.release_payments` / `Users can view their own payments` | SELECT / `authenticated` | `(user_id = auth.uid())` | — |
| `soundpub.releases` / `Admins can manage all releases` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.releases` / `Artists can view own releases` | SELECT / `authenticated` | `(artist_name = soundpub.get_user_full_name(auth.uid()))` | — |
| `soundpub.releases` / `Labels can manage own releases` | ALL / `authenticated` | `((label_id = auth.uid()) OR (created_by = auth.uid()))` | — |
| `soundpub.royalties` / `Admins can view all royalties` | SELECT / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.royalties` / `Artists can view their royalties` | SELECT / `authenticated` | `(artist_user_id = auth.uid())` | — |
| `soundpub.royalties` / `Labels can view their royalties` | SELECT / `authenticated` | `((label_user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM soundpub.profiles artist_profile WHERE ((artist_profile.id = royalties.artist_user_id) AND (artist_profile.parent_label_id = auth.uid())))))` | — |
| `soundpub.royalty_uploads` / `Admins can view all uploads` | SELECT / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.royalty_uploads` / `Users can view own uploads` | SELECT / `authenticated` | `(user_id = auth.uid())` | — |
| `soundpub.storage_backup_log` / `Admins can manage backup logs` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.storage_backup_runs` / `Admins can manage backup runs` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.takedown_request_documents` / `Upload takedown documents` | INSERT / `authenticated` | — | `((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM soundpub.takedown_requests tr WHERE ((tr.id = takedown_request_documents.request_id) AND ((tr.requester_id = auth.uid()) OR soundpub.is_admin(auth.uid()))))))` |
| `soundpub.takedown_request_documents` / `View takedown documents` | SELECT / `authenticated` | `(EXISTS ( SELECT 1 FROM soundpub.takedown_requests tr WHERE ((tr.id = takedown_request_documents.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()) OR (tr.label_id = auth.uid())))))` | — |
| `soundpub.takedown_request_items` / `Create takedown items` | INSERT / `authenticated` | — | `((EXISTS ( SELECT 1 FROM soundpub.takedown_requests tr WHERE ((tr.id = takedown_request_items.request_id) AND (tr.requester_id = auth.uid())))) AND soundpub.can_access_takedown_release(auth.uid(), release_id))` |
| `soundpub.takedown_request_items` / `View takedown items` | SELECT / `authenticated` | `(EXISTS ( SELECT 1 FROM soundpub.takedown_requests tr WHERE ((tr.id = takedown_request_items.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()) OR (tr.label_id = auth.uid())))))` | — |
| `soundpub.takedown_request_targets` / `Admins update takedown targets` | UPDATE / `authenticated` | `soundpub.is_admin(auth.uid())` | `soundpub.is_admin(auth.uid())` |
| `soundpub.takedown_request_targets` / `Create takedown targets` | INSERT / `authenticated` | — | `(EXISTS ( SELECT 1 FROM soundpub.takedown_requests tr WHERE ((tr.id = takedown_request_targets.request_id) AND (tr.requester_id = auth.uid()))))` |
| `soundpub.takedown_request_targets` / `View takedown targets` | SELECT / `authenticated` | `(EXISTS ( SELECT 1 FROM soundpub.takedown_requests tr WHERE ((tr.id = takedown_request_targets.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()) OR (tr.label_id = auth.uid())))))` | — |
| `soundpub.takedown_requests` / `Admins manage takedown requests` | UPDATE / `authenticated` | `soundpub.is_admin(auth.uid())` | `soundpub.is_admin(auth.uid())` |
| `soundpub.takedown_requests` / `Eligible users can create takedown requests` | INSERT / `authenticated` | — | `((requester_id = auth.uid()) AND soundpub.can_create_takedown_request(auth.uid(), label_id))` |
| `soundpub.takedown_requests` / `Takedown users can view scoped requests` | SELECT / `authenticated` | `(soundpub.is_admin(auth.uid()) OR (requester_id = auth.uid()) OR (label_id = auth.uid()))` | — |
| `soundpub.takedown_requests` / `Users can cancel own unsent takedown requests` | UPDATE / `authenticated` | `((requester_id = auth.uid()) AND (status = ANY (ARRAY['[redacted]'::soundpub.takedown_status, '[redacted]'::soundpub.takedown_status, '[redacted]'::soundpub.takedown_status, '[redacted]'::soundpub.takedown_status])))` | `((requester_id = auth.uid()) AND (status = ANY (ARRAY['[redacted]'::soundpub.takedown_status, '[redacted]'::soundpub.takedown_status])))` |
| `soundpub.takedown_status_history` / `Insert takedown history` | INSERT / `authenticated` | — | `((changed_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM soundpub.takedown_requests tr WHERE ((tr.id = takedown_status_history.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()))))))` |
| `soundpub.takedown_status_history` / `View takedown history` | SELECT / `authenticated` | `(EXISTS ( SELECT 1 FROM soundpub.takedown_requests tr WHERE ((tr.id = takedown_status_history.request_id) AND (soundpub.is_admin(auth.uid()) OR (tr.requester_id = auth.uid()) OR (tr.label_id = auth.uid())))))` | — |
| `soundpub.tracks` / `Admins can manage all tracks` | ALL / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.tracks` / `Artists can view own tracks` | SELECT / `authenticated` | `(artist_name = soundpub.get_user_full_name(auth.uid()))` | — |
| `soundpub.tracks` / `Labels can manage tracks from own releases` | ALL / `authenticated` | `(EXISTS ( SELECT 1 FROM soundpub.releases WHERE ((releases.id = tracks.release_id) AND ((releases.label_id = auth.uid()) OR (releases.created_by = auth.uid())))))` | — |
| `soundpub.user_roles` / `Admins can manage permitted roles` | ALL / `authenticated` | `(soundpub.is_admin(auth.uid()) AND (user_id <> auth.uid()) AND (soundpub.is_superadmin(auth.uid()) OR ((role <> '[redacted]'::soundpub.app_role) AND (NOT soundpub.has_role(user_id, '[redacted]'::soundpub.app_role)))))` | `(soundpub.is_admin(auth.uid()) AND (user_id <> auth.uid()) AND (soundpub.is_superadmin(auth.uid()) OR ((role <> '[redacted]'::soundpub.app_role) AND (NOT soundpub.has_role(user_id, '[redacted]'::soundpub.app_role)))))` |
| `soundpub.user_roles` / `Admins can view all roles` | SELECT / `authenticated` | `soundpub.is_admin(auth.uid())` | — |
| `soundpub.user_roles` / `Users can view own roles` | SELECT / `authenticated` | `(user_id = auth.uid())` | — |
| `storage.objects` / `Read scoped takedown storage files` | SELECT / `authenticated` | `((bucket_id = '[redacted]'::text) AND (soundpub.is_admin(( SELECT auth.uid() AS uid)) OR (split_part(name, '[redacted]'::text, 1) = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1 FROM (soundpub.takedown_request_documents document JOIN soundpub.takedown_requests request ON ((request.id = document.request_id))) WHERE ((document.storage_path = objects.name) AND (request.label_id = ( SELECT auth.uid() AS uid)))))))` | — |
| `storage.objects` / `SoundPub authenticated delete buckets` | DELETE / `authenticated` | `((bucket_id = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text])) AND ((split_part(name, '[redacted]'::text, 1) = (auth.uid())::text) OR soundpub.is_admin(auth.uid())))` | — |
| `storage.objects` / `SoundPub authenticated read private buckets` | SELECT / `authenticated` | `(bucket_id = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text]))` | — |
| `storage.objects` / `SoundPub authenticated update buckets` | UPDATE / `authenticated` | `((bucket_id = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text])) AND ((split_part(name, '[redacted]'::text, 1) = (auth.uid())::text) OR soundpub.is_admin(auth.uid())))` | `((bucket_id = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text])) AND ((split_part(name, '[redacted]'::text, 1) = (auth.uid())::text) OR soundpub.is_admin(auth.uid())))` |
| `storage.objects` / `SoundPub authenticated upload buckets` | INSERT / `authenticated` | — | `((bucket_id = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text])) AND ((split_part(name, '[redacted]'::text, 1) = (auth.uid())::text) OR soundpub.is_admin(auth.uid())))` |
| `storage.objects` / `SoundPub public read public buckets` | SELECT / `anon,authenticated` | `(bucket_id = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text]))` | — |
| `storage.objects` / `SoundPub service role manage buckets` | ALL / `service_role` | `(bucket_id = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text]))` | `(bucket_id = ANY (ARRAY['[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text, '[redacted]'::text]))` |
| `storage.objects` / `Upload own takedown storage files` | INSERT / `authenticated` | — | `((bucket_id = '[redacted]'::text) AND (split_part(name, '[redacted]'::text, 1) = (( SELECT auth.uid() AS uid))::text))` |


### Shared Storage finding

- **FAIL:** `SoundPub authenticated read private buckets` has only a bucket-set predicate; no owner, actor, or Soundpub-membership predicate. Fresh scope aggregate: **3 existing private buckets, 543 objects**. This is a catalog/policy finding; no bytes, paths, or real-identity request was fetched.
- Soundpub-named policies reference **7 existing buckets: 4 public, 3 private, 1,060 objects**. This does not prove all application media or contract buckets are covered.
- Prior Phase 1E description of upload/update/delete policies as only bucket predicates is too broad for current production: fresh expressions include path-prefix `auth.uid()` or `soundpub.is_admin(auth.uid())`. These still share platform `authenticated` identities and do not establish Soundpub membership for an actor owning a prefix.
- `Read scoped takedown storage files` depends on `soundpub.is_admin`, `takedown_request_documents`, and `takedown_requests`. Upload counterpart checks actor path prefix.
- Permissive policy predicates are OR-combined for an operation; a narrower permissive policy cannot cancel the broad read policy. A PostgreSQL RESTRICTIVE policy is AND-combined, but none was observed here. No policy was changed.
- Metadata grants and policy predicates do not establish Storage API/object-byte behavior, public URL revocation, signed URL expiry, or backend service credentials. Those are **NOT REVERIFIED**.
- Additional static row-scope observations: `app_settings` has unconditional anon/authenticated SELECT (20 rows; values never read); global notifications satisfy authenticated UPDATE predicate `is_global = true`. Setting sensitivity and intended notification mutation rules remain unverified business decisions.

## Trigger inventory and shared Auth coupling

**47 non-internal triggers on Soundpub tables plus 1 inbound trigger on auth.users = 48.** All enabled for normal/origin execution (`O`); no trigger WHEN qualifier or trigger arguments observed. Internal FK constraint triggers are counted separately in dependency summary.

| Relation | Trigger | Timing / events | Function |
| --- | --- | --- | --- |
| `auth.users` | `on_auth_user_created` | AFTER INSERT ROW | `soundpub.handle_new_user` |
| `soundpub.app_settings` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.app_settings` | `update_app_settings_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.artist_deletion_requests` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.artist_profiles` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.artist_profiles` | `update_artist_profiles_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.artists` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.artists` | `update_artists_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.composer_royalties` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.composer_royalties` | `update_composer_royalties_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.copyright_contracts` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.copyright_contracts` | `update_copyright_contracts_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.copyright_registration_files` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.copyright_registration_payments` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.copyright_registration_payments` | `update_copyright_registration_payments_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.copyright_registration_works` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.copyright_registration_works` | `update_copyright_registration_works_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.copyright_registrations` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.copyright_registrations` | `update_copyright_registrations_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.notifications` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.payout_balance_reservations` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.payout_requests` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.payout_requests` | `update_payout_requests_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.profiles` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.profiles` | `guard_profile_sensitive_update` | BEFORE INSERT/UPDATE ROW | `soundpub.guard_profile_sensitive_update` |
| `soundpub.profiles` | `sync_managed_artist_markers_on_profiles` | BEFORE INSERT/UPDATE ROW | `soundpub.sync_managed_artist_markers` |
| `soundpub.profiles` | `trigger_auto_assign_artist_role` | AFTER INSERT ROW | `soundpub.auto_assign_artist_role` |
| `soundpub.profiles` | `trigger_auto_assign_soundpub_label` | BEFORE INSERT ROW | `soundpub.auto_assign_new_user_to_soundpub_label` |
| `soundpub.profiles` | `update_profiles_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.release_payments` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.release_payments` | `update_release_payments_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.releases` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.releases` | `enforce_registered_label_release_artist` | BEFORE INSERT/UPDATE ROW | `soundpub.enforce_registered_label_release_artist` |
| `soundpub.releases` | `enforce_release_distribution_service` | BEFORE INSERT/UPDATE ROW | `soundpub.enforce_release_distribution_service` |
| `soundpub.releases` | `update_releases_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.royalties` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.royalty_uploads` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.royalty_uploads` | `update_royalty_uploads_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.takedown_request_documents` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.takedown_request_items` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.takedown_request_targets` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.takedown_requests` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.takedown_requests` | `enforce_takedown_request_required_fields` | BEFORE INSERT/UPDATE ROW | `soundpub.enforce_takedown_request_required_fields` |
| `soundpub.takedown_status_history` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.tracks` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |
| `soundpub.tracks` | `enforce_registered_label_track_artist` | BEFORE INSERT/UPDATE ROW | `soundpub.enforce_registered_label_track_artist` |
| `soundpub.tracks` | `update_tracks_timestamp` | BEFORE UPDATE ROW | `soundpub.update_timestamp` |
| `soundpub.user_roles` | `audit_row_change` | AFTER INSERT/UPDATE/DELETE ROW | `soundpub.audit_row_change` |


`auth.users.on_auth_user_created` is enabled AFTER INSERT FOR EACH ROW and calls `soundpub.handle_new_user()`. No other non-internal Auth table trigger was found. Redacted source review shows:

- Signup routing reads user metadata before app metadata, has one source-app skip branch, then resolves an app label using profile/role/name predicates.
- Missing resolved label raises an exception. Otherwise it inserts/updates Soundpub profile, deletes the new identity's Soundpub roles, then inserts a role.
- This is shared signup behavior with Soundpub writes, not a schema-local trigger. A new identity from another app can enter this path unless routing excludes it; metadata trust and approved source-app classification need owner review. No signup was attempted.
- The trigger has no catalog WHEN restriction. Existing Soundpub profiles are not proof that identities belong exclusively to Soundpub.

## Cross-schema dependency evidence

The `pg_depend` scan covered relations, routines, types, schemas, constraints, policies, triggers, defaults, rewrite rules, and extensions. PostgreSQL implementation schemas were excluded from final business-dependency counts.

| Direction / dependency | Catalog entries | Interpretation |
| --- | --- | --- |
| Soundpub policy → auth.uid() | 77 | 77 policy/function edges, not 77 independent platform objects. |
| Soundpub FK → auth.users column / index | 16 | 8 external FKs, each with column and index dependency. |
| Auth → Soundpub FK internal triggers | 16 | 2 parent-side constraint triggers per FK; implementation dependencies. |
| auth.users trigger → soundpub.handle_new_user() | 1 | Application-owned function required by shared Auth runtime. |
| storage.objects policies → Soundpub functions | 4 | is_admin dependency in scoped read plus update/upload/delete policies. |
| storage.objects policies → Soundpub table columns | 4 | Scoped takedown document/request references. |
| Soundpub ↔ other-app schemas | 0 | No direct edge in scanned catalogs; does not prove absence of runtime coupling. |


**118 cross-schema catalog records total**, comprising 17 Auth→Soundpub, 93 Soundpub→Auth, and 8 Storage→Soundpub records. Separately, qualified routine-body scan found **19 Soundpub functions referencing auth.uid()**. Case-insensitive scan handles unquoted `Soundpub` spelling; no qualified Soundpub relation reference from another application's function and no other-app function with Soundpub in its fixed search path were found.

Function-body dependency limits: PostgreSQL does not record every table/function reference inside SQL strings or PL/pgSQL bodies. Lexical same-name scans produce false candidates (`carubra_db.is_admin`, other-app `has_role`, extension UUID helper); these are **not established app SQL dependencies**. Soundpub has local `is_admin`/`has_role`; configured paths and actual resolution must be respected. Dynamic SQL assembled outside database, Edge Function/client queries, gateway behavior, FDWs/external systems, and all other-app authorization paths were not exhaustively tested.

### Shared identity overlap: fresh aggregate evidence

- Auth users **211**; Soundpub profiles **182**; Auth identities without Soundpub profile **29**; Soundpub profiles without Auth user **0**.
- All **43 single-column foreign keys to auth.users outside Auth/Soundpub/Storage** were aggregated. **8 distinct Soundpub profile identities** also occur in those other-app FK columns; **29 distinct identities without Soundpub profile** occur there.
- Overlap is a source data relationship, not an approved ownership classification. Zero overlap for a schema does not prove absence of identity linkage outside declared FKs. Per-column counts overlap and must not be summed.

| Other-app FK column | Distinct referenced identities | Also Soundpub profile |
| --- | --- | --- |
| `artikel.article_revisions.created_by` | 2 | 1 |
| `artikel.articles.author_id` | 2 | 1 |
| `artikel.articles.reviewer_id` | 2 | 1 |
| `artikel.audit_logs.actor_id` | 2 | 1 |
| `artikel.media_assets.created_by` | 2 | 1 |
| `artikel.user_roles.user_id` | 3 | 2 |
| `chatten_cafe.profiles.id` | 7 | 6 |


No identity IDs or row content were returned. An Auth export filtered only by Soundpub profile presence would include shared identities; deleting source Auth users could cascade through both application sets. Identity/session ownership and target remapping remain unresolved.

## Shared roles, grants, API exposure, and extensions

### Soundpub namespace and privilege boundary

Explicit Soundpub schema ACLs: owner `postgres` CREATE/USAGE; `anon`, `authenticated`, `authenticator`, `service_role`, `supabase_auth_admin` USAGE. No PUBLIC schema grant. `buzzerhood_app` has no effective Soundpub schema USAGE or CREATE; no dedicated Soundpub app login role was observed.

Effective Soundpub USAGE also follows global authority for `pg_read_all_data`, `pg_write_all_data`, `supabase_admin`, `supabase_etl_admin`, and `supabase_read_only_user`. Shared privileged roles are source platform state, not tenant boundaries.

| Role | LOGIN | SUPERUSER | BYPASSRLS | Soundpub USAGE | Soundpub CREATE |
| --- | --- | --- | --- | --- | --- |
| `anon` | no | no | no | yes | no |
| `authenticated` | no | no | no | yes | no |
| `authenticator` | yes | no | no | yes | no |
| `buzzerhood_app` | yes | no | no | no | no |
| `dashboard_user` | no | no | no | no | no |
| `pg_checkpoint` | no | no | no | no | no |
| `pg_create_subscription` | no | no | no | no | no |
| `pg_database_owner` | no | no | no | no | no |
| `pg_execute_server_program` | no | no | no | no | no |
| `pg_maintain` | no | no | no | no | no |
| `pg_monitor` | no | no | no | no | no |
| `pg_read_all_data` | no | no | no | yes | no |
| `pg_read_all_settings` | no | no | no | no | no |
| `pg_read_all_stats` | no | no | no | no | no |
| `pg_read_server_files` | no | no | no | no | no |
| `pg_signal_backend` | no | no | no | no | no |
| `pg_stat_scan_tables` | no | no | no | no | no |
| `pg_use_reserved_connections` | no | no | no | no | no |
| `pg_write_all_data` | no | no | no | yes | no |
| `pg_write_server_files` | no | no | no | no | no |
| `pgbouncer` | yes | no | no | no | no |
| `postgres` | yes | no | yes | yes | yes |
| `service_role` | no | no | yes | yes | no |
| `supabase_admin` | yes | yes | yes | yes | yes |
| `supabase_auth_admin` | yes | no | no | yes | no |
| `supabase_etl_admin` | yes | no | yes | yes | no |
| `supabase_functions_admin` | yes | no | no | no | no |
| `supabase_privileged_role` | no | no | no | no | no |
| `supabase_read_only_user` | yes | no | yes | yes | no |
| `supabase_realtime_admin` | no | no | no | no | no |
| `supabase_replication_admin` | yes | no | no | no | no |
| `supabase_storage_admin` | yes | no | no | no | no |


Membership inventory (all 24 rows; SET/INHERIT are per-membership options):

| Granted role | Member | ADMIN | INHERIT | SET |
| --- | --- | --- | --- | --- |
| `anon` | `authenticator` | no | no | yes |
| `anon` | `postgres` | yes | yes | yes |
| `authenticated` | `authenticator` | no | no | yes |
| `authenticated` | `postgres` | yes | yes | yes |
| `authenticator` | `postgres` | yes | yes | yes |
| `authenticator` | `supabase_storage_admin` | no | no | yes |
| `buzzerhood_app` | `postgres` | yes | no | no |
| `pg_create_subscription` | `postgres` | yes | yes | yes |
| `pg_monitor` | `postgres` | yes | yes | yes |
| `pg_monitor` | `supabase_etl_admin` | no | yes | yes |
| `pg_monitor` | `supabase_read_only_user` | no | yes | yes |
| `pg_read_all_data` | `postgres` | yes | yes | yes |
| `pg_read_all_data` | `supabase_etl_admin` | no | yes | yes |
| `pg_read_all_data` | `supabase_read_only_user` | no | yes | yes |
| `pg_read_all_settings` | `pg_monitor` | no | yes | yes |
| `pg_read_all_stats` | `pg_monitor` | no | yes | yes |
| `pg_signal_backend` | `postgres` | yes | yes | yes |
| `pg_stat_scan_tables` | `pg_monitor` | no | yes | yes |
| `service_role` | `authenticator` | no | no | yes |
| `service_role` | `postgres` | yes | yes | yes |
| `supabase_functions_admin` | `postgres` | no | yes | yes |
| `supabase_privileged_role` | `postgres` | no | yes | yes |
| `supabase_privileged_role` | `supabase_etl_admin` | no | yes | yes |
| `supabase_realtime_admin` | `postgres` | no | yes | yes |


`authenticator` can SET ROLE to anon/authenticated/service_role without inheriting their rights. `supabase_storage_admin` can SET ROLE authenticator. `postgres`, `service_role`, platform superuser, and read-only/ETL bypass roles require separate migration authority review. BYPASSRLS does not supply missing table or function ACLs.

Effective table-privilege inventory also found global roles: `pg_read_all_data` SELECT on all 33; `pg_write_all_data` INSERT/UPDATE/DELETE on all 33; `pg_maintain` MAINTAIN on all 33; `supabase_admin` full authority; `supabase_etl_admin` and `supabase_read_only_user` read authority on all 33. Built-in read/write-all-data roles alone do not bypass RLS. Current service_role ACL lacks all five takedown tables (see table inventory).

### PostgREST source configuration

Only these three non-secret environment keys were selected from running REST container:

```text
PGRST_DB_SCHEMAS=public,graphql_public,carubra,carubra_db,sehatta,utero_academy,honda,soundpub,utero-artikel,whatsapp,buzzerhood,chatten_cafe,artikel
PGRST_DB_ANON_ROLE=anon
PGRST_DB_EXTRA_SEARCH_PATH=public,carubra,carubra_db,sehatta,utero_academy,honda,soundpub,utero-artikel,whatsapp,buzzerhood
```

Soundpub and other apps share exposed API schemas, role names, and fallback namespace list. JWT app ownership, two-way real-identity row visibility, and unqualified name resolution through client/gateway paths are **NOT REVERIFIED**.

Other-app/mixed-public effective table grants below show cross-application reach before RLS. Count is tables with a privilege, not visible rows, effective schema access, or allowed operations after RLS.

| Other-app / mixed schema | Role | SELECT tables | INSERT tables |
| --- | --- | --- | --- |
| `artikel` | `authenticated` | 17 | 17 |
| `artikel` | `service_role` | 17 | 17 |
| `buzzerhood` | `authenticated` | 21 | 3 |
| `carubra` | `authenticated` | 7 | 7 |
| `carubra` | `service_role` | 7 | 7 |
| `carubra_db` | `anon` | 1 | 0 |
| `carubra_db` | `authenticated` | 9 | 9 |
| `carubra_db` | `service_role` | 9 | 9 |
| `chatten_cafe` | `anon` | 20 | 0 |
| `chatten_cafe` | `authenticated` | 21 | 21 |
| `chatten_cafe` | `service_role` | 21 | 21 |
| `honda` | `anon` | 1 | 1 |
| `honda` | `authenticated` | 1 | 1 |
| `honda` | `service_role` | 1 | 1 |
| `public` | `anon` | 8 | 8 |
| `public` | `authenticated` | 8 | 8 |
| `public` | `service_role` | 8 | 8 |
| `utero-artikel` | `anon` | 2 | 2 |
| `utero-artikel` | `authenticated` | 2 | 2 |
| `utero-artikel` | `service_role` | 2 | 2 |
| `utero_academy` | `anon` | 0 | 1 |
| `utero_academy` | `authenticated` | 9 | 2 |
| `utero_academy` | `service_role` | 62 | 62 |
| `whatsapp` | `anon` | 1 | 1 |
| `whatsapp` | `authenticated` | 1 | 1 |
| `whatsapp` | `service_role` | 1 | 1 |


### Installed extensions

All extension owners are `supabase_admin`; none is installed into Soundpub. These are cluster-shared database objects.

| Extension | Version | Schema | Relocatable |
| --- | --- | --- | --- |
| `hypopg` | 1.4.1 | `extensions` | yes |
| `index_advisor` | 0.2.0 | `extensions` | yes |
| `pg_net` | 0.20.3 | `extensions` | no |
| `pg_stat_statements` | 1.11 | `extensions` | yes |
| `pg_trgm` | 1.6 | `public` | yes |
| `pgcrypto` | 1.3 | `extensions` | yes |
| `plpgsql` | 1.0 | `pg_catalog` | no |
| `supabase_vault` | 0.3.1 | `vault` | no |
| `uuid-ossp` | 1.1 | `extensions` | yes |


No non-core extension object dependency was found in surveyed Soundpub defaults/index operator classes/catalog edges. **30 table ID defaults** use unqualified `gen_random_uuid()`; PostgreSQL 17 provides `pg_catalog.gen_random_uuid()`, while an extension wrapper also exists in `extensions`. No default catalog edge requires that wrapper. PL/pgSQL language is required; do not infer all nine extensions are mandatory app SQL dependencies. No extension values/secrets, Vault contents, network queue payloads, or settings values were read.

## Fresh production financial revalidation

**REVERIFIED: database assertions and stored linkage. NOT REVERIFIED: Xendit/provider settlement, bank settlement, document bytes, refunds, deployed callback behavior, invoice-creation idempotency, or restore equality.**

Snapshot: **2026-10-27T13:31:07.912225 UTC**, one REPEATABLE READ READ ONLY transaction. Existing reconciliation source: `scripts/payment_reconciliation_readonly.sql`, SHA-256 `2fa0615b7ce4a47517fead4cf1f5b6c76fc5c36bfc1ee918ac4aa4b8dab991ac`. Its 20 invariant predicates were retained; output was wrapped as aggregate JSON and ending changed to ROLLBACK. Extra 21 checks and population counts ran in the same transaction.

### Financial populations and stored Xendit linkage

| Population | Fresh count / status |
| --- | --- |
| Royalty rows / upload rows / successful uploads | 14,474 / 10 / 10 |
| Royalties missing referenced upload | 0 (fresh aggregate) |
| Profile balances checked / balance adjustments | 182 / 33 |
| Payout requests / paid payouts | 3 / 2 |
| Reservation rows / reservations on pending, approved, or paid payouts | 5 / 5 |
| Paid payouts with nonempty proof path | 2 / 2; bytes NOT REVERIFIED |
| Composer royalty rows | 0; orphan-composer-upload pass has empty population |
| release_payments | 9 total; 4 paid; 9 nonempty Xendit IDs; 9 nonempty Xendit URLs; paid IDs/URLs 4/4 |
| copyright_registration_payments | 2 total; 0 paid; 2 nonempty Xendit IDs; 2 nonempty Xendit URLs; paid IDs/URLs 0/0 |
| Copyright payment states | 2 expired; 0 paid (fresh aggregate) |
| Release invoice numbers / PDF paths present | 2 / 2, both on paid release-payment population |
| Paid release payments missing invoice number / PDF path | 2 / 2; the same 2 paid rows lack both |
| Xendit link meaning | Stored references only. IDs/URLs suppressed. No provider API, callback, invoice fetch, amount/currency/provider/bank reconciliation, or payment action. |


Arithmetic definition tested: profile balance equals artist+label allocation totals plus recorded adjustments minus reservations for pending/approved/paid payouts; artist/label counters equal corresponding royalty totals. Allocation assertion requires net revenue equal artist + label + Soundpub shares. This validates stored arithmetic under existing adjustment/reservation model, not economic legitimacy of adjustments or settlement.

### Original 20 assertions: 15 PASS / 5 FAIL

| Assertion | Failures | Status |
| --- | --- | --- |
| `allocation` | 0 | PASS |
| `artist_balance` | 0 | PASS |
| `balance` | 0 | PASS |
| `cross_domain_invoice` | 0 | PASS |
| `duplicate_copyright_invoice` | 0 | PASS |
| `duplicate_release_invoice` | 0 | PASS |
| `label_balance` | 0 | PASS |
| `missing_source_row` | 14474 | FAIL |
| `missing_upload_replay_key` | 10 | FAIL |
| `negative_balance` | 0 | PASS |
| `orphan_composer_upload` | 0 | PASS |
| `paid_without_invoice_number` | 2 | FAIL |
| `paid_without_pdf_path` | 2 | FAIL |
| `paid_without_proof_path` | 0 | PASS |
| `paid_without_provider` | 0 | PASS |
| `paid_without_reservation` | 0 | PASS |
| `paid_without_timestamp` | 0 | PASS |
| `recipient` | 0 | PASS |
| `reservation_amount` | 0 | PASS |
| `upload_inserted_count` | 10 | FAIL |


The five failing counts match Phase 1E, but were freshly queried. Missing source provenance affects **all 14,474 royalties**; replay-key absence and inserted-count mismatch affect **all 10 successful uploads**. The two missing-invoice/document failures concern **2 of 4 paid release payments**. No population was repaired or reclassified as an approved legacy exception.

### Additional 21 read-only assertions: 21 PASS / 0 FAIL

| Assertion | Failures | Status |
| --- | --- | --- |
| `adjustment_orphan_profile` | 0 | PASS |
| `copyright_paid_without_timestamp` | 0 | PASS |
| `copyright_paid_without_xendit_id` | 0 | PASS |
| `copyright_paid_without_xendit_url` | 0 | PASS |
| `copyright_payment_missing_profile` | 0 | PASS |
| `copyright_payment_missing_registration` | 0 | PASS |
| `copyright_payment_user_mismatch` | 0 | PASS |
| `copyright_xendit_id_url_presence_mismatch` | 0 | PASS |
| `duplicate_release_invoice_number` | 0 | PASS |
| `duplicate_upload_replay_key` | 0 | PASS |
| `duplicate_upload_source_key` | 0 | PASS |
| `release_paid_pdf_without_generated_timestamp` | 0 | PASS |
| `release_paid_without_xendit_url` | 0 | PASS |
| `release_paid_xendit_url_not_https` | 0 | PASS |
| `release_payment_missing_profile` | 0 | PASS |
| `release_payment_missing_release` | 0 | PASS |
| `release_xendit_id_url_presence_mismatch` | 0 | PASS |
| `reservation_orphan_payout` | 0 | PASS |
| `reservation_orphan_profile` | 0 | PASS |
| `royalty_null_financial_allocation` | 0 | PASS |
| `royalty_recipient_missing_profile` | 0 | PASS |


Interpretation limits:

- Copyright payment registration/profile linkage and same-user consistency were checked on 2 existing payment rows. Paid copyright timestamp/Xendit assertions have **0 paid rows**, so pass is vacuous and does not validate a paid copyright lifecycle.
- Duplicate upload-source and replay-key checks have **0 non-null provenance/replay keys**, so zero duplicates does not establish replay safety.
- Nonempty Xendit IDs/URLs and HTTPS URL prefix do not establish provider existence, correct invoice ownership/amount/currency, external status, duplicate remote invoices, idempotent invoice creation, or webhook authenticity.
- Copyright payment table has Xendit ID/URL columns but no dedicated invoice-number/PDF-path columns; copyright invoice document availability/content is **NOT REVERIFIED**. Stored release invoice number/PDF-path uniqueness/presence and generation timestamp do not prove PDF availability, content, signatures, invoice correctness, payout-proof bytes, or legal/accounting acceptance.
- Royalty/balance/reservation consistency passes do not establish opening-adjustment legitimacy, tax/fee correctness, refund handling, or restore equality.
- Overall database financial gate remains **FAIL** despite 36 passing predicates across the combined 41 checks. Prior source-fixture/Xendit behavior claims were **NOT REVERIFIED** in this read-only database audit.

## Runnable financial evidence check (read-only)

Copy the SQL below into psql stdin through the same SSH/Compose target. It is the final executed financial batch: SELECT/catalog/aggregate queries only, two snapshot outputs within one transaction, and ROLLBACK. It emits counts, statuses, and static labels; no record identifiers or monetary values. It intentionally returns FAIL rows for existing failures instead of changing production to make tests pass.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout='3s';
SELECT json_build_object('section','snapshot','rows',json_build_array(json_build_object('utc',now() AT TIME ZONE 'UTC','read_only',current_setting('transaction_read_only'))));
WITH allocations AS (
  SELECT artist_user_id id, artist_revenue amount, artist_revenue artist, 0::numeric label FROM soundpub.royalties
  UNION ALL
  SELECT label_user_id, label_revenue, 0::numeric, label_revenue FROM soundpub.royalties
), totals AS (
  SELECT id, sum(amount) amount, sum(artist) artist, sum(label) label FROM allocations GROUP BY id
), reserved AS (
  SELECT profile_id id, sum(reservation.amount) amount FROM soundpub.payout_balance_reservations reservation
  JOIN soundpub.payout_requests payout ON payout.id = reservation.payout_id
  WHERE payout.status IN ('pending','approved','paid') GROUP BY profile_id
), adjustments AS (
  SELECT profile_id id, sum(amount) amount FROM soundpub.balance_adjustments GROUP BY profile_id
), profiles AS (
  SELECT profile.*, coalesce(totals.amount,0) + coalesce(adjustments.amount,0) - coalesce(reserved.amount,0) expected,
    coalesce(totals.artist,0) expected_artist, coalesce(totals.label,0) expected_label
  FROM soundpub.profiles profile LEFT JOIN totals USING(id) LEFT JOIN reserved USING(id) LEFT JOIN adjustments USING(id)
), checks AS (
  SELECT 'balance' check_name, count(*) failures FROM profiles WHERE balance IS DISTINCT FROM expected
  UNION ALL SELECT 'artist_balance',count(*) FROM profiles WHERE artist_revenue IS DISTINCT FROM expected_artist
  UNION ALL SELECT 'label_balance',count(*) FROM profiles WHERE label_revenue IS DISTINCT FROM expected_label
  UNION ALL SELECT 'negative_balance',count(*) FROM profiles WHERE balance < 0
  UNION ALL SELECT 'allocation',count(*) FROM soundpub.royalties WHERE net_revenue IS DISTINCT FROM coalesce(artist_revenue,0)+coalesce(label_revenue,0)+coalesce(soundpub_revenue,0)
  UNION ALL SELECT 'recipient',count(*) FROM soundpub.royalties WHERE artist_user_id IS NULL OR label_user_id IS NULL
  UNION ALL SELECT 'reservation_amount',count(*) FROM soundpub.payout_requests payout WHERE status IN ('pending','approved','paid') AND amount IS DISTINCT FROM (SELECT coalesce(sum(amount),0) FROM soundpub.payout_balance_reservations WHERE payout_id=payout.id)
  UNION ALL SELECT 'paid_without_reservation',count(*) FROM soundpub.payout_requests payout WHERE status='paid' AND NOT EXISTS (SELECT FROM soundpub.payout_balance_reservations WHERE payout_id=payout.id)
  UNION ALL SELECT 'paid_without_proof_path',count(*) FROM soundpub.payout_requests WHERE status='paid' AND nullif(payment_proof_path,'') IS NULL
  UNION ALL SELECT 'orphan_composer_upload',count(*) FROM soundpub.composer_royalties composer WHERE upload_id IS NOT NULL AND NOT EXISTS (SELECT FROM soundpub.royalty_uploads WHERE id=composer.upload_id)
  UNION ALL SELECT 'duplicate_release_invoice',count(*) FROM (SELECT xendit_invoice_id FROM soundpub.release_payments WHERE xendit_invoice_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) duplicate
  UNION ALL SELECT 'duplicate_copyright_invoice',count(*) FROM (SELECT xendit_invoice_id FROM soundpub.copyright_registration_payments WHERE xendit_invoice_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) duplicate
  UNION ALL SELECT 'cross_domain_invoice',count(*) FROM soundpub.release_payments JOIN soundpub.copyright_registration_payments USING(xendit_invoice_id)
  UNION ALL SELECT 'paid_without_timestamp',count(*) FROM soundpub.release_payments WHERE status='paid' AND paid_at IS NULL
  UNION ALL SELECT 'paid_without_provider',count(*) FROM soundpub.release_payments WHERE status='paid' AND xendit_invoice_id IS NULL
  UNION ALL SELECT 'paid_without_invoice_number',count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(invoice_number,'') IS NULL
  UNION ALL SELECT 'paid_without_pdf_path',count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(invoice_pdf_path,'') IS NULL
  UNION ALL SELECT 'missing_source_row',count(*) FROM soundpub.royalties WHERE source_row_number IS NULL
  UNION ALL SELECT 'missing_upload_replay_key',count(*) FROM soundpub.royalty_uploads WHERE idempotency_key IS NULL
  UNION ALL SELECT 'upload_inserted_count',count(*) FROM soundpub.royalty_uploads upload WHERE status='success' AND inserted_records IS DISTINCT FROM (SELECT count(*) FROM soundpub.royalties WHERE upload_id=upload.id)
)
SELECT json_build_object('section','financial_checks','rows',jsonb_agg(to_jsonb(q))) FROM (SELECT check_name,failures,CASE WHEN failures=0 THEN 'PASS' ELSE 'FAIL' END AS result FROM checks ORDER BY check_name) q;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=pg_catalog;
SELECT json_build_object('section','snapshot','rows',json_build_array(json_build_object('utc',now() AT TIME ZONE 'UTC','read_only',current_setting('transaction_read_only'))));
SELECT json_build_object('section','payment_populations','rows',jsonb_agg(to_jsonb(q))) FROM (
SELECT 'release_payments' AS domain,count(*) AS rows,count(*) FILTER(WHERE status='paid') AS paid,count(*) FILTER(WHERE nullif(xendit_invoice_id,'') IS NOT NULL) AS xendit_id_present,count(*) FILTER(WHERE nullif(xendit_invoice_url,'') IS NOT NULL) AS xendit_url_present,count(*) FILTER(WHERE status='paid' AND nullif(xendit_invoice_id,'') IS NOT NULL) AS paid_xendit_id_present,count(*) FILTER(WHERE status='paid' AND nullif(xendit_invoice_url,'') IS NOT NULL) AS paid_xendit_url_present FROM soundpub.release_payments
UNION ALL SELECT 'copyright_registration_payments',count(*),count(*) FILTER(WHERE payment_status='paid'),count(*) FILTER(WHERE nullif(xendit_invoice_id,'') IS NOT NULL),count(*) FILTER(WHERE nullif(xendit_invoice_url,'') IS NOT NULL),count(*) FILTER(WHERE payment_status='paid' AND nullif(xendit_invoice_id,'') IS NOT NULL),count(*) FILTER(WHERE payment_status='paid' AND nullif(xendit_invoice_url,'') IS NOT NULL) FROM soundpub.copyright_registration_payments) q;
WITH assertions AS (
SELECT 'royalty_recipient_missing_profile' AS check_name,count(*) AS failures FROM soundpub.royalties r WHERE NOT EXISTS(SELECT FROM soundpub.profiles p WHERE p.id=r.artist_user_id) OR NOT EXISTS(SELECT FROM soundpub.profiles p WHERE p.id=r.label_user_id)
UNION ALL SELECT 'royalty_null_financial_allocation',count(*) FROM soundpub.royalties WHERE net_revenue IS NULL OR artist_revenue IS NULL OR label_revenue IS NULL OR soundpub_revenue IS NULL
UNION ALL SELECT 'duplicate_upload_source_key',count(*) FROM (SELECT upload_id,source_row_number FROM soundpub.royalties WHERE source_row_number IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d
UNION ALL SELECT 'duplicate_upload_replay_key',count(*) FROM (SELECT idempotency_key FROM soundpub.royalty_uploads WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*)>1) d
UNION ALL SELECT 'reservation_orphan_payout',count(*) FROM soundpub.payout_balance_reservations r WHERE NOT EXISTS(SELECT FROM soundpub.payout_requests p WHERE p.id=r.payout_id)
UNION ALL SELECT 'reservation_orphan_profile',count(*) FROM soundpub.payout_balance_reservations r WHERE NOT EXISTS(SELECT FROM soundpub.profiles p WHERE p.id=r.profile_id)
UNION ALL SELECT 'adjustment_orphan_profile',count(*) FROM soundpub.balance_adjustments r WHERE NOT EXISTS(SELECT FROM soundpub.profiles p WHERE p.id=r.profile_id)
UNION ALL SELECT 'release_payment_missing_release',count(*) FROM soundpub.release_payments r WHERE NOT EXISTS(SELECT FROM soundpub.releases p WHERE p.id=r.release_id)
UNION ALL SELECT 'release_payment_missing_profile',count(*) FROM soundpub.release_payments r WHERE NOT EXISTS(SELECT FROM soundpub.profiles p WHERE p.id=r.user_id)
UNION ALL SELECT 'copyright_payment_missing_registration',count(*) FROM soundpub.copyright_registration_payments r WHERE NOT EXISTS(SELECT FROM soundpub.copyright_registrations p WHERE p.id=r.registration_id)
UNION ALL SELECT 'copyright_payment_missing_profile',count(*) FROM soundpub.copyright_registration_payments r WHERE NOT EXISTS(SELECT FROM soundpub.profiles p WHERE p.id=r.user_id)
UNION ALL SELECT 'copyright_payment_user_mismatch',count(*) FROM soundpub.copyright_registration_payments r JOIN soundpub.copyright_registrations p ON p.id=r.registration_id WHERE r.user_id IS DISTINCT FROM p.user_id
UNION ALL SELECT 'copyright_paid_without_timestamp',count(*) FROM soundpub.copyright_registration_payments WHERE payment_status='paid' AND paid_at IS NULL
UNION ALL SELECT 'copyright_paid_without_xendit_id',count(*) FROM soundpub.copyright_registration_payments WHERE payment_status='paid' AND nullif(xendit_invoice_id,'') IS NULL
UNION ALL SELECT 'copyright_paid_without_xendit_url',count(*) FROM soundpub.copyright_registration_payments WHERE payment_status='paid' AND nullif(xendit_invoice_url,'') IS NULL
UNION ALL SELECT 'release_paid_without_xendit_url',count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(xendit_invoice_url,'') IS NULL
UNION ALL SELECT 'release_xendit_id_url_presence_mismatch',count(*) FROM soundpub.release_payments WHERE (nullif(xendit_invoice_id,'') IS NULL) IS DISTINCT FROM (nullif(xendit_invoice_url,'') IS NULL)
UNION ALL SELECT 'copyright_xendit_id_url_presence_mismatch',count(*) FROM soundpub.copyright_registration_payments WHERE (nullif(xendit_invoice_id,'') IS NULL) IS DISTINCT FROM (nullif(xendit_invoice_url,'') IS NULL)
UNION ALL SELECT 'release_paid_xendit_url_not_https',count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(xendit_invoice_url,'') IS NOT NULL AND xendit_invoice_url !~ '^https://'
UNION ALL SELECT 'duplicate_release_invoice_number',count(*) FROM (SELECT invoice_number FROM soundpub.release_payments WHERE nullif(invoice_number,'') IS NOT NULL GROUP BY 1 HAVING count(*)>1) d
UNION ALL SELECT 'release_paid_pdf_without_generated_timestamp',count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(invoice_pdf_path,'') IS NOT NULL AND invoice_pdf_generated_at IS NULL
)
SELECT json_build_object('section','extended_financial_checks','rows',jsonb_agg(to_jsonb(q))) FROM (SELECT check_name,failures,CASE WHEN failures=0 THEN 'PASS' ELSE 'FAIL' END AS result FROM assertions ORDER BY check_name) q;
SELECT json_build_object('section','financial_document_counts','rows',json_build_array(json_build_object(
'release_invoice_numbers_present',(SELECT count(*) FROM soundpub.release_payments WHERE nullif(invoice_number,'') IS NOT NULL),
'release_pdf_paths_present',(SELECT count(*) FROM soundpub.release_payments WHERE nullif(invoice_pdf_path,'') IS NOT NULL),
'paid_release_invoice_numbers_present',(SELECT count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(invoice_number,'') IS NOT NULL),
'paid_release_pdf_paths_present',(SELECT count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(invoice_pdf_path,'') IS NOT NULL),
'payouts',(SELECT count(*) FROM soundpub.payout_requests),
'paid_payouts',(SELECT count(*) FROM soundpub.payout_requests WHERE status='paid'),
'paid_payout_proof_paths_present',(SELECT count(*) FROM soundpub.payout_requests WHERE status='paid' AND nullif(payment_proof_path,'') IS NOT NULL),
'reservations',(SELECT count(*) FROM soundpub.payout_balance_reservations),
'reservations_for_active_or_paid_payouts',(SELECT count(*) FROM soundpub.payout_balance_reservations r JOIN soundpub.payout_requests p ON p.id=r.payout_id WHERE p.status IN ('pending','approved','paid')),
'balance_adjustments',(SELECT count(*) FROM soundpub.balance_adjustments),
'profiles_checked',(SELECT count(*) FROM soundpub.profiles))));

SELECT json_build_object('section','financial_core_counts','rows',json_build_array(json_build_object(
'royalty_rows',(SELECT count(*) FROM soundpub.royalties),
'royalty_upload_rows',(SELECT count(*) FROM soundpub.royalty_uploads),
'successful_uploads',(SELECT count(*) FROM soundpub.royalty_uploads WHERE status='success'),
'royalties_missing_upload',(SELECT count(*) FROM soundpub.royalties r WHERE r.upload_id IS NULL OR NOT EXISTS(SELECT FROM soundpub.royalty_uploads u WHERE u.id=r.upload_id)),
'composer_royalty_rows',(SELECT count(*) FROM soundpub.composer_royalties),
'paid_release_both_missing_invoice_and_pdf',(SELECT count(*) FROM soundpub.release_payments WHERE status='paid' AND nullif(invoice_number,'') IS NULL AND nullif(invoice_pdf_path,'') IS NULL),
'copyright_expired_payments',(SELECT count(*) FROM soundpub.copyright_registration_payments WHERE payment_status='expired'))));

ROLLBACK;
```

## Unclosed gates and completion boundary

| Gate | Audit disposition |
| --- | --- |
| Soundpub object inventory | COMPLETE for listed catalog classes, exact table counts, effective client function privileges, ACLs, and shared hooks. |
| Schema-only isolation | FAIL: shared Auth trigger, Auth FKs/helper, shared Storage policy dependencies, API roles/search path, and cross-app identities. |
| Private-media read boundary | FAIL: broad authenticated read policy covers 543 private-bucket objects; real request/byte access NOT REVERIFIED. |
| Definer boundary / copyright RPC contract | FAIL: two missing fixed paths, client-executable sensitive routines, four absent RPC names. No remediation applied. |
| Production financial arithmetic/linkage assertions | REVERIFIED: original 15 PASS / 5 FAIL; extended 21 PASS / 0 FAIL; detailed populations above. |
| Xendit external settlement/idempotency/deployed callback | NOT REVERIFIED; stored link counts cannot close provider gate. |
| Shared identity ownership and two-direction tenant tests | NOT REVERIFIED; 8 cross-app-linked Soundpub identities observed, no approved classification or identity-based runtime tests. |
| SQL clean install/full platform reproduction and migration ledger | NOT REVERIFIED; canonical object counts match inventory, standard ledger absent, no replay executed. |
| Storage bytes, invoice/proof bytes, exact restore/offsite recovery | NOT REVERIFIED. |
| Production change | NONE. Only this report created. |


Migration scope must retain financial provenance failures, explicit Auth/shared-object contracts, and other-app isolation decisions as unresolved gates. Proposed remediation or deployment requires separate authorized work; this audit performs none.

