# Schema drift report

Date: 2026-10-27 (Asia/Bangkok). Database/source-only workstream; overall Phase 1 remains BLOCKED. Live schema metadata collected read-only through the designated SSH/Compose path. Repository branch main, commit 48222ffb9c9e60da82d224e1e8aaccd4dd597442. No production SQL changes or historical migration replay occurred.

## Findings and gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Live object inventory | PASS | 33 tables, 426 columns, 56 functions, 51 definers, 78 policies, 47 triggers, 101 indexes, 109 constraints |
| Sanitized canonical DDL | PASS with explicit transformations | Schema-only live pg_dump; two embedded identity constants parameterized |
| Application DDL creation | PASS with prerequisites | Fresh local PostgreSQL 17.6, roles and minimal auth contracts |
| Production-equivalent blank restore | BLOCKED | Real auth functions/schema and external signup trigger, identity settings, host role memberships, data/behavior and QA not reproduced |
| Migration provenance | BLOCKED | No live supabase_migrations.schema_migrations ledger |
| Security | BLOCKED | rate_limits exposure, user_roles INSERT predicate, anon definer access |
| Historical chain validity | NOT PROVEN | No blind replay; static hazards and ambiguous versions documented |

## Repository sources compared

30 SQL files under supabase/migrations and 52 top-level SQL runbooks under docs/soundpub-local-migration were inventoried with SHA-256. Generated types and public/exports/full-schema.sql were inspected separately. The local files include four pre-existing untracked 20261023 migrations; source state was not changed. The old public export targets public, while current live schema is lowercase soundpub. Types declare Soundpub and public, with no soundpub key: regenerate from the approved live baseline after remediation.

## Live-only and repository-only objects

Within the two migration/runbook directories, no CREATE TABLE provenance was found for: `copyright_registrations`, `copyright_contracts`, `auth_events`, `copyright_registration_files`, `copyright_registration_payments`, `copyright_registration_works`, `rate_limits`. All 33 live tables are included in the canonical artifact. No table CREATE name found by the static scan is absent live. This is a name-level comparison, not proof that the old chain builds equivalent tables.

Repository-only functions confirmed by name: get_company_profile_id and sync_profile_balance_from_royalties. The alternate mixed-case unquoted auto_assign_new_user_to_Soundpub_label folds to the live lowercase name and is not a separate missing object. Historical function overloads, commented SQL and conditional DDL require care; the table below uses lexical body comparison, not a SQL parser or a proof of migration application.

## Function provenance and definition comparison

Comparison uses CREATE FUNCTION name and dollar-quoted body, ignoring line comments/whitespace; signature, grants and search_path must still be compared against canonical DDL. 'Different' means no candidate body equals live under that normalization. 'No candidate' means no recognized CREATE in the scanned directories, not absence from every repository export. Names and candidate matches are evidence, never a substitute for a migration ledger.

