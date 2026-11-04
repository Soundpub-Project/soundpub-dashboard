# Phase 1B Independent Adversarial QA

## Findings first

**BLOCKED. Independent QA: FAIL. Phase 2: NOT READY.** Observed 2026-10-27, Asia/Bangkok, with contracts/deployed-source recheck at **05:08:44 ICT / 2026-10-26 22:08:44 UTC**. Findings describe observed deployed state, not approval of concurrent, undeployed edits. PASS requires independently demonstrated behavior; UNKNOWN never supplies gate credit. **Three tracked unresolved CRITICAL groups:** reported credential incident, requested public routing, and deployed privileged handlers. The subsequently mitigated public=true contracts configuration is excluded from that count; incomplete contracts workflow remains HIGH.

### Q01 — CRITICAL — Credential exposure requires coordinated rotation and incident response

The **routing agent reported** that a rendered Envoy configuration excerpt exposed server secret-key/service-role token values in tool output. QA observed that written admission in `PUBLIC_ROUTING_REPORT.md`, section “Secret-output incident,” which also says rotation was not performed by that agent. Its inspected report SHA-256 is `dc8c1627def542e0bb0311c49c4234e3522715c83eadea7dfe36a2115bf21147`. This is agent-reported incident evidence, not user confirmation or independent retrieval of the original secret-bearing output.

**Mandatory remaining blocker:** coordinated rotation of affected credentials and all dependent credentials implicated by their signing/derivation relationships; incident scope assessment; restricted handling/removal of exposed transcript material where supported; verification that old credentials are rejected and legitimate dependent services still work. No completion evidence was available to this QA snapshot. Determine whether signing material was exposed before deciding JWT/session invalidation scope; do not assume rotating one displayed token addresses every affected credential.

This finding relies on the routing agent's written report, not retrieval or repetition of the reported exposed values. No credentials are included here. No rotation or production configuration change was attempted by QA. **Incident-response closure: FAIL; effectiveness of any subsequent rotation: UNKNOWN.**

### Q02 — CRITICAL — Requested public create-user route still fails authentication-denial gate

Independent workstation POSTs of `{}` without Authorization to `https://supabase.carubra.com/functions/v1/create-user` returned **400**, `{"success":false,"error":"Failed to create user"}`, `Server: cloudflare`, `via: 1.1 kong/3.9.1`, and `cf-cache-status: DYNAMIC`. DNS A answers were `104.21.5.212` and `172.67.133.219`; these are edge addresses, not proven origins.

The different hostname `https://supabase.carubra.space/functions/v1/create-user` returned **401**, zero body bytes, and an Envoy upstream-time header. Direct `http://127.0.0.1:8000/functions/v1/create-user` over SSH also returned **401**. Independently selected connector management metadata showed version **3**, ingress `supabase.carubra.space` to `http://supabase-envoy:8000`, and fallback `http_status:404`. Mounted Envoy cluster metadata points to `functions:9000`. This corroborates the routing agent's hostname distinction without reading rendered secret-bearing configuration.

The downloaded live dashboard JavaScript references **`https://supabase.carubra.space`**. Thus `.com` remains an explicit requested gate and a separate unresolved route; these observations do not establish that the current dashboard uses `.com`. The actual `.com` upstream/source and its ownership remain UNKNOWN. HTTP 400 does **not** prove successful anonymous account creation; it fails the required 401/403 authentication boundary and does not identify the executing source. Server-originated `.com` probes received 403, unlike workstation probes; those edge denials do not supersede the workstation result.

Mounted and repository `create-user/index.ts` SHA-256 matched `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f`. Positive role operations were not performed against production. **Requested public gate: FAIL. Origin/.space anonymous-denial subset: PASS. Complete role matrix: UNKNOWN.**

### Q03 — CRITICAL — Deployed privileged email and backup handlers still lack caller authorization

Live functions environment metadata showed **`VERIFY_JWT=false`**. Mounted `send-app-email/index.ts:224–233` creates a service-role client and parses input without authenticating the caller. Anonymous `{}` POSTs reached `Unknown template: undefined`, HTTP **400**, both through `.com` and direct origin. This is validation rejection, not authorization rejection. No recipients or valid templates were submitted.

