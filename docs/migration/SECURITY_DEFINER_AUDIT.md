# SECURITY DEFINER audit — Phase 1B Agent D

Observation date: 2026-10-27, Asia/Bangkok. **Audit inventory COMPLETE; security closure FAIL / BLOCKED.** All 51 Soundpub SECURITY DEFINER signatures reviewed. Anonymous privileged mutation and cross-label metadata disclosure remain reproducible. No production functions were invoked and no production SQL was changed by this workstream.

## Evidence boundary

Baseline read: full attached Phase 1B request, `SUPABASE_MIGRATION_AUDIT.md`, `PHASE1_FINAL_REPORT.md`, source baseline, object manifest, drift/security/compatibility/financial and restore findings. Independent catalog evidence came through `ssh maskhar@20.20.20.3`, starting in `/data/supabase/instances/supabase-01/config`, then `docker compose exec -T db psql -X -U postgres -d postgres`. Every live SQL session used READ ONLY transactions; catalog fingerprint/assertion sessions used REPEATABLE READ, a 30-second timeout, and ROLLBACK. No passwords, tokens, production identity constants or user rows are included.

Live PostgreSQL is 17.6; HEAD is `48222ffb9c9e60da82d224e1e8aaccd4dd597442` in a pre-existing dirty worktree. Soundpub has 56 functions, including **51 definers**, all owned by `postgres` (`rolsuper=false`, `rolbypassrls=true`). `service_role` also bypasses RLS; `anon` and `authenticated` do not. RLS therefore does not authorize these definer bodies.

Shared host contains **93 additional definers outside soundpub**. They are outside this application's audit ownership. A catalog dependency search and case-insensitive lexical scan for qualified `soundpub.` references found no additional external definer dependent on Soundpub; dynamic/constructed names and external callers remain outside that proof. The required external `auth.users` trigger calls the inventoried `soundpub.handle_new_user()`. External `auth.uid()` and `auth.role()` are SECURITY INVOKER, owned by `supabase_auth_admin`, PUBLIC-executable; they are auth prerequisites, not omitted Soundpub definers.

Live PostgREST `PGRST_DB_SCHEMAS` explicitly contains lowercase `soundpub`. Both client roles have schema USAGE. The frontend client chooses `VITE_DATABASE_SCHEMA` or falls back to mixed-case `Soundpub`; deployed browser configuration/public routing was not independently established here. “Frontend RPC executable” below means SQL EXECUTE plus exposed schema for a non-trigger return type, not an HTTP positive test or authorization approval.

## Reachability and search-path results

- **34/51** grant PUBLIC EXECUTE and effective anon EXECUTE; **44/51** permit authenticated EXECUTE. Of 34 anonymous-executable definers, nine return trigger and 25 are ordinary functions. PUBLIC is every database role, including roles without explicit ACL entries; removing only anon grants would leave PUBLIC access.
- Ten definers return trigger. They cannot be called as ordinary RPCs; invocation requires a bound trigger/DML context. Trigger execution must still be reviewed even after revoking direct EXECUTE.
- **49/51** have fixed search_path; `cleanup_expired_tokens` and `cleanup_rate_limits` do not. Six explicitly put `pg_temp` last. The other 43 fixed paths omit explicit `pg_temp`; “fixed” does not mean fully hardened or authorized.
- Neither anon nor authenticated can CREATE in `soundpub`, `public`, or `auth`; both have database TEMP privilege. Omitting `pg_temp` lets temporary relations/types resolve before explicitly listed schemas. This is an object-resolution review requirement, not proof of injection: the two cleanup bodies qualify their target tables, and pg_temp is not searched for function/operator names.
- Paths containing `public` need shared-schema owner trust review. Prefer qualified dependencies with an empty path or audited trusted schemas plus `pg_temp` last. Do not change paths globally: royalty import deliberately uses temporary working tables.
- Function default ACLs remain PostgreSQL's PUBLIC EXECUTE default: no applicable Soundpub/database-global default ACL rows. A future migration must explicitly revoke new-function defaults for its creating role and grant only approved callers.
- Client-role membership does not provide unexpected service-role inheritance. `authenticator` is NOINHERIT, with SET-role memberships for anon/authenticated/service_role. The postgres owner's broader platform memberships were inventoried but not replicated in the DDL harness.

