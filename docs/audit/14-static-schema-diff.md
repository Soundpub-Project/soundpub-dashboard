# 14 — Static Migration Diff

Status: **NON-AUTHORITATIVE REPOSITORY-ONLY COMPARISON**

Generated: 2026-11-24T04:45:28.678Z

No database, backup key, decrypted data, production host, or Docker container was used. This report compares SQL text only. It does not prove that migrations were applied, that final schema definitions are equivalent, or that effective privileges match.

## Inventory

### supabase/migrations

- Files: 33
- Version widths: 8:26, 14:7
- Missing versions: 0
- Duplicate versions: `20260816 (3)`, `20260901 (4)`, `20260904 (3)`, `20260907 (5)`, `20260909 (7)`
- SHA-256 manifest entries: 33

<details>
<summary>Checksums</summary>

`supabase\migrations\20260816_rebuild_royalty_balances.sql` `d5fd36cc9c2a…`
`supabase\migrations\20260816_repair_royalty_allocations.sql` `8b91082f949b…`
`supabase\migrations\20260816_skip_utero_users_in_soundpub_auth_trigger.sql` `b5fd70f73712…`
`supabase\migrations\20260817_harden_soundpub_auth_events_and_role_functions.sql` `f288c581089a…`
`supabase\migrations\20260901_create_takedown_feature.sql` `95869a68d6dc…`
`supabase\migrations\20260901_set_null_release_creator_on_user_delete.sql` `3429a6b7ebbb…`
`supabase\migrations\20260901_set_null_release_profile_refs_on_user_delete.sql` `8c95a4f0147e…`
`supabase\migrations\20260901_set_null_remaining_nullable_profile_refs.sql` `eacddd92adf9…`
`supabase\migrations\20260902_expand_takedown_to_labels.sql` `9ee83e670f44…`
`supabase\migrations\20260904_add_takedown_contact_fields.sql` `286759d68f9c…`
`supabase\migrations\20260904_label_aggregate_payouts.sql` `059846e5cbcd…`
`supabase\migrations\20260904_payout_reserve_and_proof.sql` `dc38e4ad99ea…`
`supabase\migrations\20260906_release_invoice_pdfs.sql` `c5a0488633d2…`
`supabase\migrations\20260907_allow_compilation_release_type.sql` `55942b2b1a94…`
`supabase\migrations\20260907_comprehensive_audit_logging.sql` `7a2e4063e00a…`
`supabase\migrations\20260907_harden_user_role_management.sql` `de4ff128c4df…`
`supabase\migrations\20260907_reconcile_kaditrudit_payout_balance.sql` `bda12b4cebd2…`
`supabase\migrations\20260907_restrict_payouts_to_labels.sql` `e74790577e48…`
`supabase\migrations\20260909_add_copyright_payment_invoice_fields.sql` `9944437bf86a…`
`supabase\migrations\20260909_add_release_distribution_service.sql` `9013bfec2d67…`
`supabase\migrations\20260909_add_revision_submitted_release_status.sql` `e43cf92c3387…`
`supabase\migrations\20260909_add_soundpub_label_custom_release_price.sql` `cd1f12a0b947…`
`supabase\migrations\20260909_require_registered_label_artists_for_releases.sql` `d7690e878bca…`
`supabase\migrations\20260909_require_takedown_other_reason_and_contact.sql` `2a9a85b391ff…`
`supabase\migrations\20260909_set_soundpub_custom_release_price.sql` `31970e6dcd39…`
`supabase\migrations\20260910_assign_artist_role_on_soundpub_signup.sql` `beb3f8ab5a9b…`
`supabase\migrations\20261023041039_harden_royalty_financial_workflows.sql` `abaa0f19e956…`
`supabase\migrations\20261023053436_secure_royalty_period_imports_and_recipient_mapping.sql` `761197f8ee0d…`
`supabase\migrations\20261023055419_royalty_import_integrity_hotfix.sql` `690d8677af94…`
`supabase\migrations\20261023055703_royalty_artist_history_guard.sql` `692369e5d981…`
`supabase\migrations\20261026202235_harden_database_security_boundaries.sql` `bfa27beae96b…`
`supabase\migrations\20261026215612_make_contracts_private.sql` `fc8d8be62dba…`
`supabase\migrations\20261027013740_phase1c_restrict_maintenance_definers.sql` `42acfc0c5d07…`

</details>

### backend/migrations

- Files: 81
- Version widths: 4:81
- Missing versions: 0
- Duplicate versions: —
- SHA-256 manifest entries: 81

<details>
<summary>Checksums</summary>

