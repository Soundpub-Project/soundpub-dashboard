# Phase 1F Independent QA — Agent H

**Production acceptance: FAIL. Independent verification coverage: PARTIAL. Formal Phase 2 admission: FAIL / NOT READY. Phase 1F scores: Backend Build 69/100; Production Cutover 52/100.**

Date: 2026-10-27, Asia/Bangkok. Initial independent production observations: 13:22–13:29 UTC. Initial report cutoff: 13:30 UTC / 20:30 Asia/Bangkok. Follow-up review covered the subsequently published Phase 1F decision, classification, execution and database reports; further read-only DB checks ran at 13:40 UTC. This is a challenge of evidence and scope, not remediation or migration approval. PASS below means the stated observation was verified, not that its whole security or migration gate passed.

## Boundary and evidence sources

- Production inspection used direct SSH `maskhar@20.20.20.3`, always after `cd /data/supabase/instances/supabase-01/config` before Docker. SQL used explicit repeatable-read, read-only transactions, bounded statement timeouts and aggregate/catalog output. No application maintenance, payment, user, or cleanup routine was invoked.
- Public GETs covered dashboard static assets and API health/status only. No existing business Edge Function, login, callback, signed object URL, user data, provider API, or legacy SSH target was invoked. No production deployment, upload, restart, route change, database/object mutation, credential probe or rotation occurred.
- Raw public bundle/schema bodies stayed in process memory; output contained titles, fixed-host booleans, byte counts and non-secret artifact hashes. Auth/Storage comparisons emitted aggregate counts only. No secret values or PII are retained in this report.
- Only this file is created or modified by Agent H. Other agents' pre-existing and concurrent worktree changes are outside this write boundary.
- Phase 1E original final, independent-QA, security-definer, tenant-isolation, finance, RPC, Auth, public-build, privileged-API, Xendit, credential, backup and restore reports were reviewed as historical evidence. Phase 1F topology, legacy reclassification, Auth, Storage, credential, backup, function, privileged-API, database, finding reclassification, execution log and final decision reports were reviewed. The Phase 1F user rule governs admission; Phase 1E's rule does not.

## Independently verified claims