## Complete grants and signature inventory

Every row has schema `soundpub` and owner `postgres`. “EXECUTE grantees” lists explicit/effective-default ACL grantees; all grantors are postgres, with no grant options. Public/anon/authenticated columns distinguish PUBLIC-derived access from direct grants. Function owner always retains execution. Service execution is derived from the grantee list or PUBLIC; `complete_payout` and `delete_release_with_refund` do not grant service_role.

| Function (identity arguments) | Owner | EXECUTE grantees | PUBLIC | anon effective | authenticated effective | Fixed search_path / value | Frontend RPC executable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `soundpub.admin_review_copyright_registration(_registration_id uuid, _status text, _admin_notes text, _revision_notes text, _composer_code text, _contract_number text)` | postgres | postgres, authenticated, service_role | No | No | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.admin_update_copyright_contract(_registration_id uuid, _status text, _preview_html_url text, _draft_pdf_url text, _generated_pdf_url text, _stamped_pdf_url text)` | postgres | postgres, authenticated, service_role | No | No | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.audit_row_change()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | No (trigger) |
| `soundpub.auto_assign_artist_role()` | postgres | PUBLIC, postgres | Yes | Yes | Yes | Yes: `soundpub, public` | No (trigger) |
| `soundpub.auto_assign_new_user_to_soundpub_label()` | postgres | PUBLIC, postgres | Yes | Yes | Yes | Yes: `soundpub, public` | No (trigger) |
| `soundpub.can_access_takedown_release(_user_id uuid, _release_id uuid)` | postgres | PUBLIC, postgres, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | Yes (ACL/API schema) |
| `soundpub.can_create_takedown_request(_user_id uuid, _label_id uuid)` | postgres | PUBLIC, postgres, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | Yes (ACL/API schema) |
| `soundpub.check_rate_limit(p_identifier text, p_action_type text, p_max_attempts integer, p_window_minutes integer)` | postgres | postgres, service_role | No | No | No | Yes: `soundpub, public` | No (server/owner) |
| `soundpub.cleanup_expired_tokens()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | No: `UNSET` | Yes (ACL/API schema) |
| `soundpub.cleanup_rate_limits()` | postgres | postgres, service_role | No | No | No | No: `UNSET` | No (server/owner) |
| `soundpub.commit_royalty_upload(p_rows jsonb, p_actor_id uuid, p_filename text, p_original_filename text, p_replace_existing boolean, p_replace_mode text, p_idempotency_key text)` | postgres | postgres, service_role | No | No | No | Yes: `soundpub, public` | No (server/owner) |
| `soundpub.complete_payout(_payout_id uuid)` | postgres | postgres | No | No | No | Yes: `soundpub, auth` | No (server/owner) |
| `soundpub.current_user_can_view_royalty(_artist_user_id uuid, _label_user_id uuid)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, auth` | Yes (ACL/API schema) |
| `soundpub.delete_release_with_refund(p_release_id uuid)` | postgres | postgres, authenticated | No | No | Yes | Yes: `soundpub, auth, public` | Yes (ACL/API schema) |
| `soundpub.enforce_registered_label_release_artist()` | postgres | PUBLIC, postgres | Yes | Yes | Yes | Yes: `soundpub, auth, pg_temp` | No (trigger) |
| `soundpub.enforce_registered_label_track_artist()` | postgres | PUBLIC, postgres | Yes | Yes | Yes | Yes: `soundpub, auth, pg_temp` | No (trigger) |
| `soundpub.enforce_release_distribution_service()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, auth, pg_temp` | No (trigger) |
| `soundpub.enforce_takedown_request_required_fields()` | postgres | PUBLIC, postgres | Yes | Yes | Yes | Yes: `soundpub, pg_temp` | No (trigger) |
| `soundpub.generate_composer_code(_prefix text)` | postgres | postgres, authenticated, service_role | No | No | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.generate_copyright_contract_number(_prefix text)` | postgres | postgres, authenticated, service_role | No | No | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_artist_profile_summary(_artist_user_id uuid)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, auth` | Yes (ACL/API schema) |
| `soundpub.get_dashboard_role_stats()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, auth` | Yes (ACL/API schema) |
| `soundpub.get_my_composer_royalties(_period text)` | postgres | postgres, authenticated, service_role | No | No | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_artist_breakdown(_period text, _limit integer)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_comparison(_current_periods text[], _previous_periods text[])` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_country_summary(_limit integer)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_label_breakdown(_period text)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_monthly_summary()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_period_summary()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_periods()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_platform_summary(_limit integer)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_stats()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_top_performers(_current_periods text[], _previous_periods text[], _group_by text, _limit integer)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_royalty_track_breakdown(_period text)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.get_soundpub_label_id()` | postgres | PUBLIC, postgres, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | Yes (ACL/API schema) |
| `soundpub.get_user_full_name(user_id uuid)` | postgres | PUBLIC, postgres, service_role, anon, authenticated | Yes | Yes | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.handle_new_user()` | postgres | postgres, service_role, supabase_auth_admin | No | No | No | Yes: `soundpub, public, auth` | No (trigger) |
| `soundpub.has_role(user_id uuid, role soundpub.app_role)` | postgres | postgres, service_role, authenticated | No | No | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.is_admin(user_id uuid)` | postgres | postgres, service_role, authenticated | No | No | Yes | Yes: `soundpub` | Yes (ACL/API schema) |
| `soundpub.is_soundpub_artist_for_release(_user_id uuid, _label_id uuid)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, pg_temp` | Yes (ACL/API schema) |
| `soundpub.is_soundpub_takedown_user(_user_id uuid)` | postgres | PUBLIC, postgres, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | Yes (ACL/API schema) |
| `soundpub.is_superadmin(user_id uuid)` | postgres | PUBLIC, postgres | Yes | Yes | Yes | Yes: `soundpub, pg_temp` | Yes (ACL/API schema) |
| `soundpub.rebuild_royalty_balances()` | postgres | postgres, service_role | No | No | No | Yes: `soundpub, public` | No (server/owner) |
| `soundpub.record_auth_audit(p_action text, p_target_id uuid)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | Yes (ACL/API schema) |
| `soundpub.repair_orphan_artist_link(_issue_type text, _profile_id uuid, _full_name text, _related_label_id uuid)` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | Yes (ACL/API schema) |
| `soundpub.request_payout(_amount numeric, _bank_name text, _account_number text, _account_holder_name text)` | postgres | postgres, authenticated, service_role | No | No | Yes | Yes: `soundpub, auth, public` | Yes (ACL/API schema) |
| `soundpub.reverse_royalty_upload(p_upload_id uuid, p_actor_id uuid, p_reason text)` | postgres | postgres, service_role | No | No | No | Yes: `soundpub, public` | No (server/owner) |
| `soundpub.scan_orphan_artist_links()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | Yes (ACL/API schema) |
| `soundpub.sync_managed_artist_markers()` | postgres | PUBLIC, postgres, anon, authenticated, service_role | Yes | Yes | Yes | Yes: `soundpub, public` | No (trigger) |
| `soundpub.update_balance_on_payout_status_change()` | postgres | PUBLIC, postgres, service_role, anon, authenticated | Yes | Yes | Yes | Yes: `soundpub` | No (trigger) |
| `soundpub.update_payout_status(_payout_id uuid, _status text, _notes text, _proof_path text, _proof_name text)` | postgres | postgres, authenticated, service_role | No | No | Yes | Yes: `soundpub, auth, public` | Yes (ACL/API schema) |