`backend\migrations\0001_foundation.sql` `c12955d171cc…`
`backend\migrations\0002_app_grants.sql` `ea7b2023e05e…`
`backend\migrations\0003_restrict_runtime.sql` `bcdb21141e85…`
`backend\migrations\0004_runtime_least_privilege.sql` `a54e9226f897…`
`backend\migrations\0005_role_authority_lock.sql` `7a187a109546…`
`backend\migrations\0006_user_profiles.sql` `07932e15a9b1…`
`backend\migrations\0007_artists_labels.sql` `2de696900958…`
`backend\migrations\0008_release_tracks.sql` `41652f10184d…`
`backend\migrations\0009_media.sql` `90b96129c9dd…`
`backend\migrations\0010_notifications.sql` `3ccf8fd620be…`
`backend\migrations\0011_settings.sql` `8e7a3c09b541…`
`backend\migrations\0012_media_request_order.sql` `330d9b88f9a7…`
`backend\migrations\0013_public_settings_media.sql` `f1a370b319b2…`
`backend\migrations\0014_finance_ledger.sql` `307ff1d64a65…`
`backend\migrations\0015_royalties.sql` `8562108c5e80…`
`backend\migrations\0016_payouts.sql` `afbc9da26cf5…`
`backend\migrations\0017_payments.sql` `6e741d4fc763…`
`backend\migrations\0018_release_price_snapshot_insert.sql` `b06f1e9b9ac4…`
`backend\migrations\0019_local_auth.sql` `f9fc9241a94e…`
`backend\migrations\0020_composer_codes.sql` `494f3404ac1f…`
`backend\migrations\0021_safe_user_deletion.sql` `2d30e05164d8…`
`backend\migrations\0022_privileged_user_lifecycle.sql` `a7784ec8c8f3…`
`backend\migrations\0023_label_custom.sql` `68aeb29e8f00…`
`backend\migrations\0024_label_custom_release_tracks.sql` `a2a9e6e69246…`
`backend\migrations\0025_label_custom_finance.sql` `12b6c440f476…`
`backend\migrations\0026_label_custom_payout_readiness.sql` `30c241133edd…`
`backend\migrations\0027_label_custom_royalty_reporting.sql` `40155796bf2c…`
`backend\migrations\0028_royalty_allocations.sql` `403ba94fc410…`
`backend\migrations\0029_royalty_catalog_snapshots.sql` `e03e018647e6…`
`backend\migrations\0030_royalty_statement_dimensions.sql` `dbc54666fa4a…`
`backend\migrations\0031_royalty_import_sessions.sql` `3b5a4f96d02a…`
`backend\migrations\0032_royalty_import_cleanup.sql` `ffc5ba0de6e5…`
`backend\migrations\0033_royalty_import_replacements.sql` `1f752f6ae068…`
`backend\migrations\0034_royalty_replacement_guards.sql` `55e7757b95d9…`
`backend\migrations\0035_royalty_replacement_file_sessions.sql` `01863ebc65bf…`
`backend\migrations\0036_royalty_import_streaming.sql` `585f960bfdc4…`
`backend\migrations\0037_royalty_streaming_guards.sql` `e69c3f6f2c26…`
`backend\migrations\0038_royalty_batch_allocation_guard.sql` `0f73f929cd23…`
`backend\migrations\0039_royalty_staging_integrity.sql` `5579cbdb185f…`
`backend\migrations\0040_royalty_detail_pagination.sql` `82cdb76c8720…`
`backend\migrations\0041_royalty_reconciliation.sql` `d4bffe257957…`
`backend\migrations\0042_finance_reconciliation_runs.sql` `b84cbc7bc984…`
`backend\migrations\0043_royalty_preview_approvals.sql` `afca87fbf018…`
`backend\migrations\0044_whitelabel_artist_login.sql` `90a5f59308f0…`
`backend\migrations\0045_copyright_beneficiary_mappings.sql` `95a26ceaf540…`
`backend\migrations\0046_copyright_royalty_posting.sql` `581b6af7632a…`
`backend\migrations\0047_copyright_reconciliation_guard_privilege.sql` `55bd3328cdf2…`
`backend\migrations\0048_copyright_reconciliation_read_grants.sql` `45dab7fc0ccc…`
`backend\migrations\0049_takedowns.sql` `7860c63a6885…`
`backend\migrations\0050_takedown_state_machine.sql` `61d31b9a1e2e…`
`backend\migrations\0051_takedown_documents.sql` `9d7aa5612ab2…`
`backend\migrations\0052_copyright_registrations.sql` `b3e91d825406…`
`backend\migrations\0053_copyright_registration_media.sql` `b02e9e39fceb…`
`backend\migrations\0054_copyright_registration_payments.sql` `16c17b81e5e9…`
`backend\migrations\0055_release_activation_identifiers.sql` `062bc2fd56ec…`
`backend\migrations\0056_local_auth_lifecycle.sql` `7f6fbc4438b1…`
`backend\migrations\0057_payment_owner_snapshots.sql` `74359051c842…`
`backend\migrations\0058_shared_rate_limits.sql` `01f152e46fb9…`
`backend\migrations\0059_iccn_identity_bindings.sql` `8de806e30938…`
`backend\migrations\0060_partner_oauth_replays.sql` `64b788285f1a…`
`backend\migrations\0061_auth_impersonations.sql` `17678610612a…`
`backend\migrations\0062_auth_impersonation_history_snapshots.sql` `4f7df690b994…`
`backend\migrations\0063_payout_settlement_proofs.sql` `2409b4933a07…`
`backend\migrations\0064_payment_invoice_documents.sql` `64844d2a420d…`
`backend\migrations\0065_finance_adjustment_approval.sql` `922665ed8509…`
`backend\migrations\0066_artist_profile_media.sql` `6212618853c6…`
`backend\migrations\0067_release_distribution_metadata.sql` `3a0e4a345d62…`
`backend\migrations\0068_release_pricing_mode_snapshot.sql` `20d7e21750f1…`
`backend\migrations\0069_xendit_invoice_provider.sql` `9cbb373fcb79…`
`backend\migrations\0070_copyright_xendit_payments.sql` `f5443a3c5457…`
`backend\migrations\0071_copyright_payment_reconciliation.sql` `0886aed03f2b…`
`backend\migrations\0072_copyright_payment_audit_reads.sql` `8230d1099088…`
`backend\migrations\0073_copyright_registration_review_pagination.sql` `961ed014d801…`
`backend\migrations\0074_royalty_report_keyset.sql` `d5c41a4b901a…`
`backend\migrations\0075_track_clip_media.sql` `03b8f82a96cf…`
`backend\migrations\0076_media_multipart_uploads.sql` `902a1d21fc59…`
`backend\migrations\0077_royalty_filename_period_replacements.sql` `5c8d8446b208…`
`backend\migrations\0078_managed_artist_login_boundary.sql` `b3116984502b…`
`backend\migrations\0079_catalogless_royalty_identity.sql` `940fd579d353…`
`backend\migrations\0080_catalogless_staging.sql` `448eaff5eaa8…`
`backend\migrations\0081_royalty_same_recipient_isrc.sql` `9d3842415324…`