| Live function | Body comparison | Matching source or candidate files |
| --- | --- | --- |
| admin_review_copyright_registration | NO CANDIDATE | — |
| admin_update_copyright_contract | NO CANDIDATE | — |
| audit_row_change | MATCH | 20260907_comprehensive_audit_logging.sql |
| audit_sanitize | MATCH | 20260907_comprehensive_audit_logging.sql |
| auto_assign_artist_role | DIFFERENT | 39-auto-assign-new-users-to-soundpub-label-alt.sql<br>39-auto-assign-new-users-to-soundpub-label.sql<br>43-create-trigger-as-supabase-admin.sql<br>44-create-trigger-direct-as-admin.sql |
| auto_assign_new_user_to_soundpub_label | DIFFERENT | 39-auto-assign-new-users-to-soundpub-label-alt.sql<br>39-auto-assign-new-users-to-soundpub-label.sql<br>43-create-trigger-as-supabase-admin.sql<br>44-create-trigger-direct-as-admin.sql |
| can_access_takedown_release | MATCH | 20260902_expand_takedown_to_labels.sql |
| can_create_takedown_request | MATCH | 20260902_expand_takedown_to_labels.sql |
| check_rate_limit | NO CANDIDATE | — |
| cleanup_expired_tokens | NO CANDIDATE | — |
| cleanup_rate_limits | NO CANDIDATE | — |
| commit_royalty_upload | MATCH | 20261023055703_royalty_artist_history_guard.sql |
| complete_payout | MATCH | 20260904_label_aggregate_payouts.sql |
| current_user_can_view_royalty | DIFFERENT | 17-role-aware-royalty-rpcs.sql |
| delete_release_with_refund | MATCH | 20261023041039_harden_royalty_financial_workflows.sql |
| enforce_registered_label_release_artist | MATCH | 20260909_require_registered_label_artists_for_releases.sql |
| enforce_registered_label_track_artist | MATCH | 20260909_require_registered_label_artists_for_releases.sql |
| enforce_release_distribution_service | MATCH | 20260909_add_release_distribution_service.sql |
| enforce_takedown_request_required_fields | MATCH | 20260909_require_takedown_other_reason_and_contact.sql |
| generate_composer_code | NO CANDIDATE | — |
| generate_copyright_contract_number | NO CANDIDATE | — |
| generate_managed_artist_email | DIFFERENT | 22-managed-artist-label-support.sql |
| get_artist_profile_summary | DIFFERENT | 31-artist-profile-summary-rpc.sql |
| get_dashboard_role_stats | MATCH | 20260904_label_aggregate_payouts.sql |
| get_my_composer_royalties | NO CANDIDATE | — |
| get_royalty_artist_breakdown | DIFFERENT | 05-royalty-dashboard-rpcs.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_comparison | DIFFERENT | 05-royalty-dashboard-rpcs.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_country_summary | DIFFERENT | 05-royalty-dashboard-rpcs.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_label_breakdown | DIFFERENT | 05-royalty-dashboard-rpcs.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_monthly_summary | DIFFERENT | 04-runtime-permissions-and-rpc.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_period_summary | DIFFERENT | 05-royalty-dashboard-rpcs.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_periods | DIFFERENT | 05-royalty-dashboard-rpcs.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_platform_summary | DIFFERENT | 04-runtime-permissions-and-rpc.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_stats | DIFFERENT | 04-runtime-permissions-and-rpc.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_top_performers | DIFFERENT | 05-royalty-dashboard-rpcs.sql<br>17-role-aware-royalty-rpcs.sql |
| get_royalty_track_breakdown | DIFFERENT | 05-royalty-dashboard-rpcs.sql<br>17-role-aware-royalty-rpcs.sql |
| get_soundpub_label_id | MATCH | 20260901_create_takedown_feature.sql |
| get_user_full_name | DIFFERENT | 01-reset-and-recreate-soundpub.sql |
| guard_profile_sensitive_update | MATCH | 20261023041039_harden_royalty_financial_workflows.sql |
| handle_new_user | MATCH | 20260910_assign_artist_role_on_soundpub_signup.sql |
| has_role | DIFFERENT | 01-reset-and-recreate-soundpub.sql |
| is_admin | DIFFERENT | 01-reset-and-recreate-soundpub.sql |
| is_managed_artist_email | DIFFERENT | 22-managed-artist-label-support.sql |
| is_soundpub_artist_for_release | MATCH | 20260909_add_release_distribution_service.sql |
| is_soundpub_takedown_user | MATCH | 20260901_create_takedown_feature.sql |
| is_superadmin | DIFFERENT | 20260907_harden_user_role_management.sql |
| rebuild_royalty_balances | MATCH | 20261023041039_harden_royalty_financial_workflows.sql |
| record_auth_audit | MATCH | 20260907_comprehensive_audit_logging.sql |
| repair_orphan_artist_link | DIFFERENT | 36-repair-orphan-artist-links-rpc.sql |
| request_payout | MATCH | 20261023041039_harden_royalty_financial_workflows.sql |
| reverse_royalty_upload | MATCH | 20261023041039_harden_royalty_financial_workflows.sql |
| scan_orphan_artist_links | DIFFERENT | 32-scan-orphan-artist-links-rpc.sql |
| sync_managed_artist_markers | DIFFERENT | 22-managed-artist-label-support.sql |
| update_balance_on_payout_status_change | DIFFERENT | 01-reset-and-recreate-soundpub.sql |
| update_payout_status | MATCH | 20261023041039_harden_royalty_financial_workflows.sql |
| update_timestamp | MATCH | 01-reset-and-recreate-soundpub.sql |