## Per-function purpose, caller authorization and least privilege

R = SELECT, W = INSERT/UPDATE/DELETE, RW = both. Required privileges describe the body's objects, not approval for a BYPASSRLS owner. All rows remain **reviewed, unchanged by Agent D, pending independent QA**. “HIGH impact” marks sensitive behavior requiring separate financial verification; “HIGH OPEN” identifies an observed unresolved authorization/integrity defect. No per-function behavioral PASS is inferred from body inspection.

| Function | Observed source caller/context | Internal caller authorization | Business purpose / required privileges | Risk / remediation status |
| --- | --- | --- | --- | --- |
| `admin_review_copyright_registration` | Frontend direct | Yes: is_admin(auth.uid()) | Review registration, contract and copyright role; RW copyright tables/profiles/user_roles | MEDIUM; actor gate present; lifecycle/role QA open |
| `admin_update_copyright_contract` | Frontend direct | Yes: is_admin(auth.uid()) | Update contract state/URLs; RW copyright_contracts/registrations | MEDIUM; actor gate present; signed-document workflow QA open |
| `audit_row_change` | Trigger context | No actor authorization; trigger records auth.uid() | Row audit; R profiles/user_roles, W audit_logs | MEDIUM; trim EXECUTE; verify sanitization/header provenance |
| `auto_assign_artist_role` | Trigger context | No; trigger row + configured label | Signup artist role; W user_roles | HIGH dependency; identity setting and trigger ordering unverified |
| `auto_assign_new_user_to_soundpub_label` | Trigger context | No; trigger row/default label | Default profile label; changes NEW.parent_label_id | HIGH dependency; private label setting required |
| `can_access_takedown_release` | SQL helper/nested; no direct frontend call found | No actor binding; checks supplied user role/ownership | Takedown access predicate; R releases/profiles/user_roles | MEDIUM; arbitrary-user Boolean oracle; caller must bind auth.uid() |
| `can_create_takedown_request` | SQL helper/nested; no direct frontend call found | No actor binding; checks supplied user role/label | Takedown creation predicate; R profiles/user_roles | MEDIUM; helper is not a caller authorization gate |
| `check_rate_limit` | Edge service identity | No; service ACL boundary | Limiter; RW rate_limits | MEDIUM; client revocation verified; concurrency/input QA open |
| `cleanup_expired_tokens` | Maintenance caller not found | No | Expire verification/reset tokens; W profiles | HIGH OPEN; anonymous privileged mutation reproduced |
| `cleanup_rate_limits` | Maintenance caller not found | No; service ACL boundary | Remove old rate-limit rows; W rate_limits | MEDIUM OPEN; client revoke verified; search_path unset |
| `commit_royalty_upload` | Edge service identity | Partial: supplied p_actor_id must be admin; trusted service authenticates actor | Transactional royalty import/replacement; RW royalties/uploads/archives/profiles, temp tables, audit | HIGH impact; service-only verified; actor binding/financial QA open |
| `complete_payout` | Owner only; no active call found | Yes: is_admin(auth.uid()); owner-only ACL | Legacy payout completion; RW payouts/profiles | MEDIUM dormant; no trigger binding; retain owner-only until removal review |
| `current_user_can_view_royalty` | SQL helper/nested; no direct frontend call found | Yes: non-null auth.uid(), admin or recipient equality | Royalty predicate; R user_roles | MEDIUM; role/ownership gate; no active/suspended/session check |
| `delete_release_with_refund` | Frontend direct | Yes: admin or label owner, unpaid condition for non-admin | Delete/refund release; RW releases/payments/adjustments/profiles/audit | HIGH impact; actor gate present; financial QA open |
| `enforce_registered_label_release_artist` | Trigger context | Partial: label actor/artist ownership; other roles return NEW | Release validation trigger; R profiles/user_roles | MEDIUM; relies on table ACL/RLS for other callers |
| `enforce_registered_label_track_artist` | Trigger context | Partial: label actor/artist ownership; other roles return NEW | Track validation trigger; R releases/profiles/user_roles | MEDIUM; relies on table ACL/RLS for other callers |
| `enforce_release_distribution_service` | Trigger context | Yes for custom_label: uid/creator/active linked artist | Distribution validation trigger; R profiles/user_roles | MEDIUM; standard distribution relies on table authorization |
| `enforce_takedown_request_required_fields` | Trigger context | No; validates contact/reason only | Takedown validation trigger; changes NEW | LOW; definer privilege appears unnecessary; verify invoker conversion |
| `generate_composer_code` | SQL helper/nested; no direct frontend call found | Yes: is_admin(auth.uid()) | Allocate proposed composer code; R profiles | MEDIUM; deny/allow tested; MAX+1 concurrency open |
| `generate_copyright_contract_number` | SQL helper/nested; no direct frontend call found | Yes: is_admin(auth.uid()) | Allocate proposed contract number; R copyright_contracts | MEDIUM; COUNT+1 concurrent uniqueness open |
| `get_artist_profile_summary` | Frontend direct | Yes: self/admin/parent label | Artist summary; R profiles/royalties/releases/tracks | MEDIUM; unrelated-user denial tested; full positive matrix open |
| `get_dashboard_role_stats` | Frontend direct | Yes: auth.uid() + current_user_can_view_royalty | Dashboard totals and balances; R roles/profiles/royalties | MEDIUM; narrow rows; inactive/suspended semantics open |
| `get_my_composer_royalties` | Frontend direct | Yes: admin or copyright role + own composer_code | Composer royalty rows; R profiles/roles/composer_royalties | MEDIUM; shared composer_code/ownership QA open |
| `get_royalty_artist_breakdown` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_comparison` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_country_summary` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_label_breakdown` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_monthly_summary` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_period_summary` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_periods` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_platform_summary` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_stats` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_top_performers` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_royalty_track_breakdown` | Frontend direct | Yes: current_user_can_view_royalty on rows | Royalty aggregation; R royalties/user_roles | MEDIUM; row predicate present; broad EXECUTE; role/status matrix open |
| `get_soundpub_label_id` | SQL helper/nested; no direct frontend call found | No | Find configured business label; R profiles/user_roles | LOW; identifier lookup; deterministic tie-breaking review open |
| `get_user_full_name` | SQL helper/nested; no direct frontend call found | No; arbitrary supplied UUID | Profile name lookup; R profiles | MEDIUM OPEN; anonymous name oracle reproduced; privacy contract unapproved |
| `handle_new_user` | Trigger context | No caller check; auth trigger + trusted ACL | Create profile/artist role; R/W profiles/user_roles and auth NEW fields | HIGH dependency; source_app/issuer read from user metadata; shared signup QA open |
| `has_role` | SQL helper/nested; no direct frontend call found | No actor binding; supplied user/role | Role lookup; R user_roles | MEDIUM; authenticated role oracle; required nested policy helper |
| `is_admin` | Edge + RLS/nested | No actor binding; supplied user; calls has_role | Admin lookup; R user_roles via has_role | MEDIUM; trusted Edge caller exists; do not revoke blindly |
| `is_soundpub_artist_for_release` | Frontend direct | No actor binding; supplied user/label; status predicate | Artist-label eligibility; R profiles/user_roles | MEDIUM; Boolean oracle; excludes suspended/deleted, permits inactive |
| `is_soundpub_takedown_user` | SQL helper/nested; no direct frontend call found | No actor binding; supplied user | Takedown membership predicate; R profiles/user_roles | MEDIUM; Boolean oracle; caller must bind actor |
| `is_superadmin` | SQL helper/nested; no direct frontend call found | No actor binding; supplied user | Superadmin predicate; R user_roles | MEDIUM; PUBLIC role oracle; policy dependency |
| `rebuild_royalty_balances` | Nested financial functions | No; service ACL boundary | Rebuild balances; R royalties/adjustments/reservations/payouts, W profiles | HIGH impact; service-only verified; financial QA open |
| `record_auth_audit` | Frontend direct | Partial: uid required; arbitrary action/target accepted | Client auth event; W audit_logs | HIGH OPEN for audit integrity; authenticated event forgery reproduced |
| `repair_orphan_artist_link` | Frontend direct | Yes: actor must have admin/superadmin role | Repair release/track/artist links; RW profiles/roles/artists/releases/tracks/audit | MEDIUM; broad EXECUTE unnecessary; gate inspected; full behavior QA open |
| `request_payout` | Frontend direct | Yes: uid, label/whitelabel, positive amount/bank fields | Create payout/reservations; RW payouts/profiles/reservations via rebuild | HIGH impact; actor-bound; suspended/session and financial QA open |
| `reverse_royalty_upload` | Edge service identity | Partial: supplied p_actor_id must be admin; service verifies actor | Reverse/archive import; RW royalties/uploads/archives/profiles/audit | HIGH impact; service-only verified; financial QA open |
| `scan_orphan_artist_links` | Frontend direct | No | Cross-label orphan report; R profiles/roles/releases/tracks/royalties | HIGH OPEN; anonymous and unrelated-user rows reproduced |
| `sync_managed_artist_markers` | Trigger context | No; trigger derives flags from NEW.email | Managed artist markers; changes NEW identity fields | MEDIUM; domain convention/trusted write inputs need auth review |
| `update_balance_on_payout_status_change` | Trigger context | No; legacy trigger uses NEW/OLD | Legacy paid-status balance decrement/refund; W profiles | MEDIUM dormant; zero trigger bindings; double-decrement if reattached |
| `update_payout_status` | Frontend direct | Yes: is_admin(auth.uid()), transitions/proof/reservations | Approve/reject/pay; RW payouts, R reservations, rebuild on rejection | HIGH impact; admin gate present; full financial QA open |

