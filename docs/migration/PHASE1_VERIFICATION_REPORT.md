# Phase 1 independent verification report

Status: **BLOCKED**. Phase 2: **NOT READY**.

Initial observation: 2026-10-27, approximately 03:08–03:15 Asia/Bangkok. Repository: main, commit `48222ffb9c9e60da82d224e1e8aaccd4dd597442`. Post-remediation findings below supersede initial restore ACL, role/rate-limit, and direct-origin create-user findings. Existing working changes preserved. Only this document authored by QA.

## Scope and evidence

Read the complete Phase 1 request, root AGENTS.md, and `.agents/skills/supabase/SKILL.md`. Independently queried live infrastructure over SSH `maskhar@20.20.20.3`, working from `/data/supabase/instances/supabase-01/config`. Production: `supabase-db/postgres`; restore: `soundpub-phase1-restore/soundpub_restore`. PostgreSQL 17.6 on both.

Database inspections used catalog queries and aggregate counts; inspection transactions were READ ONLY. No data rows, user identifiers, secret values, file contents, or financial amounts are reproduced. Other agents' documents were not accepted as proof. Initial incorrectly cased schema probe failed; corrected catalog discovery established actual schema `soundpub`, then all relevant checks reran successfully.

No coordination/agent-status tool was available to the initial QA session. A final project-wide freeze remains **BLOCKED**. Initial observations are historical; subsequent scoped deployment checks are recorded separately below.

## Critical results

1. **PASS after correction — restore access controls.** The original QA restore used `--no-privileges`, omitting schema/table grants. Its permission failures were a restore-invocation artifact, not evidence the backup could not preserve ACLs. Later restoration with ACLs passed exact object and row comparisons.
2. **PASS after correction — restored function ACL parity.** The initial 36 live versus 51 restored anonymously executable definers reflected omitted privileges during that restore. The later ACL-preserving restore supersedes this false mismatch. Correct restoration of existing permissions does not establish that deployed definer authorization is safe.
3. **PASS after remediation — live user_roles/rate_limits subset.** Production assertions pass: both tables have RLS; anon/authenticated role DML and limiter table/RPC access are denied; role SELECT and required service-role privileges remain. Initial anonymous limiter visibility is historical and resolved by this migration.
4. **FAIL — contracts private-by-default gate.** Bucket public=true in live and restore. There are currently zero storage metadata objects in that bucket; actual document disclosure was not demonstrated.
5. **FAIL/BLOCKED — privileged endpoint security.** Anonymous empty-object requests reach validation/error/success responses on nine privileged endpoints, rather than producing 401/403. Successful unauthorized business actions were deliberately not attempted; full exploitability remains BLOCKED.
6. **FAIL — runtime/source reconciliation incomplete.** 14 of 34 repository function entrypoints differ from deployment; three additional immediate remote entrypoints exist.
7. **FAIL/BLOCKED — SECURITY DEFINER gate.** Two definer functions have no proconfig/search_path; 34 definer functions retain anon EXECUTE live. Body-by-body authorization and all role matrices were not independently completed; anonymous execution alone is not proof each function is exploitable.

## Restore isolation

**PASS, limited scope:** Docker inspection shows restore network `none`, no published ports (`{}`), healthy state. Queries ran through docker exec. Production and restore containers remain distinct. External providers were not attached to restore.

**BLOCKED:** this independently verifies an existing full-backup restore, not creation of a blank database from the canonical migration mechanism. No fresh restore or canonical replay was performed by QA.

## Row counts

Exact aggregate counts matched across all 33 Soundpub tables. These were sequential READ COMMITTED observations, not one shared consistent snapshot; matching counts do not prove row contents or monetary equality.