The live commit_royalty_upload body matches 20261023055703_royalty_artist_history_guard.sql; earlier three bodies differ as expected for superseded versions. Live payout/refund/rebuild/guard function bodies match the hardening migration where indicated. This establishes deployed definition correspondence, not an application timestamp, complete migration execution, or all data-fix outcomes. Four untracked migrations cannot be marked unapplied merely because they are untracked.

## Duplicate ordering prefixes

supabase/migrations:

| Prefix | Files |
| --- | --- |


Historical runbooks:

| Prefix | Files |
| --- | --- |
| 26 | 26-comprehensive-backend-investigation.sql<br>26-investigate-kaditrudit-balance.sql |
| 30 | 30-alternative-distribute-admin-fee.sql<br>30-artist-profile-label-rls.sql<br>30-implement-admin-fee-distribution.sql |
| 31 | 31-artist-profile-summary-rpc.sql<br>31-auto-sync-profile-balance-trigger-supabase.sql<br>31-auto-sync-profile-balance-trigger.sql |
| 39 | 39-auto-assign-new-users-to-soundpub-label-alt.sql<br>39-auto-assign-new-users-to-soundpub-label.sql |

Eight-digit repeated prefixes cannot uniquely identify migration versions. Filesystem ordering is not a durable migration history. The four newer fourteen-digit prefixes are unique within this scan.

## Unsafe or unverified historical SQL

- 00-HARDRESET-SOUNDPUB-LOCAL.sql and 01-reset-and-recreate-soundpub.sql contain DROP SCHEMA ... CASCADE. They must never run against production or serve as an automatic baseline.
- 14-reset-all-profile-balances.sql, balance rebuild/repair scripts, 27-fix-kaditrudit-balance.sql and 20260907_reconcile_kaditrudit_payout_balance.sql are data operations tied to historical state; generic replay may change financial balances.
- 30-implement-admin-fee-distribution.sql contains direct auth creation and a fixed credential literal. No literal was copied into artifacts. This is not acceptable generic schema initialization.
- 39 alternate scripts and 43/44 trigger recipes are competing operational approaches, not a single ordered chain. 45/46 ownership recipes are environment-specific privilege operations.
- Historical storage bucket/policy SQL is broader than the audited intended privacy model. It belongs to shared storage ownership reconciliation, not automatic application schema replay.
- Do not classify function-local TRUNCATE of temporary working tables in royalty code as production-table destruction without inspecting its scope.
- No historical migration has been certified syntactically/execution-valid through full replay. The original audit's historical financial concerns remain behavior-test requirements; current owner-only complete_payout and service-only import/reversal ACLs are independently verified.

## Canonical reproduction and deterministic baseline policy

Canonical artifact SHA-256: 2658C45C2377DD834BB5709FC5BEE42B17CFF1D098F96753216F0F66C863E7D3.

Use this inspected schema as an apply-once baseline for an empty soundpub namespace in an isolated target. Preserve historical files. A future migration runner must record a unique full-width version plus SHA-256, timestamp and status, reject changed applied checksums, serialize application, and run each change transactionally with failure rollback. Do not mark the baseline applied on an existing environment merely because table names exist: compare every definition first. Repeated application is intentionally an error; no DROP or IF NOT EXISTS masking of incompatible definitions. No runner/history table was added under this documentation-only assignment.