Mounted `backup-storage-to-drive/index.ts:121–133` reaches a service-role `storage_backup_runs` INSERT before caller authentication. QA sent only **OPTIONS** to that live endpoint; HTTP 200 preflight is not itself a vulnerability or proof of authorization. A network-disabled mock of the then-current matching repository handler independently demonstrated **one anonymous run INSERT attempt**, zero network calls, and HTTP 200 after missing-provider handling. No live backup POST was sent.

At the 05:00:15 ICT recheck, mounted hashes remained:

| Mounted handler | SHA-256 |
| --- | --- |
| `send-app-email/index.ts` | `bc51345a1021ec8856c0b8f50fb53a6cb059b83513429c849d50c7d9409ee1ab` |
| `backup-storage-to-drive/index.ts` | `6bbfbf3091ada52201dfabb5cec5e502e919b8ec017e1c17cbe79e43ddf07130` |

Concurrent local edits now add `_shared/privileged-api.ts`, authorization and rate limiting. They differ from these deployed hashes and do not close live gates. Trusted email/service-role callers, scheduler payload compatibility, malformed/expired credentials, replay policy and rate-limit behavior still require execution against the intended deployment. **Email authorization: FAIL. Backup authorization: FAIL. Trusted workflow compatibility: UNKNOWN.**

### Q04 — HIGH — Public contracts configuration mitigated; full privacy workflow still incomplete

At the initial QA snapshot, including 05:03:47 ICT, independent reads returned **`storage.buckets['contracts'].public=true`**, **0 storage objects**, **0 copyright contract rows**, and **0 contracts-specific storage policies**. The coordinator subsequently reported changing the private flag under an atomic zero-object/zero-row precondition. QA independently rechecked at **05:08:44 ICT**: **public=false, 0 objects, 0 contract rows, 0 contracts-specific policies**. The earlier public=true configuration finding is therefore **mitigated**, not a remaining CRITICAL. QA verified the resulting catalog state, not the coordinator's change transaction itself. No document disclosure was attempted or observed.

Read-only review of the coordinator's proposed `20261026215612_make_contracts_private.sql` found the intended private flag, owner access through registration ID in the second path segment, admin upload/update/delete, and service-role management. Current frontend edits store `stamped/<registration-id>/<file>` instead of a permanent public URL and request **300-second signed URLs** in both review and owner dashboard. The reviewed upload path agrees with the SQL path predicate. Focused frontend lint had zero errors, with one existing hook-dependency warning.

Owner/admin policies and frontend release remain staged. The private flag mitigates anonymous public-download configuration, but does not prove legitimate access or the full policy matrix. Test anonymous/other-owner denial, owner/admin/reviewer access, upload/upsert, expired/tampered signatures, and future-upload inheritance after deployment. Preview HTML, draft PDF and generated PDF still follow their existing URL-opening path in the review UI; their origin/access classes and PDF-generation service authorization were not established. Do not extend the stamped-document signed-download result to all legal-document flows. The frontend bucket override must also agree with the bucket protected by SQL. **Private-by-default flag: PASS. Full contracts privacy: FAIL. Proposed policy/runtime matrix: UNKNOWN.**

### Q05 — HIGH — Anonymous SECURITY DEFINER access demonstrably returns protected data

Live metadata: **56 functions, 51 SECURITY DEFINER, all 51 owned by postgres; 34 definers effectively executable by anon; 2 without fixed search_path**. Counts were unchanged on final recheck. Both `anon` and `authenticated` lack CREATE on `soundpub` and `public`; missing search_path is not claimed as a demonstrated injection exploit.

After checking that the two tested bodies only read data, QA executed a transaction with **READ ONLY, role anon and `auth.uid() IS NULL`**:

- `SELECT count(*) FROM soundpub.scan_orphan_artist_links()` returned **36**. Its SQL body has no actor check and returns profile/name/label/business columns. Only count was transferred; no returned identities were inspected or published.
- `soundpub.get_user_full_name(<server-held existing profile ID>) IS NOT NULL` returned **true**. The body selects a profile name for the supplied ID without a caller/ownership check. The ID stayed inside the transaction and no name was returned to QA output.

