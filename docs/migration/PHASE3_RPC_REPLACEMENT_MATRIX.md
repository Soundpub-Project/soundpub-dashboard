# Phase 3 RPC Replacement Matrix

**Overall replacement status: BLOCKED.**

Evidence date: 2026-10-28. Static working-tree review only. No RPC invoked; no production connection, schema mutation or application code change. Read alongside [domain matrix](PHASE3_DOMAIN_MIGRATION_MATRIX.md) and Phase1G database/function contracts.

## Counting and acceptance

`src` contains **27 distinct literal RPC names / 32 call sites**, including multiline calls and `(supabase as any)` casts. The generated caller appendix preserves every site. Phase1G catalogs 56 SQL signatures: 23 correspond to frontend names, four more are called by local Edge code, and 29 are other internal/trigger/policy routines. Four additional frontend names are missing from recorded live catalog evidence. Thus union is **60 distinct routine names**, not 60 frontend RPCs.

All 27 frontend RPC replacements are BLOCKED for acceptance: no registered operation-specific backend route exists. Migrated 0; explicitly deferred frontend RPCs 0; blocked 27. Auth-provider cutover is deferred to Phase4, but `record_auth_audit` still needs a business audit replacement. No PARITY_VERIFIED result is inferred from typed declarations, old SQL, existing financial hardening tests or Phase2 foundation PASS.

Outputs below are caller-consumed contracts, not proof source returns them successfully. Proposed service names are **unimplemented** and do not reserve routes. A future route must be agreed with frontend owner; `/api/v1/me` does not replace arbitrary profile/dashboard RPCs. Authorization describes target requirements; existing SQL privilege behavior may be weaker and must not be copied.

## Frontend inputs and outputs

