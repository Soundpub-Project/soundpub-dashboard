# Phase 1G Storage Inclusion Contract — Agent C

## Decision

**Storage Scope: PASS for synthetic-only Phase 2 build scope. Agent C status: PASS (BUILD ONLY). UNKNOWN_BLOCKING: 0. Production extraction/cutover remains NOT AUTHORIZED.**

This contract selects individual identities, not buckets. It defines future Soundpub scope; it authorizes no extraction, download, production import, deletion, policy change, restart, or provider call. Phase 2 fixtures must remain synthetic, with dedicated credentials, database and development object storage. Global readiness scoring and independent QA belong to the coordinating agent. This Storage PASS alone does not declare overall Phase 2 admission READY. INCLUDE categories describe future scope only; Phase 2 imports zero production objects, references or settings.

**Coordinator scope decision (2026-10-27, explicit instruction in this chat):** `iccn-gallery` feature/assets are OUT OF PHASE2 FOUNDATION and disabled in the synthetic backend. Current `soundpub.app_settings.value` source references remain immutable restricted provider/host/bucket/key provenance, separate from local metadata candidates. No gallery source bytes or production settings may be imported. Read-only origin attestation and owner approval are mandatory before gallery activation or Phase 5 transfer. This decision closes the build dependency; it does not attest origins, approve transfers or prove that raw mappings have been exported/verified. Only this document changes; feature-disable enforcement is a mandatory Phase 2 implementation condition, not a claim of an existing code change.

| Disposition | Local objects | Reference-only identities | Total identities |
| --- | ---: | ---: | ---: |
| INCLUDE | 582 | 0 | 582 |
| INCLUDE_EXTERNAL | 0 | 408 | 408 |
| INCLUDE_SHARED | 0 | 0 | 0 |
| EXCLUDE_NO_SOUNDPUB_REFERENCE (EXCLUDE) | 108 | 0 | 108 |
| DEFER_NON_BLOCKING | 1,609 | 198 | 1,807 |
| UNKNOWN_BLOCKING | 0 | 0 | 0 |
| **Total** | **2,299** | **606** | **2,905** |

The 25 bucket rows are configuration evidence, not object identities; all have `EXCLUDE` from data extraction. Including these rows, the CSV contains 2,930 records and EXCLUDE is 133 **records**, versus 108 **object/reference identities**. Never add bucket sizes to object bytes. Counts above are snapshot-bound scope decisions, not verified physical files or approved transfers.

## Provenance and evidence boundary

Authoritative production: `supabase.carubra.space`, server `20.20.20.3`, shared/multi-project. `.com` is a separate legacy/development route to `20.20.20.173`; a matching key does not make its object belong to `.space`.

Required inputs reviewed: `SUPABASE_MIGRATION_AUDIT.md`, `PHASE1F_FINAL_REPORT.md`, `PHASE1F_DATABASE_SCOPE.md`, `PHASE1F_AUTH_SCOPE.md`, `PHASE1F_STORAGE_SCOPE_REPORT.md`, `PHASE1F_STORAGE_SCOPE.csv`, `PHASE1F_FUNCTION_SCOPE.md`, and `PHASE1F_FINDING_RECLASSIFICATION.md` (Phase1F paths under `docs/migration`). Earlier audit assertions are historical where superseded by Phase1F production evidence.

Primary inventory snapshot: **2026-10-27T20:23:36.911323+07:00**. CSV SHA-256: `69e0134fabd466c7717c45a6d9af26177f7b2b05ac3ea78696d1d264442b9e30`.

Phase1F scanned 195 base/partitioned application tables in 11 schemas, selected text/JSON/array fields and nested JSON, and separated current from audit/archive/log/backup references. It matched exact normalized bucket/key, accepted `.space`, and kept `.com` matches untrusted. It did not cover arbitrary embedded text, every custom URL/provider or application views. This contract reuses that inventory rather than claiming a new exhaustive scan.

Agent C inspected repository storage callsites, settings and avatar fallbacks. Narrow production follow-up at **2026-10-27 14:38:51 UTC** reran the documented Phase1F Auth evidence CTE, replacing its output with SHA-256 application identity digests and classifications. SQL ran through direct SSH `maskhar@20.20.20.3`, after `cd /data/supabase/instances/supabase-01/config`, using `docker compose exec -T db psql -X -q -A -t -U postgres -d postgres -v ON_ERROR_STOP=1`; repeatable-read READ ONLY, `transaction_read_only=on`, bounded timeout, ROLLBACK. A prior Compose running-service-name check was also read-only. No remote file writes or object reads occurred.