| Claim | Result | Independent evidence and limit |
| --- | --- | --- |
| Inspected `.3` Supabase stack is running | PASS, observation only | Eleven Compose services reported running/healthy. Gateway image is Envoy v1.39.0; Functions image is edge-runtime v1.74.0. Health does not prove application authorization or recovery. |
| `.space` connector selects inspected Envoy | PASS, scoped topology | Read-only live `network-supabase` management configuration reported version 3, `.space` to `http://supabase-envoy:8000`, and no `.com` entry. No Cloudflare account ownership/exclusivity claim follows. |
| Dashboard's served bundle uses `.space` | PASS | Public `/` selects `/assets/index-DBB0wF_R.js`; GET returns 2,195,336 bytes, SHA-256 `3f36f0ec992ac4ca6d91b5f2f9102f380bd222dcf06cfcc7bc1492e6469fcc9b`. Exact `.space` URL present; exact `.com` URL and `.173` IP absent. This is one bundle scan, not every consumer or dynamically formed URL. |
| `.com` and `.space` remain distinct observed paths | PASS, fingerprints only | Public `/auth/v1/health`: `.space` 401/12 bytes, `.com` 401/96 bytes. `/storage/v1/status`: both 200/zero bytes. Health/status responses are not authorization tests. |
| Live counts agree with Phase 1E/1F | PASS | At 13:23:08 UTC: 211 Auth users, 182 Soundpub profiles, 29 profile-less Auth users, 25 buckets, 2,299 objects; `transaction_read_only=on`. Counts are not approved ownership. |
| SECURITY DEFINER gate remains failed on `.3` | FAIL | 51 definers; two lack a configured `search_path`. `scan_orphan_artist_links`, `cleanup_expired_tokens`, and `get_user_full_name` are SECURITY DEFINER and executable by both `anon` and `authenticated`. Catalog permissions verified without invoking them or claiming a fresh exploit. |
| Four active copyright RPCs exist | FAIL | Zero overloads for each of `validate_royalty_csv_row`, `import_composer_royalties`, `get_royalty_upload_history`, `delete_royalty_upload` in live `soundpub`. Matches Phase 1E. No RPC contract or replacement was approved by this audit. |
| Private Storage is tenant-isolated | FAIL | Live SELECT policy `SoundPub authenticated read private buckets` checks only bucket membership for `release-covers`, `track-audio`, `track-video`; no actor/object-owner/app predicate. INSERT/UPDATE/DELETE policies also have owner-prefix/admin checks, so describing all four policies as identical unrestricted access would overstate the evidence. Real-account/two-way byte tests were not run. |
| Contracts bucket is still public | FAIL, obsolete claim | Live `contracts.public=false`, zero objects. This corrects the original historical public flag; it does not verify nonempty workflow privacy, URL expiry/tampering, reviewer rules or inactive-user behavior. |
| Mounted email/backup/webhook equal tested local candidates | FAIL | Independent remote hashes match topology report, but differ from local `send-app-email`, `backup-storage-to-drive`, `xendit-webhook`. Remote `_shared/privileged-api.ts` absent. `create-user` remote/local hash matches. Mount is `volumes/functions` to `/home/deno/functions`, read/write. Mounted bytes do not prove cached worker code or endpoint behavior. |
| Router supplies a global JWT boundary for stale handlers | FAIL | Independent allowlisted configuration check: Functions `VERIFY_JWT=false`, `DATABASE_SCHEMA=soundpub`. Source markers show no `getUser` or privileged helper in mounted email/backup, and no POST-only guard. Companion report's critical missing-handler-boundary findings remain open; no live effect was triggered to test them. |
| Auth mail hook is Soundpub-exclusive | FAIL | Independent configuration check: shared Auth mail hook enabled at `.space/functions/v1/auth-email-hook`. Function report describes generic Auth templates as well as Soundpub signup handling. No permission to retire this shared delivery path follows from Soundpub source inventory. |
| Financial gate is clean | FAIL | Initial read-only `scripts/payment_reconciliation_readonly.sql` reproduced 15 PASS / 5 FAIL: 14,474 missing source rows; 10 missing upload replay keys; 10 inserted-count mismatches; two paid rows without invoice number; two without PDF path. Follow-up replay of the Phase 1F database report's read-only batch reproduced those 20 checks plus 21 extended PASS / 0 FAIL, or 36 PASS / 5 FAIL across 41 predicates. No approved historical exceptions or provider settlement/restore equality proof. |
| Soundpub SQL inventory and extraction boundary | PARTIAL | Follow-up live read-only catalog counts: 33 tables, 56 functions, 78 policies, 47 non-internal table triggers, 101 B-tree indexes, 109 constraints including 43 FKs, four enums, 51 definers, zero views and zero required copyright RPC overloads. Separate query found 43 single-column FKs to `auth.users` outside Auth/Soundpub/Storage. This corroborates inventory, not an independently restorable Soundpub-only database. |
| Public build cleanup reached production | FAIL | Public GET: `/cors-test.html` 200, title `CORS Test`, 2,664 bytes; `/test-oauth.html` 200, title `Test Google OAuth`, 3,453 bytes; `/exports/full-schema.sql` 200, SQL markers, 76,769 bytes. SQL SHA-256 `2a0535f6ab8cc24b2ef1a837cb49d3594b7f8f045062916dff6cf9574ed4a3d4` matches topology report. Unknown page returns app HTML; these debug/SQL results were distinguished from SPA fallback. |
| On-host recovery material exists | PASS, existence only | DB dump 5,413,336 bytes; Storage archive 9,953,083,392 bytes; recorded writer status `PASS`. Paths agree with `PHASE1F_BACKUP_SCOPE.md`. No archive rehash, fresh restore, byte-content read, off-host retrieval or exact finance comparison was performed. Historical 598-file drill remains attributed evidence. |
| Encrypted off-host/full-stack recovery gate passes | FAIL / NOT VERIFIED | Phase 1E and Phase 1F reports supply no qualifying independently retrievable encrypted copy/readback or full-stack recovery evidence. Local archive existence cannot establish absence of every off-host copy, nor prove a qualifying one exists. |