This disproves the claim that broad EXECUTE is harmless solely because underlying tables have RLS. It establishes database-role access, not independent proof of every HTTP RPC route. `cleanup_expired_tokens` remains PUBLIC-derived anon executable, without an actor check or fixed search_path; its profile UPDATE body was inspected but never executed. `cleanup_rate_limits` also lacks fixed search_path, but client EXECUTE is already revoked. `record_auth_audit` does reject NULL auth.uid(); its anon grant alone does not prove anonymous mutation. Authenticated arbitrary action/target semantics still need review. Trigger-returning functions are not ordinary callable RPCs.

The subsequently produced `SECURITY_DEFINER_AUDIT.md` supplies a complete per-signature inventory and body-review workstream. QA inspected its results and independently executed its read-only catalog assertions: exit **3**, with five failures for missing fixed paths, ungated scan, ungated token cleanup, anonymous name lookup, and missing active Copyright RPCs. **SECURITY DEFINER gate: FAIL.** Review documentation now exists; remediation and independent full behavioral sign-off do not. This QA does not certify all 51 bodies.

### Q06 — HIGH — Private storage read policy ignores owner and application membership

Live policy `SoundPub authenticated read private buckets` has SELECT USING only `bucket_id = ANY ('release-covers','track-audio','track-video')`; it has no UID, owner, release relation or Soundpub membership predicate. In READ ONLY with role `authenticated` and **NULL auth.uid()**, a count-only SELECT could see **543 objects** in those buckets. No signed user identity was fabricated and no bytes/object names were read. This is a database policy test, not a real-user Storage API matrix.

Consequently, private bucket configuration alone does not establish tenant isolation or owner-scoped signed-URL issuance. **Storage isolation: FAIL. Authorization matrix: FAIL for this unexpected read.**

### Q07 — HIGH — Canonical database cannot yet demonstrate full deterministic reproduction

Production still has **no `supabase_migrations.schema_migrations` relation**. `CANONICAL_SCHEMA.sql` SHA-256 was `786688db5d38b717fa3d3b33860d03c67438a09ca7cd11bc1adfde8d4e8776e8`. Its own prerequisites require external roles, auth.users/auth.uid/auth.role, and private identity settings. Its header explicitly excludes the external auth signup trigger. QA independently confirmed production has `on_auth_user_created AFTER INSERT ON auth.users ... soundpub.handle_new_user()`.

The subsequently produced `DATABASE_REPRODUCIBILITY_REPORT.md` reports two fresh application-DDL runs with **949** matching normalized catalog records and fingerprint **`d64856ee63d5743a9e559b07b8dc7fc2d93849c1a7f4d7de05d80938d47ace4c`**. QA independently executed the supplied read-only catalog query against production and obtained that same **949-record fingerprint**. Those blank runs belong to Agent D and were not rerun by this read-only QA. Both the report and inspected canonical inputs still omit full auth/storage integration, approved settings/seeds and a migration ledger mechanism. Application-only DDL creation with auth stubs cannot certify those capabilities. The repository also still lacked `_shared/cors.ts` during this review; the newly added `_shared/privileged-api.ts` is a different helper.

**Database reproducible gate: FAIL for the supplied complete process. Application-only two-run determinism: reported PASS by Agent D; independent QA blank replay: UNKNOWN. Live fingerprint match: PASS.** No database/container was created, restored or modified by this read-only QA.

### Q08 — HIGH — Auth ownership and identity/session migration remain unresolved

Independent counts reconfirmed **211 auth users, 182 Soundpub profiles, 29 users without a Soundpub profile, 214 identities**. A server-side scan of every UUID-typed Soundpub column found **57 audit_logs.target_id reference observations**, involving **19 distinct no-profile users**. These may be historical/shared/untrusted audit targets; they do not prove those users currently own business data. They do mean “no profile” alone is not proof of complete application irrelevance. QA also independently followed declared foreign keys to auth.users outside auth/soundpub/storage: **8 current Soundpub-linked identities and all 29 no-profile identities have other-application links**. These are demonstrably shared identity boundaries, not merely hypothetical overlap. Separately, **434 shared-host storage objects** have owner metadata pointing to no-profile users; application ownership of those objects remains unclassified.

Mounted `sso-login` still checks expiration only when numeric, checks azp only when present, has no `payload.aud` or `email_verified` enforcement, and looks up an existing account by email. These are source observations; no real identity-provider token was submitted. Verified issuer+subject binding, Google linking/verified-email conflicts, redirect allowlists, password hash migration feasibility, server refresh/revocation/logout behavior and suspended/inactive access matrix remain UNKNOWN. No hashes, sessions or identity values were exported.