The identity partition still reconciled to 110 SOUNDPUB ONLY, 16 SHARED, 29 OTHER PROJECT, 56 UNKNOWN. Local joins of pseudonymous business-owner hashes to these results established:

| Profile-only media references | Identities | Owner evidence |
| --- | ---: | --- |
| Local profile avatars | 14 | 7 Soundpub operational-only; 7 operational plus other-app identity evidence |
| Local profile logos | 2 | Soundpub operational-only |
| Legacy-cloud profile avatars/logos | 10 | Soundpub operational-only |
| Other external avatars | 1 | Soundpub operational-only; exact identity listed below |
| Other external avatars | 16 | UNKNOWN Auth class: no qualifying Soundpub operational/business dependency under Phase1F predicates |

Business evidence uses domain roles, artist profile/roster ownership, release/track/royalty relations, audit **actor** activity and business/payment/workflow relations, as specified by the Phase1F Auth reproduction SQL. Default profiles, artist/user default roles, email, editable registration metadata and shared Auth membership alone do not qualify. Evidence remains a database linkage finding, not legal ownership approval. Separate snapshots do not establish a production freeze.

## Deterministic per-identity rules

Identity key: `(row_type, identity_sha256)` from the pinned CSV. Preserve every `logical_record` and `reference_sources` edge; never replace all references with a single representative row. The runnable selector below assigns exactly one classification to every object/reference row. It is a snapshot-only reconciliation check against the hash-pinned CSV, not executable extraction or a discovery/approval engine. Current external evidence tuples are frozen from that verified input; unseen identities or changed provider/source/count evidence fail closed. New inventories require renewed evidence review and explicit scope decisions, not automatic approval by rebuilding this set. The CSV plus this selector is the per-object ledger; no new CSV or raw private-path export is required.

Apply rules in this order:

1. Bucket row: EXCLUDE configuration record; no whole-bucket copying.
2. Local object with strict `scope_classification=soundpub_owned` and `current_reference_count>0`: INCLUDE. These 582 have exact accepted current Soundpub reference evidence. The 16 profile-only exceptions to business-table linkage were independently checked above and all have qualifying operational identities.
3. Local object with strict `scope_classification=other`: EXCLUDE_NO_SOUNDPUB_REFERENCE. This means no accepted current Soundpub link in inspected evidence, not permission to delete or proof of no historical linkage.
4. Only the exact 18 local candidate identities listed below: DEFER_NON_BLOCKING under the coordinator's gallery exclusion decision. Preserve their current source-reference edges separately; no source-to-local identity alias is established. This exception requires gallery disabled, synthetic fixtures only and no production settings/bytes import. Any other unverified-host current Soundpub candidate remains UNKNOWN_BLOCKING.
5. Remaining local unknown: DEFER_NON_BLOCKING, withheld from Soundpub extraction. No accepted current Soundpub dependency and no current Soundpub host-candidate link was found. Ownership need not be solved host-wide. Reopen immediately if a required Soundpub reference is found.
6. Current GCS/legacy-cloud reference: INCLUDE_EXTERNAL. Preserve future migration requirement; byte recovery is a separate Phase 5 task.
7. Current `external_other` avatar with the operational owner digest match recorded below: INCLUDE_EXTERNAL with provider `UNKNOWN_EXTERNAL`, not presumed GCS or local Storage.
8. Only the exact 16 approved current `external_other` avatar digests listed below, with `current_reference_count=1` and exact `reference_sources=soundpub.profiles.avatar_url`: DEFER_NON_BLOCKING with their exact references retained in a restricted reference registry. Any unseen current external identity, changed source lineage or changed current reference count is UNKNOWN_BLOCKING; no provider-wide deferral applies. No business dependency was found; avatars are optional presentation (`Settings.tsx`, `DashboardLayout.tsx`, `AppSidebar.tsx` use `AvatarFallback`). Do not migrate their users solely because avatars exist. This does not declare objects unowned or safe to erase.
9. The remaining 182 historical-only reference identities: DEFER_NON_BLOCKING; retain historical provenance, no byte-copy requirement for backend foundation.
10. Any new/unhandled row, malformed identity, missing mandatory linkage, ambiguous match or additional migration-critical unresolved reference: UNKNOWN_BLOCKING. Do not silently fall through to exclusion.