The local test created five no-login role stubs and auth.users(id uuid primary key), auth.uid(), auth.role(). These are DDL prerequisites only, not production auth replacements. psql -X -v ON_ERROR_STOP=1 --single-transaction created the entire canonical soundpub schema successfully. Restored counts matched live 33 tables / 56 functions / 51 definers / 78 policies / 101 indexes / 47 triggers / 109 constraints. Round-trip dump non-comment lines matched as a sorted multiset after privacy substitutions and policy role order normalization. Role OIDs differ across clusters, so one policy serialized authenticated,anon in reverse order with identical semantics. No unexplained line differences remained.

Runnable local verification, after loading canonical SQL into an isolated PostgreSQL target with the stated prerequisites:

```sql
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_tables WHERE schemaname='soundpub') = 33;
  ASSERT (SELECT count(*) FROM pg_proc WHERE pronamespace='soundpub'::regnamespace) = 56;
  ASSERT (SELECT count(*) FROM pg_proc WHERE pronamespace='soundpub'::regnamespace AND prosecdef) = 51;
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='soundpub') = 78;
  ASSERT (SELECT count(*) FROM pg_indexes WHERE schemaname='soundpub') = 101;
  ASSERT (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='soundpub'::regnamespace AND NOT t.tgisinternal) = 47;
  ASSERT (SELECT count(*) FROM pg_constraint WHERE connamespace='soundpub'::regnamespace) = 109;
END $$;
```

This is schema creation evidence only. It does not establish backup restoration, row/FK data integrity, exact financial equality, runtime function dependency closure or independent QA. Object bodies and ACLs remain available for independent review in the canonical SQL.

## Required actions before a production-equivalent PASS

1. Security agent must remediate and regression-test role INSERT authorization, rate_limits, definer grants and search_path without breaking legitimate behavior.
2. Auth owner must supply genuine auth schema/function prerequisites and reconcile the external on_auth_user_created trigger on the shared host; preserve other applications.
3. Privately resolve the two original identity constants to explicit approved target settings; verify business semantics of both distinct references. Settings are intentionally absent from this repository.
4. Adopt an approved version/checksum ledger and independently validate baseline plus future migrations in isolated target. Verify effective role memberships as well as ACL strings.
5. QA must repeat schema comparison and exercise RPC authorization, financial flows, data constraints and runtime extension dependencies. Full backend reproducibility remains BLOCKED until those checks pass.

## Checksums of compared migration sources