**Auth ownership: FAIL. Auth migration feasibility and complete session matrix: UNKNOWN.**

### Q09 — HIGH — External recovery and complete object ownership cannot pass

QA parsed the full 1,510-observation `STORAGE_MANIFEST.csv` (SHA-256 `70d7a067296b7f10461f6eb69b4db659dab4ada7f60fcd76edf45e60a177a0df`). All **1,510 content_checksum cells are `NOT_COMPUTED`**. This does not invalidate the separate scoped archive's byte evidence; it means the canonical object manifest has not integrated that evidence.

| Manifest external provider | Reference observations | Distinct bucket/key hash pairs | Distinct referenced record hashes | Content hashes recorded |
| --- | ---: | ---: | ---: | ---: |
| Google Cloud Storage | 278 | 278 | 169 | 0 |
| Legacy Supabase Cloud | 120 | 120 | 118 | 0 |

GCS references include **111 audio and 167 clip** references; legacy Cloud includes **18 audio, 55 clip, 45 cover and 2 avatar** references. These are manifest identities/reference observations, not proof of distinct physical content or complete provider identity. Records may overlap across providers; do not add the record counts as unique affected records. Ownership and bytes are not certified by a URL/key hash.

A broader live URL-shaped scan found 278 GCS and **128** Cloud storage references. The additional **8** Cloud references are `profiles.logo_url_dark` / `profiles.logo_url_light` (**4 each**), outside the curated 120-reference breakdown. QA independently matched **2 additional local branding objects, 435,430 metadata bytes**, and counted **1 app_settings row containing a GCS reference**. `STORAGE_OWNERSHIP_REPORT.md` independently reports the expanded current scope as **600 local objects and 407 GCS/Cloud candidates**, with anonymous external HEAD failures and a further historical-only retention scope. QA corroborated the added branding/settings aggregates, not every external HEAD or complete expanded object set. Their business relevance, intentional external status and byte recovery need explicit classification; no raw URL or profile ID was output. This is a coverage issue, not proof that a failed anonymous request means a file is absent.

**Storage ownership: FAIL. Required external-byte recovery: FAIL for the presented evidence.** Exact inaccessible-object/business severity dispositions and complete reference-to-object invariants remain unproved. No provider bytes were fetched by QA.

### Q10 — HIGH — On-host backup checks do not establish off-host disaster recovery or application restore

QA independently found private on-host archives with mode **0600**: database before-image **5,413,635 bytes**, current-state dump **5,413,336 bytes**, role globals **1,843 bytes**, storage tar **9,953,083,392 bytes**. `sha256sum --check SHA256SUMS` passed **2/2** and `POST_REMEDIATION_SHA256SUMS` passed **1/1**. A full read of the storage tar independently produced SHA-256 **`0c5f0d18f465dcecd6d7d3ac80ed29cb7229d8e26d4bf28a5c30e05f7c6868b1`**, matching historical evidence, with exactly **598 regular members, 9,950,688,219 file bytes and zero nonregular members**. No extraction or fresh per-object source/restore comparison occurred. These are on the same host as production. Permissions are not encryption; a matching adjacent checksum is not immutable provenance. The newly identified local logos remain outside this archive.

The existing isolated `soundpub-phase1b-agentf-20261027` container was independently observed as `postgres:17-alpine`, network **none**, no published ports. Existence/isolation alone does not demonstrate its restore provenance or application reads. Historical scoped restore reports were reviewed, but no full application stack, auth/login/provider-safe smoke suite, off-host encrypted object, protected retention or restore originating from an off-host copy was independently demonstrated in this snapshot.

**Off-host encrypted DB backup: UNKNOWN. Off-host encrypted storage backup: UNKNOWN. Restore from off-host: UNKNOWN. Full application restore: UNKNOWN.** These mandatory gates block readiness. Do not reinterpret historical 598-object on-host restoration as a PASS for these broader gates.

### Q11 — HIGH — Financial arithmetic passes, but authenticity/provenance and recovery fail sign-off

Count-only, exact NUMERIC reconciliation independently returned:

| Check | Result |
| --- | ---: |
| Current royalty rows | 14,474 |
| Profile balance / artist allocation / label allocation mismatches | 0 / 0 / 0 |
| Active/paid payout reservation mismatches | 0 |
| Royalty net-versus-components mismatches | 0 |
| Royalties without source row number | 14,474 |
| Successful uploads with inconsistent inserted_records | 10 |
| migration_opening_balance adjustments | 33 |
| Paid release payments without invoice number / PDF path | 2 / 2 |
| Legacy double-decrement trigger attachments | 0 |

The initial batch ended in an error when an exploratory ownership query assumed a nonexistent `artists.user_id`. Preceding read results above completed; connection closure rolled back the read-only transaction. Ownership testing was corrected using column metadata and rerun separately. No failed query result supplies a PASS.

Live authenticated INSERT grants and RLS policies still allow release-payment insertion based on `user_id=auth.uid()` and copyright-payment insertion based on owner/registration/pricing fields, **without forcing provider-controlled paid status**. Catalog trigger inspection found audit/timestamp triggers, not a payment-status authenticity guard. No forged payment was inserted. Current totals do not disprove earlier double decrement because opening adjustments preserve an already chosen starting balance. No provider/bank reconciliation or exact per-primary-key source/restore financial comparison was performed.

**Measured current arithmetic subset: PASS. Financial integrity mandatory gate: FAIL. Historical settlement correctness: UNKNOWN.**

### Q12 — HIGH — Xendit retry leaves parent state unrepaired after partial commit

Mounted `xendit-webhook/index.ts` raw SHA-256 is `bbf24972b3fd321cfd35adae65a4dc6da1e81c505111e84681b9dab70efd9014`; repository raw SHA-256 is `686778c57773ccb69b36165c31a6367fbe538f2726a3d3d4f7cd1b8e389ff60d`. Both normalize to **`570ed74d5384907b9ad718cda8422badeb16ab22763af5c57e3da51ef4ec4d4b`** after BOM/CRLF normalization. Thus the tested source matches mounted text; resident worker identity at the unrelated `.com` origin remains UNKNOWN.

QA independently executed sanitized, network-disabled fixtures against the actual handler source. For **both release and copyright flows**, injecting parent-update failure after the payment update produced **500, 200 duplicate, 200 duplicate, 200 duplicate**. Payment was written once; parent update was attempted once; parent remained unrepaired. A separate fixture omitted amount and currency and still reached paid state, consistent with `amountsMatch` accepting absent amount. No production callback or real provider request was sent.

The source does fail closed on absent/mismatched configured callback token, and the inspected runtime has a callback token configured. Those positives do not repair transaction/retry safety. **Xendit idempotency/recovery gate: FAIL. Provider reconciliation and complete concurrent/out-of-order matrix: UNKNOWN.** Runnable replay evidence appears below.

### Q13 — HIGH — Secret/public-build gate fails despite useful staged removals

Independent unauthenticated production GETs returned genuine assets, not SPA fallback:

| URL path on dashboard.soundpub.xyz | HTTP | Bytes | Evidence |
| --- | ---: | ---: | --- |
| `/exports/full-schema.sql` | 200 | 76,769 | CREATE TABLE/FUNCTION/SCHEMA content; SHA-256 `2a0535f6ab8cc24b2ef1a837cb49d3594b7f8f045062916dff6cf9574ed4a3d4` equals local public/dist export at inspection |
| `/test-oauth.html` | 200 | 3,450 | OAuth debug HTML, not app root; SHA-256 `0ad7f1e2ff7c476292701fbece8649d9def78aa485f3c1e837dbd208b4267a76` |
| `/cors-test.html` | 200 | 2,664 | CORS debug HTML, not app root; SHA-256 `5adfbfa41437685130dcfe8d351c9b7f9ad64839e7102132ff8107c2f0aa7210` |

Live `/assets/index-DBB0wF_R.js`: **2,195,336 bytes**, SHA-256 `3f36f0ec992ac4ca6d91b5f2f9102f380bd222dcf06cfcc7bc1492e6469fcc9b`; recognized embedded JWT roles were **anon**, not service_role. A local public/dist scan of 20 text artifacts compared three available sensitive environment values in memory and found **zero matches**; recognized JWTs were anon. This limited scan is not proof of absence of every secret in all historical/live outputs.