## Caller evidence and preservation constraints

| Caller | SQL functions / policy context | Required caller model |
| --- | --- | --- |
| `src/hooks/useRoyaltyData.ts` | All eleven `get_royalty_*` aggregates | Authenticated actor; shared predicate must remain in every branch/CTE |
| `src/components/layout/DashboardLayout.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Payouts.tsx` | `get_dashboard_role_stats` | Signed-in actor, server-side recipient/role filtering |
| `src/pages/ArtistProfile.tsx:174` | `get_artist_profile_summary` | Self, parent-label owner, admin |
| `src/pages/CopyrightDashboard.tsx:92` | `get_my_composer_royalties` | Own copyright identity or admin |
| `src/pages/CopyrightRegistrationReview.tsx:247` | Review/update contract RPCs | Admin/superadmin; routes use requireAdmin |
| `src/pages/UserOrphanAudit.tsx:136` and `:194` | Scan and repair RPCs | Admin/superadmin; `src/App.tsx:394` route uses requireAdmin but SQL scan currently does not |
| `src/pages/Payouts.tsx:111`, `src/pages/AdminPayouts.tsx:149` | Request / update payout | Label/whitelabel owns request; admin changes status |
| `src/components/releases/DeleteReleaseDialog.tsx:35` | `delete_release_with_refund` | SQL admin/label predicate remains authoritative |
| `src/components/releases/ReleaseFormPage.tsx:389` | `is_soundpub_artist_for_release` | Eligibility helper; not a substitute for actor binding |
| `src/hooks/useAuth.tsx:198,224`, `src/context/SsoAuthContext.tsx:76` | `record_auth_audit` | Untrusted client event with server-derived actor |
| Edge `process-royalty-upload`, `delete-royalty-upload` | Service `is_admin`, `commit_royalty_upload`, `reverse_royalty_upload` | Edge verifies actual actor then supplies actor ID; keep SQL service-only |
| Edge `send-verification-email`, `send-password-reset` | `check_rate_limit` | Trusted service identity; no browser grant |
| Policies in canonical SQL | `is_admin`, `has_role`, `is_superadmin`, `get_user_full_name`, takedown predicates | Revoke only after preserving policy execution for legitimate roles |
| Catalog trigger bindings | Audit, profile default/artist role, managed flags, release/track/takedown validation | Table ACL/RLS plus trigger-specific behavior; not direct RPC |
| `auth.users.on_auth_user_created` | `handle_new_user` AFTER INSERT, enabled O | Shared GoTrue signup; actual auth NEW fields and cross-app ownership prerequisites |