Remote source fingerprints independently observed:

| Entry | Mounted SHA-256 | Comparison |
| --- | --- | --- |
| `create-user/index.ts` | `079c2d9d06d81e10286060a805fb47a7265a111bb483dd7da73a998e8975584f` | Local match |
| `send-app-email/index.ts` | `bc51345a1021ec8856c0b8f50fb53a6cb059b83513429c849d50c7d9409ee1ab` | Local differs |
| `backup-storage-to-drive/index.ts` | `6bbfbf3091ada52201dfabb5cec5e502e919b8ec017e1c17cbe79e43ddf07130` | Local differs |
| `xendit-webhook/index.ts` | `39fa53bb922f64be772b47f77d9a2891fe5cbe2fe8bd1c8284eb875bf910acbb` | Local differs |

## Legacy `.com`: destination established, provider dependence UNKNOWN

**PARTIAL.** `PHASE1F_PRODUCTION_TOPOLOGY.md` supplies live workstation-connector evidence that `.com` selects `http://20.20.20.173:8000`, whose HTTP gateway advertises Kong. Agent H independently verified differing public fingerprints and the separate `.space` connector, but did not repeat workstation Docker inspection or SSH to `.173`. Attribution to Agent B is retained for that exact destination.

This supersedes the legacy-reclassification document's earlier U01 statement that no report maps `.com` to `.173`. It narrows transport uncertainty only. Kong owner/configuration, upstream runtime/source, authorized change control and rollback remain unknown.

**Actual Xendit provider callback destination remains UNKNOWN.** Historical Xendit runbooks prescribe `.com`; no current provider-console configuration/export, owner-approved callback inventory, provider delivery evidence or pending-event reconciliation was supplied. Served browser bundle selecting `.space` cannot prove a server-to-server payment callback also selects `.space`. A retained webhook dispatch does not identify its public hostname, provider provenance or successful financial effect.

Invoice creation source sets browser `success_redirect_url` / `failure_redirect_url`; those are not proof of the provider's invoice-status webhook destination. Neither historical instructions nor a frontend payment redirect closes this question. The same consumer distinction applies to Auth/OAuth, mail hooks, schedulers and external callers.

Consequences: do not label runtime `.com` findings LEGACY ONLY solely from the browser bundle; do not redirect, retire or merge `.com` and `.space`; do not infer `.space` authentication failure from historical `.com` responses. Required evidence is secret-free current provider callback metadata, named owner/control, consumer map, queued-event/retry reconciliation and a reviewed transition/rollback plan. No provider call or callback replay was attempted here.

## Ownership challenge

**Auth: PARTIAL inventory; approved ownership FAIL.** Agent H reran the report's SELECT-only reference classifier with aggregate-only output at 13:26:23 UTC: 110 SOUNDPUB ONLY, 16 SHARED, 29 OTHER PROJECT, 56 UNKNOWN; total 211. Independently checked six Soundpub/Cafe profile overlaps and zero Soundpub/Academy profile overlaps. Live `auth.users` trigger calls `handle_new_user`, whose source reads user and app metadata and contains the Academy branch.

The classifier reproduces its declared rules; it does not prove exclusive ownership. Domain roles, default profiles and historical records can reflect provisioning rather than approved tenancy. User metadata is editable. Legacy Buzzerhood UUID overlap warrants conservative hold, not proof of an active shared-login dependency. `SOUNDPUB ONLY` means no other evidence found within this scan, not global exclusivity. The 56 unknowns, 16 shared candidates and external provider/session bindings remain unresolved. Phase 1E's 29 profile-less identities are now better explained as Academy-linked; that is evidence improvement, not authorization to export/delete Auth or invalidate shared sessions.

The database report's **eight** overlapping Soundpub identities are matches in *current other-app columns with declared FKs to `auth.users`*. The Auth report's **22** Soundpub-profile identities with other-app evidence include 14 additional legacy Buzzerhood profile-ID matches that do not constitute the same current-FK population. Thus 8 versus 22 is a scope difference, not 30 distinct shared users or a contradiction. Within Auth's 22, 16 meet its Soundpub-operational criterion and enter SHARED; six lack that evidence and stay UNKNOWN. Neither count proves active cross-app login or exclusive Soundpub ownership.