| RPC | Domain / business purpose | Actual input | Caller-consumed output |
| --- | --- | --- | --- |
| `get_dashboard_role_stats` | Dashboard / payout availability, role-scoped aggregate | No args; `.single()` in layout and payout page | One row with available balance plus revenue/stream/role statistics consumed by Dashboard. Exact keys must follow canonical SQL and UI; monetary values become exact decimal DTOs. |
| `get_artist_profile_summary` | Artist summary, releases and earnings | `_artist_user_id: targetUserId` | JSON `{totals,topTracks,recentReleases,monthlyRevenue}`; see `ArtistSummary` in ArtistProfile. |
| `is_soundpub_artist_for_release` | Releases / custom-label eligibility | `_user_id`, `_label_id` from current user/profile | Boolean; caller requires strict `=== true`. Client-supplied IDs are not target authority. |
| `delete_release_with_refund` | Release deletion and paid refund | `p_release_id` UUID | JSON `{deleted,refundAmount}`; UI consumes refund amount and refreshes list. |
| `record_auth_audit` | Audit login/logout/SSO events | `p_action`: `auth.login`, `auth.logout`, `auth.sso_login`; no target passed | Return ignored; SQL declares void. Login/SSO callers fire-and-forget; logout awaits. |
| `get_royalty_stats` | Royalties / top-level totals | No args | First row: `total_revenue,total_streams,unique_artists,unique_labels,unique_platforms,unique_tracks`; empty returns null. |
| `get_royalty_monthly_summary` | Royalties / monthly chart | No args | Rows `period,revenue,streams`; caller aliases period to month too. |
| `get_royalty_platform_summary` | Royalties / platform chart | `_limit` default 10 | Rows `platform,revenue,streams`; UI adds chart color. |
| `get_royalty_country_summary` | Royalties / country chart | `_limit` default 10 | Rows `country,revenue,streams`; UI adds chart color. |
| `get_royalty_periods` | Royalties / period choices | No args | Rows `{period}`, mapped to string array. |
| `get_royalty_period_summary` | Royalties / per-period totals and growth | No args | `period,revenue,streams,unique_tracks,unique_artists,unique_labels,top_platform,top_country,growth`. |
| `get_royalty_label_breakdown` | Royalties / label shares | `_period: string|null` | `label_name,revenue,streams,artist_share,label_share,admin_share`. |
| `get_royalty_artist_breakdown` | Royalties / artist shares | `_period`, `_limit` default 20 | `artist_name,revenue,streams,track_count,is_Soundpub,artist_share,label_share,admin_share`; preserve source spelling through explicit mapping. |
| `get_royalty_track_breakdown` | Royalties / track shares | `_period` | `isrc,title,artist_name,label,revenue,streams,platform_count,country_count,is_Soundpub,artist_share,label_share,admin_share`. |
| `get_royalty_comparison` | Royalties / period comparison | `_current_periods: string[]`, `_previous_periods: string[]` | `data_type,period,revenue,streams`; caller builds current/previous maps. |
| `get_royalty_top_performers` | Royalties / comparative ranking | Same two period arrays, `_group_by: title|platform|country`, `_limit` default 10 | `name,revenue,streams,growth`; enabled only with current periods. |
| `get_my_composer_royalties` | Copyright / composer's earnings | `_period:null` in current caller | Royalty rows stored directly in dashboard; preserve period/amount/share fields used by UI, visibility and empty behavior. |
| `request_payout` | Payouts / reserve balance and create request | `_amount`, `_bank_name`, `_account_number`, `_account_holder_name` | SQL returns UUID; UI checks error only, then separately inserts notifications/sends email/refetches. |
| `update_payout_status` | Payouts / staff transition | `_payout_id`, `_status`, `_notes:null|string`, `_proof_path`, `_proof_name:null|string` | Void/error; UI refreshes payout list. |
| `admin_review_copyright_registration` | Copyright / registration review | `_registration_id`, `_status`, `_admin_notes:null`, `_revision_notes`, `_composer_code`, `_contract_number:null` | Return ignored; UI reloads registrations after success. |
| `admin_update_copyright_contract` | Copyright / contract status and PDF links | `_registration_id`, `_status`, `_preview_html_url`, `_draft_pdf_url`, `_generated_pdf_url`, `_stamped_pdf_url`; stamped path after upload | Return ignored; UI reloads registration/contract. Upload and RPC are separate side effects. |
| `scan_orphan_artist_links` | Users/artists / diagnose broken links | No args | Array of `OrphanArtistLink` issues; includes type, profile/label identifiers, names and reason; UI exports Markdown/JSON/CSV. |
| `repair_orphan_artist_link` | Users/artists / safe repair | `_issue_type`, `_profile_id`, `_full_name`, `_related_label_id` | JSON optional `message`; caller rescans; promises no movement of historical royalties. |
| `validate_royalty_csv_row` | Copyright royalties / row validation | `_composer_code`, `_composer_name`, `_total_net_royalti`, `_period` | UI casts `ValidationResult`, uses `is_valid`; failures currently continue loop. **Actual contract unknown; absent recorded catalog.** |
| `import_composer_royalties` | Copyright royalties / batch import/replace | `_csv_rows` validated rows, `_period`, `_filename`, `_replace_existing` | UI expects `{success,success_rows,error?}`. **Actual atomicity/provenance/replay unknown; absent recorded catalog.** |
| `get_royalty_upload_history` | Copyright royalties / admin history | `_limit:100` | `UploadRecord[]`: id/uploader_email/filename/period/row counts/status/error_summary/timestamps. **Actual contract unknown; absent recorded catalog.** |
| `delete_royalty_upload` | Copyright royalties / remove upload | `_upload_id` UUID | UI expects `deleted_royalty_records`. **Actual reversal/settlement contract unknown; absent recorded catalog.** Not Edge `delete-royalty-upload`. |

## Authorization, transactions and replacements