</details>

## Statement counts

| Object pattern | Supabase | Backend |
|---|---:|---:|
| table | 8 | 75 |
| alteredTable | 47 | 131 |
| index | 14 | 106 |
| policy | 32 | 40 |
| function | 32 | 63 |
| trigger | 6 | 77 |

## Name-level comparison

### Tables seen in CREATE or ALTER TABLE

- Both: 12 — `audit_logs`, `copyright_registration_payments`, `payout_requests`, `profiles`, `releases`, `takedown_request_documents`, `takedown_request_items`, `takedown_request_targets`, `takedown_requests`, `takedown_status_history`, `tracks`, `user_roles`
- Supabase only: 8 — `archived_royalties`, `auth_events`, `balance_adjustments`, `payout_balance_reservations`, `rate_limits`, `release_payments`, `royalties`, `royalty_uploads`
- Backend only: 63 — `application_settings`, `artist_deletion_requests`, `artist_profiles`, `artists`, `auth_impersonations`, `auth_one_time_tokens`, `auth_sessions`, `backend_users`, `copyright_beneficiary_mapping_revocations`, `copyright_beneficiary_mappings`, `copyright_contracts`, `copyright_registration_files`, `copyright_registration_mock_invoices`, `copyright_registration_payment_callback_receipts`, `copyright_registration_status_history`, `copyright_registration_works`, `copyright_registrations`, `copyright_royalty_batches`, `copyright_royalty_corrections`, `copyright_royalty_entries`, `copyright_royalty_reconciliations`, `external_identities`, `finance_accounts`, `finance_adjustment_requests`, `finance_audit`, … (+38)

### CREATE TABLE names