Subsequent read-only inspection confirmed the coordinator removed local `public/exports`, `public/test-oauth.html` and `public/cors-test.html`. The coordinator's hygiene report records preservation of legacy exports under nonpublic documentation and a clean rebuilt public-file set. No overlapping edit was made by QA. Removal is useful; it does not remove an already deployed artifact or cached response. Rebuild/deploy and independently verify these URLs no longer expose those contents, including cache behavior. The routing agent's reported credential-output incident separately blocks secret hygiene pending incident-response closure even if all browser scans are clean. **Secret/public-build hygiene: FAIL.**

### Q14 — HIGH — Full authorization/integration and typecheck acceptance remain incomplete

Existing `node scripts/phase1-edge-security.test.cjs` and `node scripts/process-royalty-upload.test.cjs` passed independently with mock Auth/DB and no production calls. `scripts/database_security_assertions.sql` passed against production in its explicit READ ONLY transaction: **BEGIN / DO / ROLLBACK**. This verifies the role-table/limiter ACL subset, not rate-limit thresholds, all definers or all application roles.

An in-memory Vite production compilation passed with **write=false**, **copyPublicDir=false**, zero emitted files, three output artifacts and 2,284,622 generated bytes. Equivalent production React/alias settings were supplied directly to avoid writing a temporary bundled Vite config. It does not test deployment or copy public assets. The worktree was changing concurrently, so this is a point-in-time compilation result.

`tsc -p tsconfig.app.json --noEmit --incremental false` failed with **six TS1005 syntax errors** at `src/integrations/supabase/types.ts:527,544,561,1583,1600,1617`; for example two field declarations are concatenated on one line. Node-config typecheck passed. Existing security-handler lint at its initial snapshot had **8 create-user, 7 webhook, 16 email and 2 backup errors**; email/backup source changed afterward, so those counts are historical, not a verdict on their new edits. Global lint debt was not treated as an independent migration blocker. Contracts frontend focused lint later passed with zero errors.

The coordinator subsequently reports **latest local build PASS and zero new scoped lint errors**, with typecheck still blocked by those baseline parse errors. QA's independent compilation and contracts lint corroborate their tested subsets; the complete latest changed-file lint run is coordinator-reported. Historical lint counts above must not be used to contradict that newer scoped result or demand unrelated cleanup.

No complete isolated real-identity matrix covers anonymous, ordinary user, artist, label, owner/other owner, admin/superadmin, inactive/suspended actors across all required CRUD/privileged resources. Existing unexpected SQL/storage reads already disprove a universal authorization PASS. **Authorization matrix: FAIL. Required application typecheck: FAIL. Full auth/restore/regression coverage: UNKNOWN.**

### Q15 — MEDIUM — Active composer royalty workflows still call absent RPCs

Independent `pg_proc` inspection found all four names absent in `soundpub`; the Phase 1 matrix separately records their absence across schemas. Active source still calls `validate_royalty_csv_row` at `CopyrightRoyaltyUpload.tsx:135`, `import_composer_royalties` at `CopyrightRoyaltyUpload.tsx:184`, `get_royalty_upload_history` at `CopyrightRoyaltyUploadHistory.tsx:63`, and `delete_royalty_upload` at `CopyrightRoyaltyUploadHistory.tsx:82`.

Classify these as **BROKEN FEATURE with active callers**, consistent with the subsequently supplied `MISSING_RPC_CLOSURE.md` and Agent D's catalog/source classification. They are not proven dead code or completed replacements. Signed-in browser execution and required business disposition remain UNKNOWN; the hyphenated Edge handler is not the underscored RPC. No function was added merely to satisfy a static call. **Classification: completed. Functional closure: FAIL.**

## Mandatory gates