**Storage: PARTIAL scope; approved ownership/bytes FAIL.** Reviewed final 20:23:36+07:00 snapshot, not intermediate files observed while another agent was writing. CSV has 2,930 records: 2,299 unique local-object identities, 606 unique external-reference identities, 25 unique buckets. Local final classes agree with report: 582 `soundpub_owned`, 108 `other`, 1,609 `unknown`. The separate unverified-host candidate projection is 600/1,577/122; it is not the final approved boundary.

Independent server-side URL parsing matched all 246 `.space` release-cover references and all 297 `.space` track-audio references to local bucket/key metadata. No object bytes or private documents were read. This supports linkage for those two large populations, not every CSV row, owner, external object or byte checksum.

All 2,299 local checksums and 606 external checksums are `NOT_COMPUTED`; object existence is metadata-only. The `soundpub_owned` label must therefore be read as application-reference candidate evidence. The final report separately counts seven objects whose uploader has cross-app membership, and 20 unknown objects whose uploader matches a Soundpub profile. These are object counts, not seven distinct shared identities or 20 approved Soundpub objects. Owning identity's other-app membership is not itself proof that the object is shared or exclusive. No whole-bucket copy is approved. `avatars` is shared; empty buckets are unresolved, not disposable.

The 407 currently Soundpub-linked external identities (279 GCS, 128 legacy Supabase Cloud), 12 history-only Cloud identities, unresolved/self-hosted historical references and other unmatched hosts still need owner/retention/byte disposition. A provider called legacy is not automatically outside current production scope. Old 598-file archive selection and new 582/600 candidate populations are different boundaries; without identity/version comparison neither completeness nor safe exclusion follows.

## Contradictions and claim corrections

| Statement or apparent contradiction | QA disposition |
| --- | --- |
| Legacy report: `.com` to `.173` relationship unproved; topology report: live connector maps it | Earlier snapshot superseded for transport destination. Runtime ownership, consumer dependence and retirement safety remain open. Do not preserve destination UNKNOWN as the latest result. |
| Credential scope marks exposed dashboard tunnel token UNKNOWN; topology identifies `network-soundpub` as active dashboard connector | Exact account credential validity/rotation remains untested, but production-ingress relevance is now supported. UNKNOWN must not mean harmless or legacy-only. This is distinct from `.space`'s `network-supabase`. |
| Function report carries `.com`/browser path as unattested; topology identifies served `.space` bundle | Update synthesis with topology evidence; retain incomplete provider/caller and cached-runtime scope. |
| Earlier Storage intermediate CSV classified 600 local objects as owned; final CSV classifies 582 | Final report explicitly separates exact verified-host linkage from unverified-host metadata candidates. Use final snapshot; do not add the two projections or count observation-row totals as objects. |
| `soundpub_owned` versus all byte checksums missing and ownership holds | Linkage label is not approved exclusive ownership or recoverable bytes. Hold dispositions are material, not optional footnotes. |
| Phase 1E independent-QA document says FAIL / NOT RUN | It was a self-check, not an earlier independent PASS. This assignment adds independent negative verification; it does not retroactively complete Phase 1E's acceptance gate. |
| Phase 1E tenant summary groups SELECT/upload/update/delete as broad | Current SELECT lacks owner/app predicates; current write policies contain prefix/admin checks. Preserve exact operation-level scope. No fresh write-authorization conclusion. |
| Contracts initially public versus now private | Historical flag superseded. Workflow/role/status/URL privacy still untested; empty private bucket cannot pass the complete gate. |
| HTML byte lengths differ across agents | User-Agent/delivery variants and transformations prevent treating HTML length alone as origin identity. Independent SQL and JS hashes match topology evidence exactly. |
| Full/shared dump called Soundpub recovery material | It is evidence of a prior archive, not a scoped export approval or permission to restore other applications' data. |
| Backup scope permits isolated backend construction while formal Phase 2 admission remains failed | Synthetic-data work in a separate environment is outside formal admission. It cannot be counted toward the Phase 1F build threshold, and no production data/shared credentials/provider effects are authorized by this QA. |
| Phase 1F P3 labels `.com` LEGACY / DEVELOPMENT and P5 treats its unknown origin as resolved | Live connector establishes a separate destination at `.173`; it does **not** independently establish development purpose, Kong ownership or non-use by current Xendit/other callbacks. P5-02 resolves destination uncertainty only. Retain environment label as coordinator classification, not proof of safe retirement. |
| Phase 1F P5 marks DDL and selected Storage restore baselines resolved | P5-05 is limited to two 949-record application-DDL reproductions; P5-06 is limited to prior 598 selected files. Shared-platform recreation, approved ownership, external bytes and full restore remain P0/P2 gaps. P5 must not become global readiness credit. |
| Phase 1F assigns definer security P1, credential containment P0-08 and real-role matrix P4 | These are stage-specific categories, not completed gates. Credential containment directly blocks cutover; other labels do not prove safe production authorization. |