| Soundpub table | Live | Restore | Count comparison |
| --- | ---: | ---: | --- |
| app_settings | 20 | 20 | PASS |
| archived_royalties | 0 | 0 | PASS |
| artist_deletion_requests | 0 | 0 | PASS |
| artist_profiles | 81 | 81 | PASS |
| artists | 132 | 132 | PASS |
| audit_logs | 18307 | 18307 | PASS |
| auth_events | 0 | 0 | PASS |
| balance_adjustments | 33 | 33 | PASS |
| composer_royalties | 0 | 0 | PASS |
| copyright_contracts | 0 | 0 | PASS |
| copyright_registration_files | 10 | 10 | PASS |
| copyright_registration_payments | 2 | 2 | PASS |
| copyright_registration_works | 4 | 4 | PASS |
| copyright_registrations | 4 | 4 | PASS |
| email_send_log | 169 | 169 | PASS |
| notifications | 41 | 41 | PASS |
| payout_balance_reservations | 5 | 5 | PASS |
| payout_requests | 3 | 3 | PASS |
| profiles | 182 | 182 | PASS |
| rate_limits | 2 | 2 | PASS |
| release_payments | 9 | 9 | PASS |
| releases | 292 | 292 | PASS |
| royalties | 14474 | 14474 | PASS |
| royalty_uploads | 10 | 10 | PASS |
| storage_backup_log | 0 | 0 | PASS |
| storage_backup_runs | 2 | 2 | PASS |
| takedown_request_documents | 0 | 0 | PASS |
| takedown_request_items | 24 | 24 | PASS |
| takedown_request_targets | 3 | 3 | PASS |
| takedown_requests | 3 | 3 | PASS |
| takedown_status_history | 0 | 0 | PASS |
| tracks | 431 | 431 | PASS |
| user_roles | 182 | 182 | PASS |

All inspected auth/storage table counts also matched, including auth.users 211, auth.identities 214, storage.buckets 25, storage.objects 2299. These are shared-host aggregate counts, not Soundpub ownership counts. Their inclusion in backup does not authorize migrating every shared identity/object.

## Objects and foreign keys

| Check | Live | Restore | Result |
| --- | ---: | ---: | --- |
| Soundpub tables | 33 | 33 | PASS |
| Indexes | 101 | 101 | PASS |
| Functions | 56 | 56 | PASS |
| SECURITY DEFINER functions | 51 | 51 | PASS count only |
| Policies | 78 | 78 | PASS definition comparison |
| Non-internal triggers | 47 | 47 | PASS |
| Constraints | 109 | 109 | PASS count only |
| Foreign keys | 43 | 43 | PASS definitions/validation/orphans |
| Enums | 4 | 4 | PASS count only |
| Invalid/unready indexes | 0 | 0 | PASS |
| Definer functions without proconfig | 2 | 2 | FAIL security review |
| Anonymous executable definers, initial pre-remediation run | 36 | 51 | Historical `--no-privileges` artifact; superseded by ACL-preserving restore |

All 43 FK definitions matched and convalidated=true. Independently generated anti-join checks from conkey/confkey found zero non-null child references missing parents for every FK in both databases. All discovered FKs were single-column, covered by those checks. This tests actual restored data, beyond merely trusting validation flags. No ALTER VALIDATE or write tests executed.

Ordered definition fingerprints matched:

| Category | Live and restore MD5 |
| --- | --- |
| Columns including types/nullability/defaults | 4efc34f75f8b2623637569957d67d9b5 |
| pg_get_functiondef | 09df1ffe7eac988c0deaf0862c75e8d7 |
| Index definitions | dd48e5f9ed1714b2dcaf897d3cf40373 |
| Non-internal trigger definitions | ec20e77d7a06512955b8fc1a3af20736 |
| Policy roles/commands/USING/WITH CHECK | 7dc3c786d333cbb229eeb1d099d0ea15 |

MD5 here is an accidental-difference fingerprint, not backup authenticity evidence. Function definition fingerprints exclude ACLs. Default ACL query returned no Soundpub-specific entries in either database. Enum labels, every non-FK constraint definition, owners and role attributes were not independently exhaustively compared: **BLOCKED**.

Post-remediation user_roles policy requires is_admin in USING and WITH CHECK, forbids self-targeted changes and non-superadmin changes to superadmin targets or assignments. Direct anon/authenticated DML is revoked. Scoped isolated tests and production read-only privilege assertions passed; broader definer-mediated role mutation coverage remains **BLOCKED**. Anonymous and claimless authenticated read tests do not cover every signed-in role.

Live release_payments INSERT policy checks user_id=auth.uid() without a paid-status restriction. Copyright payment INSERT policy checks ownership and selected amount/emeterai fields but does not itself forbid a forged paid status. Exploitability through triggers/other restrictions and financial consequences remain **BLOCKED**; do not certify payment integrity from these policies alone.