| Mandatory gate | Verdict | Basis |
| --- | --- | --- |
| Readiness >=85/100 | UNKNOWN | Last coordinator baseline 53/100; no new verified final score. No substitute QA scoring rubric used. |
| CRITICAL = 0 | FAIL | Three tracked unresolved groups: reported credential incident, public routing, deployed privileged handlers. Mitigated public=true contracts configuration excluded. |
| Public create-user route | FAIL | Q02: requested `.com` returns validation failure instead of authentication denial. |
| Privileged email authorization | FAIL | Q03: deployed caller guard absent; anonymous handler validation reached. |
| Backup endpoint authorization | FAIL | Q03: deployed pre-auth run INSERT; only safe live preflight tested. |
| Contracts privacy | FAIL | Q04: live private flag now PASS; owner/admin policies, frontend rollout and real privacy matrix incomplete. |
| SECURITY DEFINER audit | FAIL | Q05: demonstrated anon SQL access and incomplete full review. |
| Database reproducible | FAIL | Q07: missing complete canonical integration/ledger process. |
| Auth ownership | FAIL | Q08: unresolved shared/unknown identities and relevance. |
| Storage ownership | FAIL | Q06/Q09: broad reads, unknown ownership and incomplete manifest integration. |
| External required bytes recovered | FAIL | Q09: unresolved external references and additional logo coverage. |
| Off-host database backup | UNKNOWN | Q10: only on-host copy/checksum independently demonstrated. |
| Off-host storage backup | UNKNOWN | Q10: off-host encryption/readability/retention unproved. |
| Restore from off-host | UNKNOWN | Q10: no independent restore from that copy. |
| Application restore | UNKNOWN | Q10/Q14: isolated DB existence is insufficient. |
| Financial integrity | FAIL | Q11: current arithmetic passes; authenticity/history/invoice gaps remain. |
| Xendit idempotency | FAIL | Q12: independently reproduced unrepaired partial commit. |
| Authorization matrix | FAIL | Q05/Q06/Q14: unexpected reads and incomplete real-identity coverage. |
| Secret/public-build hygiene | FAIL | Q01/Q13: confirmed incident unresolved; production operational assets exposed. |
| Independent QA | FAIL | Mandatory failed/unknown gates remain. |
| Coordinated credential incident closure | FAIL | Q01: user-required blocker; no completed rotation/response evidence. |

## Scope, privacy and evidence boundaries

Full Phase 1B attachment, supplied QA scope, root AGENTS.md, Supabase skill and original `SUPABASE_MIGRATION_AUDIT.md` were read. All 19 pre-existing Phase 1 artifacts were loaded completely for inventory/structured inspection, with focused manual review of the relevant SQL, narrative, grants, matrices and runtime/source conclusions. These were: `API_COMPATIBILITY_MATRIX.md`, `AUTH_MIGRATION_MATRIX.md`, `BACKUP_REPORT.md`, `BACKUP_RESTORE_REPORT.md`, `CANONICAL_SCHEMA.sql`, `CUTOVER_REQUIREMENTS.md`, `DATABASE_OBJECT_MANIFEST.md`, `EDGE_FUNCTION_MAPPING.md`, `FINANCIAL_INTEGRITY_BASELINE.md`, `PHASE1_FINAL_REPORT.md`, `PHASE1_SOURCE_BASELINE.md`, `PHASE1_VERIFICATION_REPORT.md`, `ROLLBACK_REQUIREMENTS.md`, `SCHEMA_DRIFT_REPORT.md`, `SECURITY_FINDINGS.md`, `STORAGE_AUDIT.md`, `STORAGE_BACKUP_VERIFICATION.md`, `STORAGE_MANIFEST.csv`, and `TEST_STRATEGY.md`. The concurrently produced `PUBLIC_ROUTING_REPORT.md` was also reviewed. Complete byte ingestion/static coverage is not a claim of complete behavioral validation.

Later workstream artifacts were also loaded and reviewed: `AUTH_MIGRATION_FEASIBILITY_REPORT.md`, `CONTRACTS_PRIVACY_REPORT.md`, `DATABASE_REPRODUCIBILITY_REPORT.md`, `MISSING_RPC_CLOSURE.md`, `PHASE1B_OFFHOST_RECOVERY_REPORT.md`, `PUBLIC_BUILD_SECRET_HYGIENE_REPORT.md`, `SECURITY_DEFINER_AUDIT.md`, and `STORAGE_OWNERSHIP_REPORT.md`. Their reported tests are explicitly distinguished from this QA's independent executions. Their incomplete gates do not become PASS because the reports now exist.

Live Supabase inspection used only `maskhar@20.20.20.3`, first changing to `/data/supabase/instances/supabase-01/config`. PostgreSQL queries used explicit READ ONLY transactions, aggregate/boolean outputs and metadata; financial reconciliation used REPEATABLE READ until the noted exploratory query error. Function bodies were reviewed before executing the two read-only definer checks. Docker inspection emitted selected metadata, never complete environments/rendered configuration. Secrets used for local scan comparisons stayed in memory; no credential values or personal records are included in this report.