## Credential incident and Phase 1F severity

**FAIL / OPEN.** Current-stack exposure is historically attributed in `PHASE1E_CREDENTIAL_INCIDENT.md` and prior QA, not merely inferred from `.com`. Phase 1F supplies no containment, consumer-complete rollover, old rejection, signing-verifier retirement, session recovery, provider-owner sign-off or independently retrievable recovery checkpoint. This audit deliberately did not reuse secrets to test current validity.

A repository text search also surfaced plaintext webhook credential material in historical Xendit documentation. Value is omitted; issuer/current validity untested. The search emitted that existing literal into tool output, so no claim of perfectly secret-free tool output is made. No further value search, validation or reproduction was performed. Treat as part of the open incident and containment review, not proof of a newly compromised live provider. Agent H modified no source or incident files.

The final Phase 1F register moves the open shared-production and Soundpub ingress/provider credential incident from former **P2-01** to **P0-08** because it blocks production migration/cutover. Consumer mapping, coordinated rollover, old-credential rejection and rollback remain unproved; this does not authorize unilateral rotation of host-wide credentials. The register separately assigns mounted unauthenticated mail/backup to P0-04, financial failures to P0-05, recovery gaps to P0-06 and absent RPCs to P0-07. Stale privileged-handler guards and private-bucket policy findings remain production-relevant, with exploit testing intentionally outside this scope.

## Phase 1F score and admission challenge

**Authoritative Phase 1F rule:** formal Backend Build admission requires at least **75/100** plus sufficient DB, Auth and Storage isolation. Production Cutover requires at least **85/100** and closure of production security, integrity and recovery gates. Phase 1E's single 85/100/zero-CRITICAL conjunct was applied incorrectly in the original QA draft; it is historical cutover context, **not** the Phase 1F Backend Build threshold. Sources: user-supplied Phase 1F rule, `PHASE1F_FINAL_REPORT.md` and `PHASE1F_FINDING_RECLASSIFICATION.md`.

| Stage | Reported score | Independently checked arithmetic | Threshold / deficit | Assessment |
| --- | ---: | --- | --- | --- |
| Backend Build | **69/100** | Six area scores 18 + 14 + 15 + 9 + 8 + 5 = **69**; maxima sum to 100; each score is within cap. | 75; **6 short** | Internally valid reported score. Exact partial-credit weights are judgment, not independently reproducible from a published objective scoring formula. No basis for upgrading it to 75. |
| Production Cutover | **52/100** | Six area scores 16 + 10 + 8 + 6 + 7 + 5 = **52**; maxima sum to 100; each score is within cap and no area exceeds its build-stage score. | 85; **33 short** | Internally valid reported score, not independent proof that each partial-credit weight is uniquely correct. Cutover remains blocked on independently observed failures. |

The previous Phase 1E **50/100** was carried from Phase 1D without full rescoring; it is neither Phase 1F's build score nor an arithmetic baseline for the 69/52 split. The Phase 1F execution log records the new two-score rubric. QA validates table arithmetic and much of the underlying negative evidence, **not** the subjective precision of 69 or 52 as unique readiness measurements.