- Both: 5 — `takedown_request_documents`, `takedown_request_items`, `takedown_request_targets`, `takedown_requests`, `takedown_status_history`
- Supabase only: 3 — `archived_royalties`, `balance_adjustments`, `payout_balance_reservations`
- Backend only: 70 — `application_settings`, `artist_deletion_requests`, `artist_profiles`, `artists`, `audit_logs`, `auth_impersonations`, `auth_one_time_tokens`, `auth_sessions`, `backend_users`, `copyright_beneficiary_mapping_revocations`, `copyright_beneficiary_mappings`, `copyright_contracts`, `copyright_registration_files`, `copyright_registration_mock_invoices`, `copyright_registration_payment_callback_receipts`, `copyright_registration_payments`, `copyright_registration_status_history`, `copyright_registration_works`, `copyright_registrations`, `copyright_royalty_batches`, `copyright_royalty_corrections`, `copyright_royalty_entries`, `copyright_royalty_reconciliations`, `external_identities`, `finance_accounts`, … (+45)

### Indexes

- Both: 0 — —
- Supabase only: 14 — `copyright_registration_payments_xendit_invoice_id_idx`, `idx_audit_logs_action`, `idx_audit_logs_created_at`, `idx_audit_logs_ip_address`, `idx_audit_logs_target_type`, `idx_takedown_documents_request`, `idx_takedown_items_release`, `idx_takedown_requests_label_status`, `idx_takedown_requests_requester`, `idx_takedown_targets_request`, `release_payments_invoice_number_key`, `royalties_upload_source_row_unique`, `royalty_uploads_idempotency_key_unique`, `tracks_normalized_isrc_idx`
- Backend only: 102 — `artist_deletion_requests_label_id_id_idx`, `artist_deletion_requests_pending_artist_idx`, `artists_label_custom_unit_id_id_idx`, `artists_label_id_id_idx`, `audit_logs_listing_idx`, `audit_logs_resource_idx`, `auth_impersonations_actor_active_unique`, `auth_impersonations_expiry_idx`, `auth_impersonations_target_active_unique`, `auth_one_time_tokens_active_idx`, `auth_sessions_expiry_idx`, `auth_sessions_user_active_idx`, `backend_users_created_idx`, `backend_users_email_idx`, `backend_users_email_unique`, `backend_users_unverified_email_idx`, `copyright_beneficiary_mapping_revocations_actor_idx`, `copyright_beneficiary_mappings_lookup_idx`, `copyright_beneficiary_mappings_owner_idx`, `copyright_registration_files_registration_idx`, `copyright_registration_history_idx`, `copyright_registration_payment_receipts_unresolved_idx`, `copyright_registration_payments_owner_idx`, `copyright_registration_payments_reconciliation_pending_idx`, `copyright_registration_works_registration_idx`, … (+77)

### Policies

- Both: 0 — —
- Supabase only: 32 — `admin read payout proofs`, `admin upload payout proofs`, `admins can manage permitted roles`, `admins can view all royalties`, `admins can view all uploads`, `admins can view auth events`, `admins manage takedown requests`, `admins update takedown targets`, `artists can view their royalties`, `create takedown items`, `create takedown targets`, `eligible users can create takedown requests`, `insert takedown history`, `labels can view their royalties`, `read own or admin takedown storage files`, `read scoped takedown storage files`, `soundpub admins delete contracts`, `soundpub admins update contracts`, `soundpub admins upload contracts`, `soundpub contract owners and admins read`, `soundpub scoped users can create requests`, `soundpub service role manages contracts`, `takedown users can view scoped requests`, `upload own takedown storage files`, `upload takedown documents`, … (+7)
- Backend only: 40 — `copyright_beneficiary_mapping_revocations_backend`, `copyright_beneficiary_mappings_backend`, `copyright_royalty_batches_backend`, `copyright_royalty_corrections_backend`, `copyright_royalty_entries_backend`, `copyright_royalty_reconciliations_backend`, `finance_accounts_backend`, `finance_adjustment_requests_auditor`, `finance_adjustment_requests_backend`, `finance_audit_auditor`, `finance_audit_backend`, `finance_audit_reconciler`, `finance_events_auditor`, `finance_events_backend`, `finance_events_reconciler`, `finance_reconciliation_runs_app`, `finance_reconciliation_runs_auditor`, `payout_allocations_auditor`, `payout_allocations_backend`, `payout_backend`, `payout_operations_backend`, `payout_requests_auditor`, `payout_settlement_proofs_backend`, `royalty_allocations_auditor`, `royalty_allocations_backend`, … (+15)

### Functions