| File | SHA-256 |
| --- | --- |
| docs/soundpub-local-migration/20260816_rebuild_royalty_balances.sql | D5FD36CC9C2AE81AB2566539BAA0C8961C77FE75F202A670EAB359EF5A866736 |
| docs/soundpub-local-migration/20260816_repair_royalty_allocations.sql | 8B91082F949BE65D858091B9617A718A569B8E65A6968A0861985FEB1FD6A903 |
| docs/soundpub-local-migration/20260816_skip_utero_users_in_soundpub_auth_trigger.sql | B5FD70F73712EFCB37A786E34F9E9C368113CB0822119DA2008DE690D57584B3 |
| docs/soundpub-local-migration/20260817_harden_soundpub_auth_events_and_role_functions.sql | F288C581089A005D03AB7F9A6EA6B0ECE99CA53BD29BED482A424A266D86ECC7 |
| docs/soundpub-local-migration/20260901_create_takedown_feature.sql | 95869A68D6DC20836086505DF6DB291090699127D1890678C00BB511379F0192 |
| docs/soundpub-local-migration/20260901_set_null_release_creator_on_user_delete.sql | 3429A6B7EBBB6CAFA0B8E27A781270AD7A36B678CDE8BB732D39FBD1C619EE51 |
| docs/soundpub-local-migration/20260901_set_null_release_profile_refs_on_user_delete.sql | 8C95A4F0147ECEB943BDB76F881E6841FFB2196ECDB5D8F512A5C29FB340C185 |
| docs/soundpub-local-migration/20260901_set_null_remaining_nullable_profile_refs.sql | EACDDD92ADF9B13C8CB8DF5AC7328A7A2FCA914D64F42BE3A3ADF492693B1A19 |
| docs/soundpub-local-migration/20260902_expand_takedown_to_labels.sql | 9EE83E670F447949F86670FCA3F05C8B9F1BEF3677EE667F161C285B570F79EC |
| docs/soundpub-local-migration/20260904_add_takedown_contact_fields.sql | 286759D68F9CEEE7BC137EED960F8E45FA867B15828A97A21E61C43035CEDAA0 |
| docs/soundpub-local-migration/20260904_label_aggregate_payouts.sql | 059846E5CBCD62EDE0D444E5FD911678675C89BB6B7E32C24101DC3F35E35D47 |
| docs/soundpub-local-migration/20260904_payout_reserve_and_proof.sql | DC38E4AD99EA4A368C6B8F2E45DB4425BD0FF6900B543E0D8806545DC8108E88 |
| docs/soundpub-local-migration/20260906_release_invoice_pdfs.sql | C5A0488633D2F123BAE0EC207529D7EA43BADD0ADA7F919AE1679235B71C2E76 |
| docs/soundpub-local-migration/20260907_allow_compilation_release_type.sql | 55942B2B1A94F299F815452B82C934BBA9ACB785117AF7328186B5E93BEC7F0F |
| docs/soundpub-local-migration/20260907_comprehensive_audit_logging.sql | 7A2E4063E00A74D303CF58402B68C2DE347AEBB3798EFCE854860B0C7C57B9E0 |
| docs/soundpub-local-migration/20260907_harden_user_role_management.sql | DE4FF128C4DFC0EBE1F61D8975AD209B60D949CBDB8FB5C679322587EE571265 |
| docs/soundpub-local-migration/20260907_reconcile_kaditrudit_payout_balance.sql | BDA12B4CEBD23AB4350ABEB61CBD7D75B9D5A3DC13DEF800FC3BCF2E95F67E9B |
| docs/soundpub-local-migration/20260907_restrict_payouts_to_labels.sql | E74790577E48122EC0BBBDBAA57D1FBCB527A8E53DAA32FB222EAA8685521F01 |
| docs/soundpub-local-migration/20260909_add_copyright_payment_invoice_fields.sql | 9944437BF86A3A8CE165F4CB5470390919EAC6D67169365C3922BB3AC5F5F0F6 |
| docs/soundpub-local-migration/20260909_add_release_distribution_service.sql | 9013BFEC2D67DC30314EA581E5231DAECD5ADAE8F5CCD09A14FFE04060ED6840 |
| docs/soundpub-local-migration/20260909_add_revision_submitted_release_status.sql | E43CF92C33874839CC88324AFD802A258D78B30209FF0F69C7BB9F4ACDB2C256 |
| docs/soundpub-local-migration/20260909_add_soundpub_label_custom_release_price.sql | CD1F12A0B94772C296D64D68C0CA82D2A55C5B26179BC292B27FAFC848E6E60B |
| docs/soundpub-local-migration/20260909_require_registered_label_artists_for_releases.sql | D7690E878BCA97E576CAE3C65842EA77CFAB53C9FD80F765D29FD566182B9635 |
| docs/soundpub-local-migration/20260909_require_takedown_other_reason_and_contact.sql | 2A9A85B391FFCDD7AC0557677D492F25927CBEA1C8A43CBC7B7A841BE4F39DBD |
| docs/soundpub-local-migration/20260909_set_soundpub_custom_release_price.sql | 31970E6DCD39B2CF3BAADDFE61454EDA6DE69067B05EBB15A56141A45D0A9D3A |
| docs/soundpub-local-migration/20260910_assign_artist_role_on_soundpub_signup.sql | BEB3F8AB5A9B102CADB9818088D0EE4025611DB860DD0809524F3122D5810A91 |
| docs/soundpub-local-migration/20261023041039_harden_royalty_financial_workflows.sql | C12BB8F7F7E8DD20BB71B76061FC4674A1B7F894B6D8053338FAD087B384434D |
| docs/soundpub-local-migration/20261023053436_secure_royalty_period_imports_and_recipient_mapping.sql | 6F1A242F0DB272F560C5618A808615E17D1B262BA3AEA60CEBB45E5CA5701F87 |
| docs/soundpub-local-migration/20261023055419_royalty_import_integrity_hotfix.sql | 690D8677AF94929E2A70A35077F45F6FDA7CFC6CD2211DC2CB2FB507601F56C8 |
| docs/soundpub-local-migration/20261023055703_royalty_artist_history_guard.sql | 692369E5D981D221B8BFA2D1414B0F93FBA14D098B26A5375A3D093DC1F4D842 |
| docs/soundpub-local-migration/00-HARDRESET-SOUNDPUB-LOCAL.sql | D9EC9E00534B1D4EE9E3315F9C5073B9ECC8DB6ACF953443E0C3D7E54516DA2B |
| docs/soundpub-local-migration/01-reset-and-recreate-soundpub.sql | 73418FA8690B659F3E44E4F16AAB399CF9D77852CDFC4E1C9A6EEE571348B0C4 |
| docs/soundpub-local-migration/02-initial-seed.sql | D140030D9744D7E3B791A3721001AC5ADA4960C906DB1FF7E51614598CFB6CAB |
| docs/soundpub-local-migration/03-align-schema-to-csv.sql | 75F0DBAA5808F1717A48703BD9BF0A907FD7C983033EADE7D7A7690AC3D0F5BF |
| docs/soundpub-local-migration/04-runtime-permissions-and-rpc.sql | BCEBD4916E15E05323AA5699B085798E74D4F0975A396AFE28C551D209562010 |
| docs/soundpub-local-migration/05-royalty-dashboard-rpcs.sql | 08142934890CF1AE0DC481110CA73D5A68651B425B723632F1B59E45DFCD69E1 |
| docs/soundpub-local-migration/06-allow-draft-upc-isrc-empty.sql | 9389A4CE3D336C546295166F7F621DDEA7C9DDA9D08EF63D44083507C09D8119 |
| docs/soundpub-local-migration/07-release-status-and-nullable-identifiers.sql | 9C4D15B89B695EF816339FFC198451390419C7ED80DB2CB45DA98D540526ABDC |
| docs/soundpub-local-migration/08-user-profile-role-support.sql | 82A767EE3695EE4A2EE3F39391A36D1FB6D9D08E240F68383AC13C9DEE808C1F |
| docs/soundpub-local-migration/09-storage-buckets-and-policies.sql | 2619F0B4F394DE0A59EE4A74E94410A9A47BBEA8CB3C69BC8E35143018B731E3 |
| docs/soundpub-local-migration/10-reconcile-user-roles-from-csv.sql | 7D6E30845570A1BD279FB8F7B6CE1D7FEAB067D71E85CD3B6FCBC1AEE300C342 |
| docs/soundpub-local-migration/11-signup-default-artist-under-soundpub.sql | 95D2B160BD62E35480FCBAF9C422A468A36A9F99E91C3F8145B19EAE9A4AB7E7 |
| docs/soundpub-local-migration/12-add-missing-royalties-columns.sql | F081DE0C49BD0A20FAC1022386AED42B28D129E8A5A4359BCB2F3DB5AE9394E1 |
| docs/soundpub-local-migration/13-recalculate-royalty-balances.sql | 361F79A0015A31C79F1D943C1B6075DB653D2E5D87790B8E2B0D25EA6D9412D5 |
| docs/soundpub-local-migration/14-reset-all-profile-balances.sql | 3C938E8C201B6A94636DE210520761FCF922F8E7224683540332FA70399F957E |
| docs/soundpub-local-migration/15-scan-orphan-artist-data.sql | F4BA63F40E78671DDE08EB9A86A8125406F924555CCF3CFAC8CCD4B528FA7A68 |
| docs/soundpub-local-migration/16-normalize-soundpub-split-and-recalculate.sql | 1BB66E599A42A9CD035ACD44889F2CDA54F9A3E549F0CE52739814BF572BABDE |
| docs/soundpub-local-migration/17-role-aware-royalty-rpcs.sql | E4A98B337C4088BE8EE84C48FA88FB46A12DF9A97EE998DABB33399D3A1458F8 |
| docs/soundpub-local-migration/18-repair-artist-role-links.sql | BF27F6C5C95E106A885088301863CEE9D190CFD2BF4AEDA2DBBC8D432DB47096 |
| docs/soundpub-local-migration/19-backfill-artist-share.sql | 63A314CD2DC70451B436F10AB5E5EA3CB59B6D599AAA4E53BA40BEAC204F51E8 |
| docs/soundpub-local-migration/20-fix-auth-trigger-fk-safe.sql | 2CE4FC8364FA8CE204F398FAE07AFAA0226B63472C4D32B500A47497BA5831ED |
| docs/soundpub-local-migration/21-verify-user-roles.sql | 25A66DEC9CAF50343DC52F78FEA3DD258A607FD647E8162C6AC5358B261307EF |
| docs/soundpub-local-migration/22-managed-artist-label-support.sql | 81454152BFACE15009B599A77C9093A38518AECAD538A7666F37F24C24F93269 |
| docs/soundpub-local-migration/23-verify-balance-revenue-per-role.sql | 6380AEF115CCDD496FBCECD545BED1E1A086F12CA842F3FE552D60D56D07FD7D |
| docs/soundpub-local-migration/24-verify-dashboard-role-values.sql | 48DF3D4FBE346305C677CCBA7786FF83FF315093CF5D3A31D0FC7ED02EF18B02 |
| docs/soundpub-local-migration/25-rebuild-all-profile-balances.sql | 09648C6916D8026E728035CA3090A9848001E2C44BFB177636423E124FB33C28 |
| docs/soundpub-local-migration/26-comprehensive-backend-investigation.sql | 5DE91001940942A4386B9729203F412D5EE21B293FABB1306E1BDED4EAC3A7C5 |
| docs/soundpub-local-migration/26-investigate-kaditrudit-balance.sql | B5CDC5C77F93423DB00C3FA22D9DC911C88B1ECF3A859CFC819FBDF7AEC36B9B |
| docs/soundpub-local-migration/27-fix-kaditrudit-balance.sql | D46B51ADF5FC0C5C199613BD0A63797E1CC8C7917960617BE9F73AAA2025CAB8 |
| docs/soundpub-local-migration/28-dashboard-role-stats-rpc.sql | 4F4E29B9C8EFBA995EE3A41F961A6D36C27ECC6CAD0ACCFDC4D7A246FA4B5ACC |
| docs/soundpub-local-migration/29-artist-profile-ui-columns.sql | 34D4A77F5864F6F3E13422C60D7B97BC9B00E336AE91E7807364677B180A2D86 |
| docs/soundpub-local-migration/30-alternative-distribute-admin-fee.sql | A4902166C02CF19C76FA9EF12B4299E6731938D870DAE55EE03BC95EE8618CCB |
| docs/soundpub-local-migration/30-artist-profile-label-rls.sql | 7D5A9138E6515DE35FF4FA7BEB8B41F9D7C2D3622D096A79695A75E78CB91674 |
| docs/soundpub-local-migration/30-implement-admin-fee-distribution.sql | 419BCFABD79BC93009FECCA2DA2C0135B2ACA7BE0BA8C96AF41B4751B8240EDC |
| docs/soundpub-local-migration/31-artist-profile-summary-rpc.sql | BFFD5D3FBA5F0EB43A54A8D820FF024ADF97226974B7D5F108D00C483E99BF0A |
| docs/soundpub-local-migration/31-auto-sync-profile-balance-trigger-supabase.sql | CA422757B0DEC103C316F762E16D021CFA9724F02F7CB1CB86784672AEBC5F65 |
| docs/soundpub-local-migration/31-auto-sync-profile-balance-trigger.sql | E5AB4A8460E98FE9635B688D58C2FAAAD6A5951C5BDACB29100D221F80EA1E18 |
| docs/soundpub-local-migration/32-scan-orphan-artist-links-rpc.sql | 84BCC38C0EF4F23936D21AE3B71F9BB0E1BCCB42CDD80C48C409489958D11713 |
| docs/soundpub-local-migration/34-artist-label-transfer-policy.sql | 3963FD4FC4967D66BE9C09E58695D56615BF6A572DDE123AB672996389B3C9AA |
| docs/soundpub-local-migration/35-artist-deletion-requests-table.sql | CE81955E179D392C0822E65EEEA02B29F3328382F1A4C5C78E60CEFC0F4F9146 |
| docs/soundpub-local-migration/36-repair-orphan-artist-links-rpc.sql | 945E4C337F21FF5199AB3B7FB6B624AA91F886A0DC0E5893E5387B62D885C933 |
| docs/soundpub-local-migration/37-fix-google-oauth-soundpub-label.sql | DEC00DF02A8E8A2B046789DED3C17BCD591D1583CC0F6490EB80EA79C8B0BD89 |
| docs/soundpub-local-migration/38-check-publishersoundpub-user.sql | 5EAF15A7A2EE35C83E8D8E9E3A9BE78E09FD7A62212720F3F81A6E92B4324452 |
| docs/soundpub-local-migration/39-auto-assign-new-users-to-soundpub-label-alt.sql | 3A5855E5F442F3E0D30C1459E99CF9AEC39482F68AEFD638EE185A652182B570 |
| docs/soundpub-local-migration/39-auto-assign-new-users-to-soundpub-label.sql | 947260C30FB08EECB2EA09DC61460151A6466B1AF65623B74DC519629964D230 |
| docs/soundpub-local-migration/40-migrate-artists-to-correct-soundpub-label.sql | CBE730E578CC1B774F52B04F6A03733DC0073A56F65EC632CE0980FD96DF8804 |
| docs/soundpub-local-migration/41-check-schema-permissions.sql | 65A3A1C1E61203E41DE50E5BA8B743B6FF98F499BF1188319E8CEFF88258A5E2 |
| docs/soundpub-local-migration/42-grant-create-permission-soundpub.sql | 08DE8FE6F280B26A553402D7FE7345592A284BF470B0470C3268BF6B8AE81C8A |
| docs/soundpub-local-migration/43-create-trigger-as-supabase-admin.sql | 06E0F7D0173EA473E822909F5B12A105D28925CB13BF3096CB16FEA4A7EE2BD1 |
| docs/soundpub-local-migration/44-create-trigger-direct-as-admin.sql | 154AB400A0D7CD62AB35A9CC27CDED043E1F14D06592B9F6F28F90930B5CCE09 |
| docs/soundpub-local-migration/45-fix-schema-ownership.sql | BF3406277ED2883DA153B41D64A256722B52575E446828F6D91502D80149C67E |
| docs/soundpub-local-migration/46-fix-schema-ownership-comprehensive.sql | E8F8F7C6292AF437B4EFA7F9F8EA847BA13A13323116F3849D3FBA83A98A610B |


## Post-baseline live remediation (2026-10-27)

After the initial read-only inventory, production applied `supabase/migrations/20261026202235_harden_database_security_boundaries.sql` manually because no migration ledger exists. It changes no object counts or data rows: authenticated clients retain `user_roles` SELECT but lose INSERT/UPDATE/DELETE; role policy adds admin/self/target hierarchy checks; `rate_limits` RLS is enabled; anon/authenticated limiter table/function access is revoked; service-role access retained. Corrected isolated and production assertions passed. `CANONICAL_SCHEMA.sql` was updated for these policy/RLS/ACL changes. The private full DB archive predates remediation and must replay this migration after restore.
## Phase 1B addendum — 2026-10-27

No unexplained differences remained inside the 949-record normalized Soundpub application-catalog fingerprint across two fresh runs and live. This narrows application-DDL drift only; platform/auth/storage/ledger/security gaps remain explicit failures. See `DATABASE_REPRODUCIBILITY_REPORT.md`.