Reclassification table contains **31 distinct IDs**, counted exactly once: **P0 8, P1 4, P2 5, P3 3, P4 4, P5 7**. The final report repeats those counts and lists eight P0s. **P0-01 Auth set, P0-02 Storage selection/bytes, P0-03 DB extraction boundary** directly block formal Backend Build scope admission. P0-04 through P0-08 primarily block production migration/cutover and must be handled in replacement contracts; counting all eight as equal build-stage blockers would misstate the Phase 1F taxonomy. P0-08 credential containment and P2 private-media isolation both remain cutover concerns. The taxonomy is internally exclusive by ID, but severity placement is judgment; a P1/P2/P4 label cannot bypass a failed cutover control.

**Formal Phase 2 result: FAIL / NOT READY.** Build score is six points below threshold, and each of three named scope conditions fails independently. Cutover score is 33 points below threshold; live privileged API, financial, RPC, Storage isolation, credential and recovery gaps remain. Neither 21 additional passing finance predicates nor passing scoped DDL tests cancels a failed gate. Contracts, session/SSO recovery, provider callback/reconciliation and real-role matrix remain incomplete.

Isolated backend prototyping with synthetic data, no production import/writes, provider effects or shared-stack dependency may be separately scoped. It is **not formal Phase 2 admission** and this QA does not authorize production-data extraction, copy, rotation, callback changes, frontend release or cutover.

## Coordinator risk notice and remaining verification

Major risks were raised in this chat during the audit: unclosed current-stack credentials, unknown legacy provider callbacks, production SQL/debug artifacts, live definer/RPC/finance failures and unapproved shared ownership. No coordinator messaging tool is available; this report and chat updates are the notification, not a claimed separate message.

Remaining QA limits: no real-account/role test, direct object access, provider-console readback, privileged-handler invocation, rotation/revocation test, full-stack restore, fresh archive checksum, full independent reclassification of every Storage row, or numeric readiness rubric recomputation. GETs can produce ordinary access logs. A Python default-User-Agent GET received 403; curl GETs then returned the recorded 200 assets. An initial aggregate SQL GROUP BY error was corrected; the read-only transaction closed without mutation. Subsequent Python URL parsing independently confirmed metadata matches. No failing probe was reported as a PASS.

Runnable report/CSV consistency check, from repository root; reads local reports only and emits no identities or secrets:

```python
import collections, csv, pathlib
root = pathlib.Path("docs/migration")
with (root / "PHASE1F_STORAGE_SCOPE.csv").open(encoding="utf-8-sig", newline="") as stream:
    rows = list(csv.DictReader(stream))
objects = [row for row in rows if row["row_type"] == "object"]
assert collections.Counter(row["row_type"] for row in rows) == {"object": 2299, "external_reference": 606, "bucket": 25}
assert len({row["identity_sha256"] for row in objects}) == len(objects)
assert dict(collections.Counter(row["scope_classification"] for row in objects)) == {"soundpub_owned": 582, "other": 108, "unknown": 1609}
assert all(row["checksum"] == "NOT_COMPUTED" for row in objects)
assert all(row["exclusive_ownership"] == "UNVERIFIED" for row in rows)
print("PASS: snapshot consistency only; ownership and byte recovery remain unverified")
```

## Closing review

`PHASE1F_PRIVILEGED_API_STATUS.md` became available during this audit and was reviewed. Its F-01/F-02 static CRITICAL findings concern current mounted `.space` mail/backup, not only the legacy gateway. Independent mounted hashes, missing helper, guard markers and disabled router JWT verification corroborate the stated boundary gap; gateway-specific successful exploitation/provider delivery remain untested. GET to backup would reach a business write in the reviewed source, so it was deliberately not invoked.

The companion's artist-password target-hierarchy, SSO binding, legacy verification-sender and inactive-caller findings are additional attributed source-review risks, not separately executed QA exploits. Internal webhook mail call was independently detected; dispatch counts alone remain non-proofs of legitimate caller identity. Companion routing UNKNOWNs should be read alongside the newer topology evidence.

Storage report was rewritten from structured JSON to prose during review, keeping its final snapshot counts. Final prose explicitly distinguishes attribution from title/consent, seven cross-app-uploader objects from distinct owners, and 20 unknown objects with Soundpub-linked uploaders. Agent H's local check was updated to the final CSV contract and run; no intermediate JSON output is required.