| RPC / group | Authorization and visibility required | Transaction / side-effect contract | Replacement endpoint/service / parity status |
| --- | --- | --- | --- |
| `get_dashboard_role_stats` | Current active actor; label/whitelabel authorized aggregate, others scoped role behavior | Read consistent royalties/reservations; no balance mutation | Unimplemented dashboard summary service; no endpoint. BLOCKED; generic profile balance is insufficient. |
| `get_artist_profile_summary` | Owner, authorized parent label or explicit staff capability; unrelated user denied | Read release/track/royalty aggregation without N+1; source runbook `31-artist-profile-summary-rpc.sql` is historical contract evidence | Unimplemented artist summary service. BLOCKED. |
| `is_soundpub_artist_for_release` | Derive actor/approved label membership server-side | Read eligibility; release submission must recheck it, not trust preflight result | Unimplemented release eligibility service. BLOCKED. |
| `delete_release_with_refund` | Staff, or eligible owning label for unpaid case; paid refund requires privileged policy | Source hardening uses financial advisory lock, release/payment row lock, adjustment, delete/cascade, balance rebuild and audit in one SQL transaction. Target must retain exactly-once refund/rollback | Unimplemented release deletion/refund service. BLOCKED. |
| `record_auth_audit` | Verified actor; allowlisted event, never caller actor/target escalation | Append server-derived event; sensitive role/status changes already audited by users service but do not cover auth login/logout | Unimplemented auth audit capability; provider integration Phase4. BLOCKED replacement, no parity. |
| Eleven `get_royalty_*` reporting RPCs above | Active actor and royalty visibility matching reviewed `current_user_can_view_royalty`; label/artist/staff cases; no global role-only access | Read-only consistent aggregates, exact decimals and deterministic ranking/limits. Preserve null/all-period semantics, empty results, zero growth and division edge cases | Unimplemented royalty reporting service. BLOCKED all eleven; no reporting endpoints. |
| `get_my_composer_royalties` | Current composer mapping; explicit staff policy, unrelated composer denied | Read-only; preserve period filter and exact amount/share interpretation | Unimplemented composer royalty service. BLOCKED. |
| `request_payout` | Active verified label/whitelabel, actor-owned aggregate; validated bank data and server minimum/amount checks | Source hardening locks financial mutation, rebuilds balances, creates request and locks/reserves profile funds; insufficient funds rolls all back. Target adds scoped idempotency and commits audit/outbox with request. Current browser notification/email is outside transaction | Unimplemented payout request service. BLOCKED; concurrency/reservation/idempotency tests required. |
| `update_payout_status` | Active authorized staff; proof access checked server-side | Source permits pending→approved, pending/approved→rejected, approved→paid with proof and reservation equality. Paid must not debit twice; rejection releases availability. Target commits audit/outbox atomically | Unimplemented payout transition service. BLOCKED; no provider settlement route. |
| `admin_review_copyright_registration` | Active authorized reviewer; owner cannot self-approve | Atomic registration/profile/composer-code/contract-number changes and audit; statuses and approval side effects require canonical-body fixtures | Unimplemented copyright review service. BLOCKED. |
| `admin_update_copyright_contract` | Active authorized reviewer; private document access | Atomic contract/registration status/link metadata plus audit; object upload has staged/reconcile lifecycle outside SQL | Unimplemented copyright contract service. BLOCKED. |
| `scan_orphan_artist_links` | Restricted active staff; no anonymous diagnostic metadata | Read-only issue projection; source historical anonymous exposure must not be reproduced | Unimplemented orphan audit service. BLOCKED. |
| `repair_orphan_artist_link` | Restricted staff with target ownership/hierarchy guards | One transaction for allowed link repair + audit; preserve historical royalty owner; fail conflict/ambiguous match | Unimplemented link repair service. BLOCKED. |
| Four missing Copyright RPCs | Product must define composer identity mapping, admin visibility, validation and reversal authorization | Product must define validation results, import replace/replay, source rows/history, settlement restrictions and rollback/audit. Do not borrow music royalty commit semantics without proof | BLOCKED unknown contract. `PHASE1E_RPC_RESOLUTION.md` records live absence; Phase1G final report preserves this gate. No new live query made here. |

Source transaction reference: `supabase/migrations/20261023041039_harden_royalty_financial_workflows.sql:121–224`. This is local source evidence; recorded Phase1G catalog establishes scope, not fresh deployment verification. Do not replay this migration against production for documentation validation.

## Edge-internal RPCs

These four names have no direct frontend `.rpc` call. Their frontend parent operation is in the Edge matrix. None has an operation-specific backend replacement or parity result.

| RPC | Actual local caller | Input / output | Authorization / transaction | Replacement / state |
| --- | --- | --- | --- | --- |
| `commit_royalty_upload` | `supabase/functions/process-royalty-upload/index.ts:292` | `p_rows,p_actor_id,p_filename,p_original_filename,p_replace_existing,p_replace_mode,p_idempotency_key`; JSON object with boolean success required | Actor derived after verification/admin check; SQL atomic import/archive/replace/balance/provenance; Edge also provisions managed identities and compensates uncertain failures outside SQL | Unimplemented royalty import worker/service. BLOCKED; generic worker is not parity. |
| `reverse_royalty_upload` | `supabase/functions/delete-royalty-upload/index.ts:74` | `p_upload_id,p_actor_id,p_reason`; `{ok:true,deletedRecords}`; Edge wraps `success,deletedRecords,balanceRebuilt,rebuildErrors` | Verified admin, UUID/reason validation, serialized audited reversal/rebuild; settlement restrictions and replay must be tested | Unimplemented royalty reversal service. BLOCKED. |
| `is_admin` | process upload `:156`, delete upload `:65`, send royalty notification `:116` | `{user_id}`; boolean | Replace SQL service-role check with current Soundpub-local role/status policy; never trust caller actor | Existing shared authorizer supports foundation policies only; parent domain authorization unverified. BLOCKED parent operations. |
| `check_rate_limit` | send password reset `:60`, send verification email `:40` | SQL signature text/text/integer/integer; caller counter identity/action/limit/window, decision output must be reviewed before wiring | Counter mutation; current per-process API limiter is not distributed/provider recovery parity | Real Auth recovery deferred Phase4; no parity. DEFERRED. |