`INCLUDE_SHARED` is reserved for an object with both Soundpub and other-app **object-reference** evidence and a scoped access/retention contract. Snapshot has zero confirmed such objects. Seven profile-avatar owners have SHARED identities; that does not establish shared bytes. Those seven avatars remain INCLUDE with only Soundpub's proven reference edges. If another-app object edge appears, promote to INCLUDE_SHARED and resolve consent/access before transfer; do not copy that application's rows or identities.

Every later extraction must intersect this scope with the approved Phase1G database-row and Auth inclusion contracts. If either contract contradicts a selected relationship, stop and reconcile counts; never broaden identity scope or copy excluded rows to satisfy a file reference. `soundpub_owned`, UUID prefixes, uploader IDs, metadata hints, filenames, backup bucket lists and `owner_soundpub_profile=true` are not standalone extraction authority.

## Local inventory reconciliation

| Bucket | INCLUDE | EXCLUDE | DEFER_NON_BLOCKING | UNKNOWN_BLOCKING |
| --- | ---: | ---: | ---: | ---: |
| 3d-models | 0 | 0 | 11 | 0 |
| article | 0 | 0 | 1 | 0 |
| artikel-media | 0 | 63 | 3 | 0 |
| audio-clips | 8 | 0 | 0 | 0 |
| avatars | 22 | 26 | 419 | 0 |
| blog-covers | 0 | 0 | 2 | 0 |
| certificate | 0 | 0 | 0 | 0 |
| chatten-media | 0 | 6 | 0 | 0 |
| contracts | 0 | 0 | 0 | 0 |
| daily-report | 0 | 13 | 1096 | 0 |
| gallery | 0 | 0 | 18 | 0 |
| iccn-gallery | 0 | 0 | 31 | 0 |
| label-logos | 5 | 0 | 6 | 0 |
| learning | 0 | 0 | 1 | 0 |
| lelanganproperti | 0 | 0 | 20 | 0 |
| mentor | 0 | 0 | 0 | 0 |
| payout-proofs | 2 | 0 | 0 | 0 |
| release-covers | 246 | 0 | 0 | 0 |
| release-invoices | 2 | 0 | 0 | 0 |
| school-logo | 0 | 0 | 0 | 0 |
| takedown-documents | 0 | 0 | 0 | 0 |
| task | 0 | 0 | 0 | 0 |
| template | 0 | 0 | 1 | 0 |
| track-audio | 297 | 0 | 0 | 0 |
| track-video | 0 | 0 | 0 | 0 |

INCLUDE metadata size: **9,945,025,635 bytes**. EXCLUDE: **56,995,510**. DEFER: **1,768,415,382** (including **6,098,014** for the 18 gallery candidates). UNKNOWN_BLOCKING: **0**. Total: **11,770,436,527 metadata bytes**; physical byte existence and checksums remain unverified.

Explicit disposition of **1,609 Phase1F unknown local objects**: 1,609 DEFER_NON_BLOCKING and zero UNKNOWN_BLOCKING for build scope; 18 of these deferrals specifically depend on the coordinator's gallery exclusion. Of these 1,609, 1,469 have only other-app unverified-host candidate evidence, 18 have Soundpub host-candidate evidence, and 122 remain candidate-unknown. Other-app candidates stay deferred rather than treated as verified other-app ownership. The 20 unknown objects with Soundpub-profile uploader metadata do not enter INCLUDE on that basis.

### Eighteen gallery identities: exact coordinator-deferred set

Each row below is a local `iccn-gallery` metadata identity with current candidate `soundpub.app_settings.value` linkage through `.com`. Current strict reference count is zero; candidate count is one. Full source lineage remains in the CSV. These are **18 distinct identities already counted within the 1,609**, not 18 extra reference-only rows. A matching local key and metadata size cannot prove which origin supplies current production content.