That 13:30 UTC cutoff is historical only. Follow-up reviewed `PHASE1F_FINDING_RECLASSIFICATION.md`, `PHASE1F_FINAL_REPORT.md`, substantive `PHASE1F_EXECUTION_LOG.md` and `PHASE1F_DATABASE_SCOPE.md`. Final/log now agree on eight P0s, three build-stage scope blockers, 69/100 build, 52/100 cutover and NOT READY. These documents were read as claims, not substituted for independent proof.

Independent local parsing of the revised register confirmed 31 unique severity IDs (8/4/5/3/4/7); prior checks confirmed both six-area score sums and 100-point maxima. The database report's 20 original rows count 15 PASS / 5 FAIL; its 21 extended rows count 21 PASS / 0 FAIL. A prior SSH replay of its explicit read-only financial batch at 13:40:44 UTC reproduced 36 PASS / 5 FAIL and the recorded populations: 14,474 royalties, ten successful uploads, four paid release payments, two missing both invoice number and PDF path, two copyright payments with zero paid. Thus several extended PASS results are vacuous: no paid copyright lifecycle and no populated upload replay/source keys. The 36 PASS count is arithmetic, **not** financial acceptance or provider settlement proof. This taxonomy-only update performed no live checks.

A separate live read-only catalog check reproduced 33 Soundpub tables, 56 functions, 78 policies, 47 non-internal triggers, 101 B-tree indexes, 109 constraints including 43 FKs, four enums, and 543 objects in private media buckets. Another check found eight Soundpub FKs to `auth.users`, one active `auth.users` trigger calling a Soundpub function, four `storage.objects` policies with Soundpub references, 43 single-column other-app FKs to `auth.users`, and six Soundpub/Cafe profile overlaps. This supports the DB extraction blocker and the report's 118-edge subtotal arithmetic (17 + 93 + 8), but Agent H did **not** independently rerun its full `pg_depend` edge classifier; 118 is an attributed report count, not a separately reproduced exact catalog query. No schema/data extraction was attempted.

The execution log's statement that all production work was read-only describes its own workstreams; Agent H independently attests only its own read-only SSH, safe GETs, local analysis and this report edit. Phase 1F's score/cardinality arithmetic is validated, while exact partial-credit calibration and exclusive ownership remain unproved. **Formal Backend Build admission and Production Cutover both remain FAIL.**

Final reviewed input fingerprints, SHA-256 of document/CSV bytes, not credentials or object content:

| File | SHA-256 |
| --- | --- |
| `PHASE1F_PRODUCTION_TOPOLOGY.md` | `a1c4d4b53263f9c16450f6e2ee13281a4c06afff182ca402ed482fea957551d6` |
| `PHASE1F_AUTH_SCOPE.md` | `29a39c99399971dffe2b0bb5bdbcfb28296a9c50b3cf5d95ce2c9d3cff53602a` |
| `PHASE1F_STORAGE_SCOPE_REPORT.md` | `d170941dda620f47a3b5e96ee59dfe9483caad7779bcaf04646b99f2610dc85f` |
| `PHASE1F_STORAGE_SCOPE.csv` | `69e0134fabd466c7717c45a6d9af26177f7b2b05ac3ea78696d1d264442b9e30` |
| `PHASE1F_PRIVILEGED_API_STATUS.md` | `7c0917bdfb0de41323eb4a62cd7e39baaf3e9ab7b90aa3476597bbd82d8a52a8` |
| `PHASE1F_DATABASE_SCOPE.md` | `e83b74eb0d460871a3791ee945d87cd522c2f7351de6fcf61605e2551a364175` |
| `PHASE1F_FINDING_RECLASSIFICATION.md` | `e226839521955554eae22fb5e863c6649801a7589ee2c93a9d18acc35d826705` |
| `PHASE1F_FINAL_REPORT.md` | `352fc5c6ed6b7c36529bad6d0a2bfc3df490a6de97fdced6b718e92dbcbe5c3e` |
| `PHASE1F_EXECUTION_LOG.md` | `5499b565bc5a8e3aed787d7edb7492585371e5c79e135a6d6e52a74d0dba7a28` |