## Other catalog routines

The generated catalog appendix below retains **all 56 signatures**, including the 29 without frontend/Edge literal calls. A signature's absence from `src` does not justify deleting a trigger, RLS helper or external SQL consumer. Those 29 are DEFERRED for internal implementation/consumer review; no public endpoint is proposed. Their output and exact transactional behavior require canonical SQL body review before implementation; a signature alone supplies argument types only.

Financial internals `rebuild_royalty_balances`, `complete_payout`, `update_balance_on_payout_status_change` belong to payout/royalty service transactions. Historical `complete_payout` is revoked in local hardening; never expose it as an extra completion route or reproduce double debit. `current_user_can_view_royalty` becomes explicit visibility policy. Takedown helpers/validation triggers belong to case service/DB constraints. Signup/managed-marker routines become local provisioning rules without global Auth effects. Audit sanitize/row-change and timestamp triggers remain internal integrity responsibilities. Password/token cleanup is provider-owned later work. `has_role,is_superadmin,is_admin` become trusted local authorization; no browser role predicate endpoint is needed.

## Completion gate

Require canonical input/output fixtures, all role/owner/status denials, filters/order/pagination, exact financial arithmetic, error mapping, side effects, rollback/concurrency/idempotency, frontend regression and independent QA before removing each legacy caller. Four missing contracts must remain visible as BLOCKED until resolved. Coverage check lives in the domain matrix; it validates names only.

## Extracted frontend caller evidence

Literal names extracted across all `.ts` / `.tsx` files under `src`, including multiline calls. Line numbers are snapshot locators, not runtime proof.

| Name | Exact source sites |
| --- | --- |
| `admin_review_copyright_registration` | `src/pages/CopyrightRegistrationReview.tsx:247` |
| `admin_update_copyright_contract` | `src/pages/CopyrightRegistrationReview.tsx:276`; `src/pages/CopyrightRegistrationReview.tsx:392` |
| `delete_release_with_refund` | `src/components/releases/DeleteReleaseDialog.tsx:35` |
| `delete_royalty_upload` | `src/pages/CopyrightRoyaltyUploadHistory.tsx:82` |
| `get_artist_profile_summary` | `src/pages/ArtistProfile.tsx:174` |
| `get_dashboard_role_stats` | `src/components/layout/DashboardLayout.tsx:43`; `src/pages/Dashboard.tsx:174`; `src/pages/Payouts.tsx:81` |
| `get_my_composer_royalties` | `src/pages/CopyrightDashboard.tsx:104` |
| `get_royalty_artist_breakdown` | `src/hooks/useRoyaltyData.ts:140` |
| `get_royalty_comparison` | `src/hooks/useRoyaltyData.ts:191` |
| `get_royalty_country_summary` | `src/hooks/useRoyaltyData.ts:66` |
| `get_royalty_label_breakdown` | `src/hooks/useRoyaltyData.ts:119` |
| `get_royalty_monthly_summary` | `src/hooks/useRoyaltyData.ts:31` |
| `get_royalty_period_summary` | `src/hooks/useRoyaltyData.ts:97` |
| `get_royalty_periods` | `src/hooks/useRoyaltyData.ts:83` |
| `get_royalty_platform_summary` | `src/hooks/useRoyaltyData.ts:48` |
| `get_royalty_stats` | `src/hooks/useRoyaltyData.ts:10` |
| `get_royalty_top_performers` | `src/hooks/useRoyaltyData.ts:218` |
| `get_royalty_track_breakdown` | `src/hooks/useRoyaltyData.ts:164` |
| `get_royalty_upload_history` | `src/pages/CopyrightRoyaltyUploadHistory.tsx:63` |
| `import_composer_royalties` | `src/pages/CopyrightRoyaltyUpload.tsx:184` |
| `is_soundpub_artist_for_release` | `src/components/releases/ReleaseFormPage.tsx:389` |
| `record_auth_audit` | `src/context/SsoAuthContext.tsx:76`; `src/hooks/useAuth.tsx:190`; `src/hooks/useAuth.tsx:216` |
| `repair_orphan_artist_link` | `src/pages/UserOrphanAudit.tsx:194` |
| `request_payout` | `src/pages/Payouts.tsx:111` |
| `scan_orphan_artist_links` | `src/pages/UserOrphanAudit.tsx:136` |
| `update_payout_status` | `src/pages/AdminPayouts.tsx:149` |
| `validate_royalty_csv_row` | `src/pages/CopyrightRoyaltyUpload.tsx:135` |