- `2c2b466c689fb295f9e86c00f9497384886984d8dbee9e2d0620a55f0185345c`
- `227cf516676a621f350f2b72759df30d4ff65508eb627853f1b1eb3c104c5bca`
- `24a38c9187142fe78057b217cb250dcb034774e7565f27369ea0c6d41d2dccd8`
- `2df58596c00ec7efbf005b5f861673aaf3d58bc6aa4549c5cfb6acf95f207131`
- `9d607a5c0ae5fba7f16b02c38e44509bc78a4d28613626b747322d2a1b440c2a`
- `dededa7123399969dae34b6d45d0d54bc4b19595b32ad377be27042c7d7d8a15`
- `881c56fe62ca81392688e8c602f8a3ad1784f7c8bca382212d7ba247d655d593`
- `554ed4d89b43512f90b40ecbb31e2ec35d55ed90e368d98abe700c9edfd757fa`
- `d28c70fdfde62660aab244573b9705b288aaf812d2a4a4b17a39e1c3c5fe2c40`
- `512988a988f4d1c5f777a4eea8a5d3fbab7ad43ba3d8cb61d2ba95e4633a70c4`
- `42c66741cd6c84683248eaeff811208b7aceb300f8417265802c53c4598254f0`
- `61a87ede95b9d1037c60fb30e35b00cbd9982b19482063d4a5630b065f4acf71`
- `a208ab88cf11a4ae832fe5bd8a80c0d10e559601101379e1de9249e0e9b211a2`
- `9ab291936655041bfb918ff450eb1ce290c783ccdb31bef75d1359f21a7c9171`
- `2597ba2eb1afdf5f60382d6a29901c41d87ea7934b9aeaa29c0ceae0e0fe51cf`
- `82040ed95e2452d5b2b44f3fb8a1fa5197d25ab35f51b24b78c34c9d6186a433`
- `711956fd6f208881427f9eb8abf4f1ae3d0c3a5f319ebff697d812866121cd44`
- `074f7ec1e55058be107e0b49c655e59884898d76c4b2dee6a7618aa5b4b4306b`

The coordinator explicitly selected feature exclusion for synthetic-only Phase 2. Therefore these 18 local candidates are DEFER_NON_BLOCKING, while source origin remains unattested. Preserve each original source reference as an immutable restricted record with `source_schema/table/record/column/JSON_location`, `provider` (UNKNOWN_EXTERNAL if unresolved), `source_host`, `source_bucket`, exact `source_object_key`, original stable-reference identity and observation snapshot. Keep `candidate_local_identity_sha256` only as an unverified evidence link; `resolved_local_identity` must remain null. Original values stay in restricted production provenance; this document/CSV contain only pseudonymous evidence. No mapping may be fabricated from local key equality. These provenance edges are not 18 newly inventoried external rows and must not be added to the 606 reference-only identity count.

Before gallery activation or any Phase 5 gallery transfer, require read-only attestation of each actual source provider/host/bucket/key, owner approval, retrieval authorization and applicable byte/access verification. If original immutable provenance cannot be recovered, the affected gallery reference is UNKNOWN_BLOCKING for that later activation/transfer. It remains outside the Phase 2 dependency set. Reintroducing gallery into foundation scope invalidates this exception and reopens scope review; no automatic promotion to INCLUDE. Do not conflate legacy `.com` with authoritative `.space`.

## External references: all 606 accounted for

| Provider/evidence | Identities | Contract disposition | Byte work |
| --- | ---: | --- | --- |
| Current GCS | 279 | INCLUDE_EXTERNAL | Required future migration; deferred byte recovery |
| Current legacy Supabase Cloud | 128 | INCLUDE_EXTERNAL | Required future migration; deferred byte recovery |
| Current other external avatar, operational owner | 1 | INCLUDE_EXTERNAL; UNKNOWN_EXTERNAL provider | Preserve exact reference; provider/access/bytes unresolved for Phase 5 |
| Current other external avatars, no operational dependency | 16 | DEFER_NON_BLOCKING | Preserve references; no copying; reopen on required business/identity linkage |
| Legacy Cloud history-only | 12 | DEFER_NON_BLOCKING | Retain history; no current dependency found |
| Self-hosted history-only, absent current metadata | 59 | DEFER_NON_BLOCKING | No proof of current required missing file |
| Unverified-host history-only | 111 | DEFER_NON_BLOCKING | Preserve original host identity; no local alias assumption |
| **Total** | **606** | **408 INCLUDE_EXTERNAL; 198 DEFER_NON_BLOCKING** | No retrieval performed |

The required **407** are 279 GCS + 128 legacy-cloud identities: GCS has 111 track audio, 167 clips and one app-settings identity; legacy Cloud has 18 track audio, 55 clips, 45 covers, two profile avatars and eight profile logos. Preserve all 407 migration-relevant identities. Provider ownership, access rights, bytes and cross-provider equivalence are unproven.