No direct maintenance/scheduler caller for either cleanup function was established. Do not replace that uncertainty with a cron identity or blindly revoke before mapping operational dependencies. The documented recommendation is server-only access after that mapping, with tested maintenance behavior.

## Reproduced failures and negative controls

Tests used a **local-only PostgreSQL 17.6** container with `--network none`, no published ports, tmpfs data, synthetic `example.invalid` identities and a non-superuser/BYPASSRLS postgres function owner. Both canonical schema and ACLs match normalized live catalog fingerprint `d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c`. Auth stubs do not prove real JWT/session behavior.

Synthetic fixture: two labels, one artist, one unrelated ordinary user; artist belongs to label one while a release references label two. Expired verification-token field contains only a synthetic marker. All fixture setup/tests were in one transaction and ROLLBACK removed all rows; subsequent profile count was zero.

| Test / SQL role | Observed result | Security interpretation |
| --- | --- | --- |
| anon `get_user_full_name(other_uuid)` | Returns synthetic other user's name | Ungated profile-name oracle; data minimization/access contract unresolved |
| anon `scan_orphan_artist_links()` | Returns synthetic cross-label issue | **HIGH: missing actor gate bypasses intended admin-only report** |
| authenticated unrelated user, same scan/name lookup | Succeeds | Removing anon alone cannot repair ordinary-user disclosure |
| anon `cleanup_expired_tokens()` | Executes; synthetic expired token becomes NULL | **HIGH: privileged UPDATE callable without authentication** |
| anon `current_user_can_view_royalty(other_artist,other_label)` | false | Current helper fails closed for null actor |
| anon `record_auth_audit('synthetic.denied')` | Exception `Not authenticated` | anon EXECUTE does not mean anonymous audit INSERT succeeds |
| authenticated ordinary user `record_auth_audit('payout.paid',other_uuid)` | Audit row created, server-derived actor, attacker-chosen action/target | **HIGH audit integrity** if consumed as authoritative server/payment evidence |
| ordinary user `generate_composer_code()` | Exception `Only admins can generate composer codes` | Admin gate exercised |
| ordinary user `get_artist_profile_summary(other_uuid)` | Exception `Not allowed to view artist profile summary` | Cross-owner denial exercised |
| same synthetic actor promoted locally to admin, code generator | Returns `SPC00001` | Authorized positive control works with unchanged definer ACL |
| Server-only function catalog grants | anon/authenticated denied for limiter/import/reverse/rebuild/complete | Prior client revocations remain present; no financial operation invoked |