No production writes, deployments, restarts, backups, restores, payment callbacks, emails, user creation, token fabrication, file uploads or object downloads were performed by QA. Live HTTP requests were limited to source-reviewed empty invalid create-user/email payloads, backup OPTIONS, and GET of public operational/frontend assets. Unknown-origin generic failures cannot prove absence of every possible upstream side effect; no valid business payload was submitted. Archive hashing/member inspection is read-only. Builds/tests used memory-only mocks or write-disabled compilation. **Only authored workspace file: `docs/migration/PHASE1B_INDEPENDENT_QA.md`.**

HEAD was `48222ffb9c9e60da82d224e1e8aaccd4dd597442`; the existing dirty worktree was preserved. Other agents/coordinator changed files during the audit. This report is an observation snapshot, not a frozen release certification. Recheck deployed catalogs, mounted hashes and public URLs after coordinated fixes; source edits alone cannot promote these gates.

## Runnable isolated Xendit counterexample

From repository root, execute this JavaScript through Node stdin using existing installed TypeScript. It only reads handler source, uses synthetic state, and blocks network. Assertions establish the defect; successful execution is evidence of the counterexample, not a readiness PASS.

```javascript
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/xendit-webhook/index.ts', 'utf8')
  .replace(/^import .*\r?\n/gm, '');
const script = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function reproduce(kind) {
  let handler;
  let paymentStatus = 'pending';
  let paymentWrites = 0;
  let parentAttempts = 0;
  const paymentTable = kind === 'copyright' ? 'copyright_registration_payments' : 'release_payments';
  const parentTable = kind === 'copyright' ? 'copyright_registrations' : 'releases';
  const service = { from(table) {
    let patch;
    const result = () => {
      if (table === paymentTable) {
        if (patch) {
          paymentStatus = patch.payment_status || patch.status;
          paymentWrites++;
          return { data: { id: 'fixture-payment' }, error: null };
        }
        return { data: {
          id: 'fixture-payment', registration_id: 'fixture-parent', release_id: 'fixture-parent',
          amount: 100, currency: 'IDR', status: paymentStatus, payment_status: paymentStatus,
        }, error: null };
      }
      if (table === parentTable && patch) {
        parentAttempts++;
        return { data: null, error: { message: 'injected parent failure' } };
      }
      return { data: null, error: null };
    };
    const query = {
      select() { return query; }, eq() { return query; }, neq() { return query; },
      update(value) { patch = value; return query; },
      single: async () => result(), maybeSingle: async () => result(),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return query;
  } };
  vm.runInNewContext(script, {
    createClient: () => service, Response,
    console: { log() {}, warn() {}, error() {} },
    fetch() { throw new Error('Network forbidden'); },
    Deno: { serve: callback => { handler = callback; }, env: { get: key => ({
      XENDIT_WEBHOOK_TOKEN: 'fixture-callback', SUPABASE_URL: 'http://fixture.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    })[key] } },
  });
  const results = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await handler(new Request('http://fixture.invalid', {
      method: 'POST', headers: { 'x-callback-token': 'fixture-callback', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'fixture-invoice', status: 'PAID', amount: 100, currency: 'IDR' }),
    }));
    results.push({ http: response.status, ...await response.json() });
  }
  assert.deepEqual(results.map(result => result.http), [500, 200, 200, 200]);
  assert.ok(results.slice(1).every(result => result.duplicate));
  assert.equal(paymentStatus, 'paid');
  assert.equal(paymentWrites, 1);
  assert.equal(parentAttempts, 1);
  console.log(`${kind}: committed payment; failed parent; three retries never repair parent`);
}
(async () => { await reproduce('release'); await reproduce('copyright'); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
```

## Closure requirement

Keep Phase 1B **BLOCKED** and Phase 2 **NOT READY**. Close the routing agent's reported credential incident through coordinated rotation/response, then independently rerun the failed security, ownership, reproducibility, external-byte, off-host restore, financial and real-identity gates against a stable deployed candidate. Preserve the independently verified contracts private-flag mitigation; do not count its earlier public=true state as a remaining CRITICAL or substitute that partial fix for the full privacy matrix.