Phase1G external substatus for these 407: `REQUIRED_FOR_FUTURE_MIGRATION=407`, `NOT_REFERENCED_BY_SOUNDPUB=0`, `DUPLICATE_REFERENCE=0 established`, `UNKNOWN_BLOCKING=0 for reference scope`. Separately, **all 407 have `DEFERRED_BYTE_RECOVERY=true`**. Requirement and recovery are different axes; do not add 407 + 407. CSV already deduplicates exact identities; repeated DB references are edges, not duplicate files. No cross-provider content deduplication is established.

The **17 current external_other references are not historical**. All 17 retain `soundpub.profiles.avatar_url` lineage and source identity. One is required in the reference registry; 16 are explicitly optional under the no-business-dependency rule, not silently excluded because their provider is unknown. Unknown provider alone does not prevent designing a provider-neutral reference record, but does prevent authorizing a byte transfer or live fetch. Any later decision that one of these 16 avatars is migration-critical promotes it to INCLUDE_EXTERNAL; if its exact required source cannot be represented, UNKNOWN_BLOCKING, never automatic defer.

Operational-owner external avatar identity:

`dcc460558aa755672f1e20bcf0f3a4ca298c58990a3c6913b3826de5c092371e`

Exact 16 deferred current-avatar identities (Phase1F Auth UNKNOWN class in the narrow follow-up):

- `46f579abd94071221740d309bd9db92ac1ad92aa0e0dbf0975d1ebce69db7735`
- `a68774929d106301652dbcf4bc3c95cea06466e2042f9de1f2dca14edbbb758c`
- `2a66b63b19a8c994f65378ca88a92a63bcfa154f68d747b3935019a3b3deb8e7`
- `ca83af2351b2d5f4a925507b53128fa3858c0b7c96b56c42e3506b27b7bc8dbf`
- `c364cb13820950eff717a96d25abc0b73a52082367cc90a04d5176b983ba52ab`
- `ad04c0221beded0a421cac788727b901980834112f1b9d9d8e684ee0b23b623b`
- `ffa1e5b90279a51be7152a9f796188f12b23a32db272f81439b67273b62aff61`
- `526b60dffc44b0b13e4daee44f9d273b147d80cb9001c661aafe9ebaab395817`
- `497caa34eed90ca31b0950f768791fe9bb711f9d92bc3bd14f28eacc4b9afc52`
- `9ce4cc910ea6baea41ed555101c8dbefa722b4251c3724ad01250b94dae1fb9e`
- `876ec529792ed460d57bf433dee9defd9b1f8cf611d798d2d50dc3f5f57cf3c9`
- `c91c1172b0b38384c2bcfd077a210ce1f470ac3af042fe38dec6ce3693a31baa`
- `d3687c5a13cc258347edee5c431a622a4335c96d3f1bebfcd0d4ca51a2b125c1`
- `2c75d2f8e0b6b89919866ad5fb3d1daf58ba6fe708c6255e7088970dc521abd9`
- `81701af7a692d33e0ba15fdec54e0720e4baa4ffb79171929d6fcf9a9f5a63dd`
- `fbd8e2d06f7f0320e722e54a8f4fd4e177bb8b2938ab166e7f268965afd8c8dd`

## Reference discovery and target model

Observed current CSV source columns: `soundpub.releases.cover_url`, `tracks.audio_url`, `tracks.clip_url`, `artist_profiles.profile_image_url`, `profiles.avatar_url`, `profiles.logo_url_light`, `profiles.logo_url_dark`, `app_settings.value`, `payout_requests.payment_proof_path`, `release_payments.invoice_pdf_path`. Audit before/after JSON is provenance, not current inclusion authority.

Discovery must also retain the contracts for `tracks.video_url`, profile legacy `logo_url`, copyright file/contract paths, takedown document bucket/path, royalty upload/source-file references and nested configuration paths, even where no recognized current identity occurred. Check canonical schema and real DB catalog, not stale generated frontend types alone. Phase1F scanned these table domains; absence from its selected reference output is not proof that every arbitrary text field is file-free. Raw signed URLs must be resolved server-side to a stable identity; token/query/fragment must not become an object key or be committed.

Future reference/object model:

| Field | Contract |
| --- | --- |
| application | Fixed Soundpub namespace, server enforced |
| provider | Explicit provider enum including UNKNOWN_EXTERNAL; unresolved provider cannot be used by a live copy/fetch adapter |
| source_host / bucket or container / object_key | Exact normalized source identity; host retained for external/legacy references; case-sensitive key |
| source_identity_sha256 | Inventory correlation identity, never content checksum |
| logical_owner | Application-local user/resource UUID plus owner type; preserve business FK mapping, not shared Auth authority |
| reference_edges | schema/table/record UUID/column/JSON location plus current/history flag and evidence snapshot, held in restricted mapping |
| visibility | PUBLIC, PRIVATE, ADMIN_ONLY; independent of source bucket flag |
| mime / size_bytes | Nullable until independently verified; distinguish metadata claims from observed bytes |
| checksum_algorithm / checksum | Nullable until bytes verified; identity digests and ETags are not automatically content checksums |
| disposition / reason / evidence / recovery_status | Versioned explicit per-identity decision and deferred task |
| target identity | Dedicated Soundpub provider/container/key; source identity remains immutable provenance |

Parse known URL forms with URL parser; strip query/fragment, decode once using the Phase1F matcher, preserve case. Never repeatedly decode, accept ambiguous bucketless matches, collapse host aliases, or merge providers by basename. Reject malformed/ambiguous mappings into UNKNOWN_BLOCKING when required. Resolve relative paths only with field-specific bucket context or the audited unique exact-key rule. Do not rewrite production URLs. Later migration must use a restricted raw mapping to bind hashes back to exact references; this CSV alone cannot execute it. Keep signed credentials out of documentation and fixtures.

| Category | Future visibility / default |
| --- | --- |
| Explicitly approved catalog clips, artist/profile images and brand/gallery assets | PUBLIC only after publication approval; unresolved/deferred assets unavailable |
| Release covers, original track audio/video | PRIVATE by default; public catalog uses separately approved projection/derivative |
| Copyright files/contracts, takedown documents | PRIVATE with case/owner authorization; staff access scoped to assigned case/role |
| Payout proofs, invoice PDFs | PRIVATE to entitled owner and authorized finance staff; no public source URL inheritance |
| Royalty import originals, backup manifests, operational recovery evidence | ADMIN_ONLY in dedicated storage; not host-wide source backup copies |

No empty source bucket is an inclusion rule. Do not clone shared `storage.objects` rows, policies, Auth grants, service-role credentials or the file-backend mount. The deployed backup function's bucket list is not scope evidence. Broad source authenticated reads remain a cutover isolation defect, not a target authorization model. Target API must check application, logical owner/case, role and status; signed URLs issued only after authorization with bounded TTL. Real cross-project/tenant, signed expiry/tamper and public/private byte tests remain later validation work.

## Admission and later gates

| Gate | Status / exact limit |
| --- | --- |
| Baseline local metadata accounting and per-row classification | PASS for pinned inventory; all 2,905 identities classified |
| Database-driven reference inventory | Phase1F selected-field coverage reused; no claim of arbitrary-text/custom-provider completeness |
| Cross-project containment | No whole buckets, owner-prefix expansion, automatic-profile inclusion or host alias expansion; later extraction must join approved DB/Auth contracts |
| Current 407 external requirement identification | PASS for reference scope; byte/provider-rights verification deferred |
| Current 17 external avatars | All explicit: 1 INCLUDE_EXTERNAL and 16 justified deferred references |
| Build-critical unresolved scope | PASS: zero; gallery has explicit exclusion from foundation scope and separate preserved source provenance |
| UNKNOWN_BLOCKING = 0 | PASS for build: 0; gallery origin/transfer resolution remains deferred |
| Storage Scope / formal Phase 2 admission | Storage PASS for synthetic-only build; overall admission still requires other scope gates, boundary, score and independent QA |
| Production extraction/cutover | NOT AUTHORIZED; owner/transfer rights, physical bytes, recovery, checksums, isolated access, restore and final source-drift reconciliation remain |

No Agent C build-scope blocker remains under the explicit coordinator boundary. All 1,609 unknown local objects are deferred, including the exact 18 gallery candidates under that decision. External byte recovery, host-wide owner classification and source policy remediation remain later work. The gallery deferral relies on disabled functionality, immutable restricted source provenance and zero production import; violating that boundary invalidates build PASS. A revised Auth/DB contract or newly found required file dependency requires re-evaluation, not silent count reuse.

## Runnable local reconciliation

Run from repository root with Python 3. Reads pinned CSV and this contract only. Checks taxonomy counts, individual-avatar decisions, source lineage, exact deferred gallery set, bytes and identity uniqueness. It verifies document scope conditions, not runtime enforcement of the synthetic-backend boundary. Does not validate raw URL mappings, legal rights or current production drift.