Behavior checks completed with psql exit 0 and explicit assertions. This means the reproduced observations are correct; it is **not** a security PASS. No production metadata row output, cleanup call, audit insertion, financial mutation or role change was performed.

The legacy `update_balance_on_payout_status_change()` and `complete_payout()` bodies still contain direct balance decrements, but live `payout_requests` binds only audit/timestamp triggers. There are **zero** bindings for the legacy balance trigger. This does not prove historical accounting integrity; reattaching it could reintroduce double decrement, and historical reconciliation belongs to the financial workstream.

## Runnable catalog regression

`scripts/phase1b-definer-assertions.sql` is read-only by construction, emits the fingerprint and complete definer ACL inventory, then **fails** on missing fixed paths, anonymous scan/name access, client cleanup access, unexpected client execution of server-only SQL, or missing active Copyright RPCs. Authenticated scan EXECUTE must remain available to a future body-gated admin frontend; that body gate needs behavioral QA. Default checks failed against both local clone and live catalog with:

```text
Phase 1B catalog gates failed: definer missing fixed search_path; ungated orphan scan executable by client roles; ungated token cleanup executable by client roles; ungated profile name lookup executable by anon; active copyright RPC contract missing
```

Both invocations returned nonzero; read-only transactions abort on failure. The server-only ACL check did not add a failure. `-v enforce_security=false` explicitly collects fingerprints/inventory only and does **not** certify security.