## Endpoint probes

Public URL: `https://supabase.carubra.com/functions/v1/`. No Authorization or apikey header. POST body `{}`; no recipients, user IDs, payment requests, or real credentials supplied. Response bodies were discarded to prevent data leakage.

| Endpoint | HTTP | QA outcome |
| --- | ---: | --- |
| send-app-email | 400 | FAIL denial gate; action exploitability BLOCKED |
| backup-storage-to-drive | 200 | FAIL denial gate; side effects not proven absent |
| create-user | 400 | FAIL denial gate; action exploitability BLOCKED |
| delete-user | 500 | FAIL denial/error handling gate |
| update-user-role | 400 | FAIL denial gate; action exploitability BLOCKED |
| update-user-status | 400 | FAIL denial gate; action exploitability BLOCKED |
| update-user-password | 400 | FAIL denial gate; action exploitability BLOCKED |
| start-user-impersonation | 400 | FAIL denial gate; action exploitability BLOCKED |
| update-app-settings | 400 | FAIL denial gate; action exploitability BLOCKED |
| create-xendit-invoice | 401 | PASS anonymous negative probe only |
| create-copyright-invoice | 401 | PASS anonymous negative probe only |

**QA execution limitation:** the backup endpoint was probed before reviewing its handler. Source review then showed an unconditional attempted storage_backup_runs INSERT and possible Drive work, so this request was not guaranteed read-only. No further action probes were made. Follow-up live counts remained storage_backup_runs=2 and storage_backup_log=0, matching initial observations; no additional Soundpub backup-log row was observed. These counts cannot establish that no other schema or external-provider side effect occurred. No compensating cleanup was attempted. Therefore strict no-production/no-backup-change verification is **BLOCKED**, and this report does not claim absolute absence of side effects.

The table above records initial public-hostname probes, not current direct-origin behavior. Broader positive authorized endpoint and regression coverage remains **BLOCKED**; scoped create-user results follow below. No real email or payment request intentionally submitted.

## Post-remediation QA

### Production database subset — PASS

Only `user_roles` and `rate_limits` changes from `20261026202235_harden_database_security_boundaries.sql` were applied. Contracts configuration was excluded. Independently piped the current local `scripts/database_security_assertions.sql` over SSH from the Docker config directory into `supabase-db/postgres`; BEGIN READ ONLY, DO and ROLLBACK succeeded. No `.env` file was sourced or modified.

- Both tables have RLS enabled. user_roles has three policies; rate_limits has zero policies. The role-management policy contains the intended actor, self-target, assignment and existing-target protections.
- anon/authenticated retain user_roles SELECT but lack table and column write privileges. They lack limiter table access and EXECUTE on both check_rate_limit and cleanup_rate_limits. Actual read-only SELECT probes against rate_limits failed with insufficient privilege for both roles.
- service_role retains each individual SELECT/INSERT/UPDATE/DELETE privilege on both tables and EXECUTE on both limiter functions. Actual SELECTs succeeded; no mutative production RPC or DML was executed by independent QA.
- Production object counts remain 33 Soundpub tables, 56 functions and 78 policies, matching the initial inventory.

Assertions now normalize `auth.uid()`/`uid()` rendering and check each required service privilege separately, correcting the earlier search_path false failure and any-of privilege test weakness.

### create-user deployment — scoped origin PASS; public routing BLOCKED

Only create-user was uploaded via scp and the functions service recreated. Independent local, remote source and running-container SHA-256 values match: `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f`. The mounted `_shared/cors.ts` is readable inside the running container. Runtime was running with zero restarts; start time was `2026-10-26T20:33:39.666108887Z`.

| Direct origin test: http://127.0.0.1:8000/functions/v1/create-user | HTTP | Evidence |
| --- | ---: | --- |
| Anonymous POST {} without Authorization, with or without apikey | 401 | Independently reproduced |
| Ordinary user | 403 | Main-agent production probe reported |
| Admin requesting superadmin creation | 403 | Main-agent production probe reported; independent mock also passed |
| Label supplying another parent | 403 | Main-agent production probe reported; independent ownership mock also passed |
| Authorized caller with invalid payload | 400 | Main-agent production probe reported; no successful creation requested |