```python
import csv
import collections
import hashlib
from pathlib import Path

path = Path('docs/migration/PHASE1F_STORAGE_SCOPE.csv')
assert hashlib.sha256(path.read_bytes()).hexdigest() == '69e0134fabd466c7717c45a6d9af26177f7b2b05ac3ea78696d1d264442b9e30'
with path.open(encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f))
operational_avatar = 'dcc460558aa755672f1e20bcf0f3a4ca298c58990a3c6913b3826de5c092371e'
contract = Path('docs/migration/PHASE1G_STORAGE_INCLUSION_CONTRACT.md').read_text(encoding='utf-8')
import re
gallery_section = contract.split('### Eighteen gallery identities: exact coordinator-deferred set', 1)[1].split('## External references:', 1)[0]
gallery_ids = set(re.findall(r'^- `([0-9a-f]{64})`$', gallery_section, re.M))
assert len(gallery_ids) == 18
build_scope = dict(gallery_enabled=False, production_import=False, source_local_alias=False)
assert not any(build_scope.values())
assert 'Read-only origin attestation and owner approval are mandatory' in contract

approved_deferred_avatars = {
    '46f579abd94071221740d309bd9db92ac1ad92aa0e0dbf0975d1ebce69db7735',
    'a68774929d106301652dbcf4bc3c95cea06466e2042f9de1f2dca14edbbb758c',
    '2a66b63b19a8c994f65378ca88a92a63bcfa154f68d747b3935019a3b3deb8e7',
    'ca83af2351b2d5f4a925507b53128fa3858c0b7c96b56c42e3506b27b7bc8dbf',
    'c364cb13820950eff717a96d25abc0b73a52082367cc90a04d5176b983ba52ab',
    'ad04c0221beded0a421cac788727b901980834112f1b9d9d8e684ee0b23b623b',
    'ffa1e5b90279a51be7152a9f796188f12b23a32db272f81439b67273b62aff61',
    '526b60dffc44b0b13e4daee44f9d273b147d80cb9001c661aafe9ebaab395817',
    '497caa34eed90ca31b0950f768791fe9bb711f9d92bc3bd14f28eacc4b9afc52',
    '9ce4cc910ea6baea41ed555101c8dbefa722b4251c3724ad01250b94dae1fb9e',
    '876ec529792ed460d57bf433dee9defd9b1f8cf611d798d2d50dc3f5f57cf3c9',
    'c91c1172b0b38384c2bcfd077a210ce1f470ac3af042fe38dec6ce3693a31baa',
    'd3687c5a13cc258347edee5c431a622a4335c96d3f1bebfcd0d4ca51a2b125c1',
    '2c75d2f8e0b6b89919866ad5fb3d1daf58ba6fe708c6255e7088970dc521abd9',
    '81701af7a692d33e0ba15fdec54e0720e4baa4ffb79171929d6fcf9a9f5a63dd',
    'fbd8e2d06f7f0320e722e54a8f4fd4e177bb8b2938ab166e7f268965afd8c8dd',
}
assert len(approved_deferred_avatars) == 16
approved_current_external = {
    (r['identity_sha256'], r['provider'], r['reference_sources'], r['current_reference_count'])
    for r in rows if r['row_type'] == 'external_reference' and int(r['current_reference_count']) > 0
}

def classify(r):
    if r['row_type'] == 'bucket':
        return 'EXCLUDE'
    current = int(r['current_reference_count'])
    if r['row_type'] == 'object':
        if r['scope_classification'] == 'soundpub_owned' and current > 0:
            return 'INCLUDE'
        if r['scope_classification'] == 'other':
            return 'EXCLUDE'
        if r['scope_classification'] == 'unknown':
            if r['candidate_scope_classification'] == 'soundpub_owned':
                return 'DEFER_NON_BLOCKING' if r['identity_sha256'] in gallery_ids else 'UNKNOWN_BLOCKING'
            return 'DEFER_NON_BLOCKING'
    if r['row_type'] == 'external_reference':
        if current > 0:
            evidence = (r['identity_sha256'], r['provider'], r['reference_sources'], r['current_reference_count'])
            if evidence not in approved_current_external:
                return 'UNKNOWN_BLOCKING'
        if current > 0 and r['provider'] in {'gcs', 'legacy_supabase_cloud'}:
            return 'INCLUDE_EXTERNAL'
        if current > 0 and r['provider'] == 'external_other':
            if current != 1 or r['reference_sources'] != 'soundpub.profiles.avatar_url':
                return 'UNKNOWN_BLOCKING'
            if r['identity_sha256'] == operational_avatar:
                return 'INCLUDE_EXTERNAL'
            if r['identity_sha256'] in approved_deferred_avatars:
                return 'DEFER_NON_BLOCKING'
            return 'UNKNOWN_BLOCKING'
        if current == 0 and int(r['historical_reference_count']) > 0:
            return 'DEFER_NON_BLOCKING'
    return 'UNKNOWN_BLOCKING'

assert collections.Counter(r['row_type'] for r in rows) == {'bucket': 25, 'object': 2299, 'external_reference': 606}
assert len({r['identity_sha256'] for r in rows}) == len(rows)
identities = [r for r in rows if r['row_type'] != 'bucket']
counts = collections.Counter(classify(r) for r in identities)
assert counts == {'INCLUDE': 582, 'INCLUDE_EXTERNAL': 408, 'EXCLUDE': 108, 'DEFER_NON_BLOCKING': 1807}
assert counts['INCLUDE_SHARED'] == counts['UNKNOWN_BLOCKING'] == 0
unknown = [r for r in rows if r['row_type'] == 'object' and r['scope_classification'] == 'unknown']
assert len(unknown) == 1609
assert collections.Counter(classify(r) for r in unknown) == {'DEFER_NON_BLOCKING': 1609}
gallery = [r for r in identities if r['identity_sha256'] in gallery_ids]
assert len(gallery) == 18
assert all(classify(r) == 'DEFER_NON_BLOCKING' and r['bucket'] == 'iccn-gallery' and 'soundpub.app_settings.value' in r['reference_sources'].split(';') and int(r['current_reference_count']) == 0 and int(r['unverified_host_reference_count']) == 1 for r in gallery)
assert sum(int(r['size']) for r in gallery) == 6098014
assert collections.Counter(classify(r) for r in identities if r['row_type'] == 'object') == {'INCLUDE': 582, 'EXCLUDE': 108, 'DEFER_NON_BLOCKING': 1609}
external = [r for r in rows if r['row_type'] == 'external_reference']
required = [r for r in external if int(r['current_reference_count']) and r['provider'] in {'gcs', 'legacy_supabase_cloud'}]
assert collections.Counter(r['provider'] for r in required) == {'gcs': 279, 'legacy_supabase_cloud': 128}
assert all(classify(r) == 'INCLUDE_EXTERNAL' for r in required)
avatars = [r for r in external if r['provider'] == 'external_other']
assert len(avatars) == 17
assert all(int(r['current_reference_count']) == 1 and r['reference_sources'] == 'soundpub.profiles.avatar_url' for r in avatars)
assert collections.Counter(classify(r) for r in avatars) == {'INCLUDE_EXTERNAL': 1, 'DEFER_NON_BLOCKING': 16}
assert {r['identity_sha256'] for r in avatars if classify(r) == 'DEFER_NON_BLOCKING'} == approved_deferred_avatars
sample = next(r for r in avatars if r['identity_sha256'] in approved_deferred_avatars)
unseen = dict(sample, identity_sha256='0' * 64, reference_sources='soundpub.copyright_registration_files.file_path')
assert classify(unseen) == 'UNKNOWN_BLOCKING'
assert classify(dict(sample, identity_sha256='0' * 64)) == 'UNKNOWN_BLOCKING'
assert classify(dict(sample, reference_sources='soundpub.copyright_registration_files.file_path')) == 'UNKNOWN_BLOCKING'
assert classify(dict(sample, current_reference_count='2')) == 'UNKNOWN_BLOCKING'

assert sum(classify(r) == 'DEFER_NON_BLOCKING' and int(r['current_reference_count']) == 0 for r in external) == 182
assert sum(int(r['size']) for r in identities if classify(r) == 'INCLUDE') == 9945025635
assert sum(int(r['size']) for r in identities if r['row_type'] == 'object') == 11770436527
assert sum(int(r['size']) for r in identities if r['row_type'] == 'object' and classify(r) == 'DEFER_NON_BLOCKING') == 1768415382
assert collections.Counter(classify(r) for r in external) == {'INCLUDE_EXTERNAL': 408, 'DEFER_NON_BLOCKING': 198}
assert sum(int(r['current_reference_count']) > 0 for r in external) == 424
assert sum(counts.values()) == 2299 + 606 == 2905
print(dict(counts), 'Storage Scope PASS (BUILD ONLY); UNKNOWN_BLOCKING=0; gallery activation/transfer gated')
```