```powershell
Get-Content scripts/phase1b-definer-assertions.sql -Raw |
  ssh maskhar@20.20.20.3 'cd /data/supabase/instances/supabase-01/config && docker compose exec -T db psql -X -qAt -U postgres -d postgres'
```

These are targeted catalog regression checks, not automated proof of internal authorization or complete real-role QA. Independent QA must rerun them and the isolated behavioral matrix after remediation.

## Required remediation / gate

**FAIL remains mandatory** while the scan/cleanup and audit-integrity risks remain open. This assignment permits reports/tests only, so no revoke, CREATE OR REPLACE FUNCTION, schema update or production migration was attempted.

1. Add admin authorization inside orphan scan; revoke PUBLIC/anon and retain only authorized application callers. Test anonymous, ordinary/artist/label, inactive/suspended and admin/superadmin paths.
2. Map cleanup scheduling, restrict cleanup to explicit internal identity, pin safe paths, verify exact cleanup semantics. Preserve expired-token maintenance without internet-triggered writes.
3. Separate/label untrusted client auth events; restrict action names/targets and validate header provenance. Do not permit client-origin events to attest payout completion or privileged server actions.
4. Minimize remaining PUBLIC/anon execution per signature; preserve RLS/helper and trusted Edge service dependencies. Review arbitrary-user name/role/relationship oracles and trigger-only invoker conversion.
5. Verify financial actor binding, current active/session status policy, signup user_metadata-derived classification, cross-app auth trigger and least-privilege ownership in an isolated full auth stack.
6. Add rollback DDL from the exact live functions/ACLs, apply only a separately authorized reviewed migration, run regression/positive controls, then obtain independent QA.

**No HIGH privilege-bypass closure, no SECURITY DEFINER PASS, no Phase 2 readiness claim.**