Independent mocks additionally passed inactive/suspended caller denial, failed profile lookup denial, superadmin hierarchy, managed-label creation and label-parent ownership. Signed-in production probe results above are attributed to the main agent and are not misrepresented as independently replayed. No privileged positive production writes were performed by independent QA.

The public URL `https://supabase.carubra.com/functions/v1/create-user` repeatedly returned 400 with `{"success":false,"error":"Failed to create user"}`, both with Content-Type alone and with Content-Type plus apikey; Authorization was absent and the body was {}. ANON_KEY was parsed as text from the Docker-directory `.env`, without source, held in memory and never printed. Omitting apikey does not explain the discrepancy. Server-originated public-hostname probes separately received Cloudflare 403 / error 1010.

Origin create-user dispatch-log count stayed at 10 across an independent public probe, then increased to 11 after a direct port-8000 probe returning 401. The public probe was not observed reaching this Edge container; the exact upstream destination remains unconfirmed. Public-hostname routing remains **BLOCKED**, rather than evidence that the deployed origin handler lacks its 401 guard.

Before/after anonymous-probe counts stayed unchanged: auth.users 211, profiles 182, user_roles 182, artist_profiles 81 and artists 132. No account-creation side effects were observed; aggregate counts cannot establish absence of every possible side effect. No files, secrets or production data were changed by these QA checks.

### Remaining gates

Contracts remains public and unchanged; its privacy gate remains **FAIL/BLOCKED**. C1 privileged email/backup remediation and verification remain **BLOCKED**; deploying create-user alone does not resolve C1. The broader SECURITY DEFINER authorization audit remains **BLOCKED**. None of the scoped passes constitutes overall Phase 1 or Phase 2 approval.

## Source drift

Recomputed SHA-256 from local files and the actual mounted remote source directory `/data/supabase/instances/supabase-01/config/volumes/functions`, independently of inventory documents. Docker mount confirmed destination `/home/deno/functions`.

Repository immediate function entrypoints: 34. Identical: 20. Drifted: 14. Repo-only: 0. Remote-only immediate entrypoints: 3 (`hello`, `auth-email-hook`, `main`). Main is runtime routing infrastructure, not necessarily a business function. Two additional nested .backup-xendit- index.ts files were observed and excluded from immediate-entrypoint totals; reachability not established.

Drifted: create-copyright-invoice, create-user, create-xendit-invoice, delete-user, download-release-invoice, send-app-email, send-password-reset, send-royalty-notification, start-user-impersonation, update-app-settings, update-user-role, verify-email, verify-password-reset-token, xendit-webhook.

Comparison performed near end of QA, after initial DB checks. **BLOCKED:** cannot certify this happened after all other agents finished; rerun once coordinator establishes completion/freeze. Current repository contains pre-existing modifications and untracked migrations; no commit or deployment performed by QA.

## Backup verification

Remote backup directory: `/data/supabase/instances/supabase-01/config/phase1-backups/20261026T200848Z`.

Independently executed sha256sum -c SHA256SUMS and sha256sum -c RESTORE_SHA256SUMS. All listed entries passed: postgres.full.dump, postgres.globals.sql.gz, restore-object-comparison.txt, restore.stdout.log, restore.stderr.log. Empty restore stdout/stderr logs are supporting evidence only; direct DB checks above determine result.

Observed database dump 5,413,635 bytes and storage tar 1,395,957,760 bytes. The checked checksum output did not cover storage tar. Globals stderr log exists and was not inspected because it may expose shared-host role details. Globals restoration, backup role-attribute completeness, encryption, off-host copy and access permissions: **BLOCKED**.

Database restore with ACLs: **PASS for the later exact object/row comparison and preserved access controls**. The initial `--no-privileges` invocation caused the apparent grant/function ACL mismatch; that finding is withdrawn. This later result is recorded from follow-up restore evidence, not a fresh exact replay performed during the post-deployment read-only checks. Canonical blank replay, complete shared-host role recovery and the other recovery requirements below remain separate gates.

Storage object-byte checksum, archive integrity, restored object-byte comparison, readability, signed URL behavior and restored privacy tests: **BLOCKED**. Metadata counts do not establish object-byte recovery. Auth ownership and storage ownership manifests were not independently reconstructed: **BLOCKED**.

## Mandatory gates and readiness