- Both: 0 — —
- Supabase only: 23 — `audit_row_change`, `audit_sanitize`, `can_access_takedown_release`, `can_create_takedown_request`, `commit_royalty_upload`, `complete_payout`, `delete_release_with_refund`, `enforce_registered_label_release_artist`, `enforce_registered_label_track_artist`, `enforce_release_distribution_service`, `enforce_takedown_request_required_fields`, `get_dashboard_role_stats`, `get_soundpub_label_id`, `guard_profile_sensitive_update`, `handle_new_user`, `is_soundpub_artist_for_release`, `is_soundpub_takedown_user`, `is_superadmin`, `rebuild_royalty_balances`, `record_auth_audit`, `request_payout`, `reverse_royalty_upload`, `update_payout_status`
- Backend only: 55 — `canonical_release_track_guard`, `claim_partner_oauth_state`, `cleanup_partner_oauth_replays`, `copyright_beneficiary_mapping_overlap_guard`, `copyright_contract_guard`, `copyright_draft_child_guard`, `copyright_payment_guard`, `copyright_registration_file_guard`, `copyright_registration_freeze_files`, `copyright_registration_guard`, `copyright_registration_payment_append_only`, `copyright_royalty_batch_finance_intact`, `copyright_royalty_batch_guard`, `copyright_royalty_correction_guard`, `copyright_royalty_correction_intact`, `copyright_royalty_entry_write_window_guard`, `copyright_royalty_finance_event_guard`, `copyright_royalty_reconciliation_guard`, `copyright_royalty_reconciliation_intact`, `custom_payout_allocation_guard`, `finance_adjustment_request_guard`, `finance_adjustments_intact`, `finance_guard_event`, `finance_immutable`, `finance_manual_adjustment_event_guard`, … (+30)

### Triggers

- Both: 0 — —
- Supabase only: 6 — `enforce_registered_label_release_artist`, `enforce_registered_label_track_artist`, `enforce_release_distribution_service`, `enforce_takedown_request_required_fields`, `guard_profile_sensitive_update`, `on_auth_user_created`
- Backend only: 77 — `copyright_beneficiary_mapping_revocations_immutable`, `copyright_beneficiary_mappings_immutable`, `copyright_beneficiary_mappings_overlap_guard`, `copyright_contracts_guard`, `copyright_files_draft_guard`, `copyright_files_guard`, `copyright_files_immutable`, `copyright_history_immutable`, `copyright_payments_guard`, `copyright_registration_freeze_files`, `copyright_registration_mock_invoices_immutable`, `copyright_registration_payment_receipts_immutable`, `copyright_registrations_guard`, `copyright_royalty_batch_integrity`, `copyright_royalty_batches_immutable`, `copyright_royalty_correction_integrity`, `copyright_royalty_corrections_immutable`, `copyright_royalty_entries_immutable`, `copyright_royalty_entry_write_window`, `copyright_royalty_finance_event_integrity`, `copyright_royalty_reconciliation_evidence_guard`, `copyright_royalty_reconciliations_immutable`, `copyright_works_draft_guard`, `custom_payout_allocation_guard`, `finance_accounts_immutable`, … (+52)

## Dynamic or unresolved SQL

| Signal | Supabase | Backend |
|---|---:|---:|
| DO block or EXECUTE format | 8 | 12 |
| ALTER DEFAULT PRIVILEGES | 0 | 3 |
| Transaction-control tokens | 16 | 1 |
| psql meta commands | 0 | 0 |

Dynamic ACL/trigger generation, function bodies, RLS expressions, defaults, constraints, and final object state remain unresolved by static text comparison.

## Interpretation

- Supabase migration files use mixed 8-digit and 14-digit prefixes with duplicate day prefixes; filesystem order is not a durable ledger.
- Backend migrations use contiguous four-digit versions with runner-enforced unique filenames and checksums.
- Name overlap does not prove definition equivalence, and name absence does not prove behavioral absence because function bodies, policies, and grants may be created dynamically.
- Existing `docs/migration/CANONICAL_SCHEMA.sql` and `docs/migration/DATABASE_OBJECT_MANIFEST.md` remain the authoritative inspected schema snapshot for object counts; this report does not replace them.


## Gates after the backup key arrives

1. Read-only verifier completed on 2026-11-24: `Verified 24 files`, exit code 0.
2. Decrypt only the schema artifact to an explicit output outside the repository and OneDrive. Completed 2026-11-24.
3. Produce a schema-only metadata view and compare it against `CANONICAL_SCHEMA.sql`, `supabase/migrations`, and `backend/migrations`. Preliminary backup-to-canonical statement evidence is in `docs/audit/17-definition-schema-diff.md`; final backend parity remains open.
4. Use isolated PostgreSQL only if SQL execution is required for definition-level or data-level verification.
5. Do not treat this static report as approval for restore, migration replay, or cutover.