## Complete Phase1G SQL signature ledger

All signatures retained from database extraction contract, function rows. Argument types are source catalog evidence; no uninspected output schema is invented. Frontend contracts appear above; internal and trigger/policy behavior stays explicitly scoped.

| Catalog signature | Caller scope | Replacement / acceptance |
| --- | --- | --- |
| `soundpub.admin_review_copyright_registration(uuid, text, text, text, text, text)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.admin_update_copyright_contract(uuid, text, text, text, text, text)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.audit_row_change()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.audit_sanitize(jsonb)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.auto_assign_artist_role()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.auto_assign_new_user_to_soundpub_label()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.can_access_takedown_release(uuid, uuid)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.can_create_takedown_request(uuid, uuid)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.check_rate_limit(text, text, integer, integer)` | Edge-internal caller(s) listed above | Internal service/policy above; DEFERRED Auth limiter or BLOCKED parent workflow |
| `soundpub.cleanup_expired_tokens()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.cleanup_rate_limits()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.commit_royalty_upload(jsonb, uuid, text, text, boolean, text, text)` | Edge-internal caller(s) listed above | Internal service/policy above; DEFERRED Auth limiter or BLOCKED parent workflow |
| `soundpub.complete_payout(uuid)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.current_user_can_view_royalty(uuid, uuid)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.delete_release_with_refund(uuid)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.enforce_registered_label_release_artist()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.enforce_registered_label_track_artist()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.enforce_release_distribution_service()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.enforce_takedown_request_required_fields()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.generate_composer_code(text)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.generate_copyright_contract_number(text)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.generate_managed_artist_email(text)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.get_artist_profile_summary(uuid)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_dashboard_role_stats()` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_my_composer_royalties(text)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_artist_breakdown(text, integer)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_comparison(text[], text[])` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_country_summary(integer)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_label_breakdown(text)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_monthly_summary()` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_period_summary()` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_periods()` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_platform_summary(integer)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_stats()` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_top_performers(text[], text[], text, integer)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_royalty_track_breakdown(text)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.get_soundpub_label_id()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.get_user_full_name(uuid)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.guard_profile_sensitive_update()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.handle_new_user()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.has_role(uuid, soundpub.app_role)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.is_admin(uuid)` | Edge-internal caller(s) listed above | Internal service/policy above; DEFERRED Auth limiter or BLOCKED parent workflow |
| `soundpub.is_managed_artist_email(text)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.is_soundpub_artist_for_release(uuid, uuid)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.is_soundpub_takedown_user(uuid)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.is_superadmin(uuid)` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.rebuild_royalty_balances()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.record_auth_audit(text, uuid)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.repair_orphan_artist_link(text, uuid, text, uuid)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.request_payout(numeric, text, text, text)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.reverse_royalty_upload(uuid, uuid, text)` | Edge-internal caller(s) listed above | Internal service/policy above; DEFERRED Auth limiter or BLOCKED parent workflow |
| `soundpub.scan_orphan_artist_links()` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.sync_managed_artist_markers()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.update_balance_on_payout_status_change()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
| `soundpub.update_payout_status(uuid, text, text, text, text)` | Frontend caller(s) listed above | Domain service above; BLOCKED, no replacement route/parity |
| `soundpub.update_timestamp()` | No literal frontend or local Edge RPC call found; internal/trigger/policy or external consumer review required | Internal service/constraint/worker mapping; DEFERRED; no public route or parity claim |