Updated scoped QA score: **25/100**, computed as 20 equally weighted mandatory gates, 5 points each, PASS-only credit. Initial score was 15/100; rate_limits security and the corrected database restore add two passes. This is an independently defined evidence score, not directly comparable with the original 38/100 audit scoring method. Mandatory blockers still prevent approval.

| Mandatory gate | QA result |
| --- | --- |
| Canonical schema generated | PASS artifact exists; semantic reproduction unverified |
| Schema reproducibility | BLOCKED blank canonical replay not tested |
| Database object inventory | PASS scoped independent metadata checks above |
| Edge Function drift mapped | PASS independent entrypoint checksums |
| Critical deployment drift resolved or blocked | BLOCKED unresolved 14 drifted entrypoints |
| Privileged endpoint security | BLOCKED C1 and public routing; create-user origin scoped PASS |
| Role escalation security | Scoped user_roles/create-user PASS; broader definer paths BLOCKED |
| rate_limits security | PASS production assertions and read denials |
| contracts privacy | FAIL |
| SECURITY DEFINER audit | FAIL/BLOCKED |
| Soundpub auth ownership manifest | BLOCKED |
| Soundpub storage ownership manifest | BLOCKED |
| Database backup | BLOCKED full recovery semantics/roles |
| Database restore | PASS later ACL-preserving exact object/row comparison |
| Storage backup | PASS scoped 598-object archive/checksum; external/ownership recovery BLOCKED |
| Storage restore | PASS scoped 598/598 byte restore; API/privacy/external restore BLOCKED |
| Financial integrity baseline | BLOCKED independent exact financial reconciliation not run |
| Compatibility matrix complete | BLOCKED independent coverage not tested |
| Test strategy complete | BLOCKED independent execution coverage absent |
| QA independent verification | FAIL mandatory failures remain |

Initial anonymous rate_limits visibility is remediated and independently verified. Public contracts configuration, C1 privileged email/backup security, public routing and the wider definer review still prevent readiness; no exhaustive remaining CRITICAL count is claimed.

## Required next actions

1. Preserve the successful ACL-preserving restore evidence and original backup; separately complete canonical blank replay and shared-host role-recovery coverage. Do not repeat the initial `--no-privileges` mistake when testing access-control parity.
2. Resolve public-hostname routing, contracts privacy and C1 email/backup authorization with compatibility evidence; QA reruns scoped positive, negative, ownership and regression cases. Keep the passed role/rate_limits subset distinct from these remaining blockers.
3. Establish all agents' completion, then repeat live catalogs, entrypoint SHA-256 comparisons and safe security checks. Avoid backup/action POST probes without prior handler proof of read-only rejection.
4. Independently test canonical blank replay, storage bytes/privacy, ownership boundaries, exact financial invariants, all required application/auth roles and backup role completeness.
5. Coordinator must keep Phase 1 BLOCKED and Phase 2 NOT READY until all mandatory gates pass; no score override can compensate for failures.


## Coordinator validation (after independent review)

- `npm run build`: PASS (3,319 modules transformed; chunk-size warning only).
- `node scripts/phase1-edge-security.test.cjs`: PASS mock positive/negative/ownership/status checks; real authorized account creation deliberately not tested.
- `node scripts/process-royalty-upload.test.cjs`: PASS existing adversarial regression checks; observed expected 400 and 500 mock responses.
- `npm run lint`: FAIL with 294 errors and 46 warnings across the pre-existing codebase. Lint failure is not limited to Phase 1 changes; unrelated lint fixes were not attempted.
- `git diff --check`: PASS; generated canonical and manifest remain untracked, and `.gitignore` now explicitly re-includes `docs/migration/STORAGE_MANIFEST.csv`.
## Independent storage QA addendum

A separate independent agent completed the scoped archive restore after this report's initial snapshot: **PASS**, exact 598 archive members, 9,950,688,219 bytes, zero extra paths, and 598/598 source/restored SHA-256 matches. Extracted copy was removed safely; archive/manifests preserved. STORAGE_BACKUP_VERIFICATION.md contains evidence. Mandatory storage ownership/privacy/external-byte and off-host recovery gates remain BLOCKED; Phase 2 remains NOT READY.

Final cleanup: isolated restore container removed after successful scoped drills. Production functions remain healthy; private archives and manifests retained. No Phase 2 deployment or production route change occurred.
