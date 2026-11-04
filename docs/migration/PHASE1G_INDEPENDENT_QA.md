# Phase 1G Independent QA — Agent D

Date: 2026-10-27. **Independent QA: PASS for isolated synthetic Phase2 foundation. Phase2: READY within mandatory boundary. Production extraction/cutover: NOT APPROVED.**

This final review supersedes this file's earlier FAIL. QA-01 and QA-02 were real findings; revised database and Storage contracts close them at design/snapshot level. No unresolved build-critical identity or file-reference question remains under the explicit gallery exclusion. No unrelated project's data is included in authorized Phase2 work: production imports are zero. Future scope contracts exclude other-app rows, credentials and authorization; shared users receive Soundpub-local representation only. This is not proof of exclusive ownership or approval for later production migration.

## Evidence and limits

Reviewed Phase1G request, Phase1F evidence, actual revised database/Auth/Storage contracts, function map, revised boundary, draft final report and updated scope summary. Production authority is inherited from Phase1F: shared `.space` on `20.20.20.3`; `.com` routes separately to `.173`. No fresh production attestation claimed.

All verification here ran locally. No SSH, HTTP/provider request, credential inspection, production SQL, object access, data movement, deployment or service change. Only this independent QA file was edited. Input fingerprints below bind the conclusion to reviewed bytes. A changed contract requires impact review; count equality alone cannot establish identical users or files.

## Executed verification

| Check | Result / evidence |
| --- | --- |
| Auth embedded Python | PASS: all 211 distinct aliases and evidence exactly match Phase1F; 110 INCLUDE, 16 INCLUDE_SHARED_IDENTITY, 29 EXCLUDE, 56 DEFER_NON_BLOCKING, zero UNKNOWN_BLOCKING. |
| Database embedded coverage Python | PASS: 743 source-ledger rows; canonical object/ACL coverage; no UNKNOWN assignments. |
| Database independent ledger parsing | 33 tables, 27 COPY-design and six REBUILD; 56 functions, 47 triggers, four enums, 78 policies, 83 ACL blocks; 56 standalone plus 45 constraint-backed indexes; 88 standalone constraints plus 21 inline CHECKs; 207 NOT NULL rows separate from historical constraint total. No duplicate object/type pair in reviewed ledger. |
| Database embedded synthetic negative Python | PASS: included child retains deferred uploader UUID through identity_references; deferred UUID absent from backend_users/profiles/user_roles; use as local principal rejected by FK; no FK violations. |
| Additional independent adapter probes | PASS: missing both endpoints rejected; simultaneous local/reference endpoints rejected; deletion of referenced identity_reference rejected. SQLite in-memory check validates model logic, not PostgreSQL deployment or complete authorization. |
| Revised Storage embedded Python | PASS: 582 INCLUDE, 408 INCLUDE_EXTERNAL, 108 EXCLUDE, 1,807 DEFER_NON_BLOCKING, zero INCLUDE_SHARED/UNKNOWN_BLOCKING. |
| Independent Storage adversarial probes | PASS: unseen avatar digest, changed legal-file lineage, changed reference count and unseen GCS identity each return UNKNOWN_BLOCKING. |
| Function exact-set comparison | PASS: same 37 entrypoints as Phase1F, once each: 11 BACKEND_API, four WORKER, one WEBHOOK, 14 AUTH_ADAPTER, one STORAGE_ADAPTER, two DEPRECATE, four LATER_REVIEW. |
| Draft final/scope summary | Counts, 77-point arithmetic and build-only boundary agree with revised contracts and this final QA. Earlier draft QA-PASS claim was premature; it becomes supported only by this completed review. |

All four embedded Python blocks ran successfully: Auth reconciliation, database coverage, database synthetic negative assertion, Storage reconciliation/adversarial checks. Independent probes ran additionally; no coordinator test result substituted for execution by this agent.

## Closed findings and over-inclusion challenges

### QA-01 CLOSED — identity references do not enlarge user selection

Database now fixes U strictly to Auth R1/R2: 110 + 16 = 126 baseline principals. Dependency closure expands relationships and typed references, never U. All 29 excluded and 56 deferred identities remain outside backend_users, imported profiles, artist_profiles, roles, provider identities and login provisioning. New operational evidence requires explicit Auth reclassification, not automatic FK-driven inclusion.

Revised database adopts Auth identity_references with restricted UUID/provenance, semantic kind, locator, validation state and optional resolved local UUID. No email, credentials, session, role or login permission. Eight-FK matrix distinguishes local-user-required profile/role/artist relations from historical owner/uploader/payer adapters. Additional matrix covers parent labels, actors, nested historical values, business endpoints and Storage-owner metadata. Source-null remains null where permitted; meaningful non-null relationships are preserved rather than silently reassigned. Reference cannot authorize tenant access, delivery, claims or payout.

Synthetic negative proof exists and passed. Independent XOR/FK/delete probes also passed. This closes the prior conflicting database dependency-expansion and all-FKs-to-local-users design. Actual PostgreSQL schema/API enforcement remains Phase2 implementation work and later validation, not a claimed deployed fix.

### QA-02 CLOSED — external_other deferral is exact and fails closed

Revised selector permits deferral only for exact 16 approved avatar digests with exact profile-avatar lineage and count one. Included operational-owner avatar is explicit. Pinned-current-external tuple check rejects changed digest/provider/lineage/count. Independently changed each boundary: UNKNOWN_BLOCKING returned for unseen avatar, legal attachment lineage, count two and unseen GCS identity.

Selector remains a pinned-inventory check, not a production importer. Approved-current tuples derive from CSV only after its exact SHA-256 check; do not remove that pin and call new inventory approved. A later refresh needs reviewed identity/lineage decisions, raw mapping and new checks.

### Eighteen gallery candidates — deferral accepted only because feature excluded

Exactly 18 local iccn-gallery candidates link current app_settings.value through unverified `.com` hostname; strict accepted Soundpub reference count is zero. Original exact digest set was independently matched. Metadata bytes total 6,098,014; these objects already belong to 1,609 unknown local objects, not 18 additional reference-only identities.

Coordinator explicitly excluded gallery from synthetic foundation; revised Storage and boundary prohibit settings/bytes import, fetch/mirror and host aliasing. Preserve original provider/host/bucket/key, record/column/JSON location and snapshot separately from candidate local identity; resolved-local identity remains null. Later activation/transfer requires origin attestation, owner approval and refreshed exact manifest. This is valid build-scope reduction, not invented proof that origins or ownership resolved.

Raw source registry export/custody was not verified. CSV hashes cannot reconstruct source URLs or JSON locations. Original references remain on unchanged production source; restricted mapping is mandatory before later activation/import. No need to retrieve production bytes or solve legacy origin to build disabled synthetic feature.

### Seventeen current external_other avatars — no silent omission

Independent CSV parse found 17 current identities, all soundpub.profiles.avatar_url, none sharing normalized path digest with local objects. One explicit operational-owner external reference included; exact other 16 deferred digest set matched contract. All 424 current external identities are accounted: 279 GCS + 128 Cloud + one included other-host avatar + 16 deferred avatars. Historical-only references number 182; they are separate from current avatars.

Agent C's live owner-class hash join is attributed evidence, not independently rerun production SQL here. Optional avatars and withheld default-only profiles justify deferral without copying users. Unknown provider supports inactive reference representation, never live fetch/transfer approval.

### Fifty-six deferred Auth and shared principals

Exact Phase1F evidence reproduces absence of qualifying operational relation under classifier rules for 56 default-profile/role identities, six with other-app footprints. Generic role, automatic parent label, notification, email, metadata and audit-target history cannot select an account. Revised non-login model preserves necessary links without provisioning those identities. No human ownership, full text/JSON absence or external provider trust is inferred.

Sixteen shared identities become Soundpub-local application principals; other-app profiles/roles, sessions, credentials and global Auth settings remain excluded. Source user UUID is application linkage, not permission to mutate or migrate the other application. Managed-artist inclusion does not imply interactive login activation.

## Count invariants and selection limits

- Auth: 110 + 16 + 29 + 56 = 211; selected application principals 126, production Phase2 imports zero.
- Local Storage: 582 include + 108 exclude + 1,609 deferred = 2,299.
- External references: 408 include + 198 deferred = 606; deferred external = 16 current optional avatars + 182 historical-only identities.
- Combined identities: 582 + 408 + 108 + 1,807 = 2,905. Add 25 configuration bucket rows only for CSV row total 2,930; no bucket copy approved.
- Local metadata bytes: 11,770,436,527 total; 9,945,025,635 included-candidate bytes. These are metadata claims, not recovered bytes/checksums. SHA-256 object identity digests are not content hashes.

582 reference-linked local candidates are not a whole-bucket or exclusive-ownership approval. Seven shared avatar-owner identities do not establish seven shared byte objects; 20 unknown objects with Soundpub-profile uploaders do not qualify automatically. Future extraction must intersect approved database/Auth/Storage records and stop on conflicts. No broader user-prefix, bucket, filename, email or host-alias expansion is allowed.

## Admission and score

**Database PASS; Auth PASS; Storage PASS BUILD ONLY; Function replacement PASS; Boundary DEFINED; Independent QA PASS; Phase2 READY for synthetic foundation.** No residual foundation scope blocker found in reviewed versions.

**77/100 build recommendation accepted:** source 18/20, database 17/20, Auth/API 18/25, Storage/isolation 11/15, deployment/observability 8/10, cutover/rollback 5/10. Sum 77, threshold 75. Credit increases only database/Auth/Storage scope closure versus Phase1F. It does not award production security, bytes, provider authentication or disaster recovery credit. Partial-credit calibration remains judgment rather than an objective measurement.

**Production cutover remains reported 52/100**, threshold 85; no fresh cutover re-score or acceptance evidence. Build PASS does not imply extraction-ready or cutover-ready.

Mandatory Phase2 conditions: dedicated DB/API/storage/migration schema and application credentials; synthetic fixtures only; no production data/settings/secrets or shared mounts; no production runtime dependency; providers mocked/sandboxed with no live callbacks/actions; no mutations of either Supabase host; gallery disabled. Runtime enforcement is to be built and checked before integrations execute. Separate read-only evidence inspections do not grant new backend production connectivity.

Reopen admission if an essential unresolved identity/file relation appears, selection expands, gallery activates, source hosts alias, production credentials/data enter foundation, or source/shared provider changes become required. Aggregate count equality cannot override any failed gate.

## Deferred risks remain open

Owner/transfer approvals and raw-source custody; complete text/JSON scan and exact reference closure before import; gallery/external origin attestation and byte/checksum recovery; provider subject verification, password/reset/session transition; privileged API/definer/privacy and role matrix remediation; exposed-credential containment; financial provenance failures/Xendit settlement/idempotency; missing Copyright RPC implementation; function drift and provider/legacy callback ownership; clean frontend deployment; encrypted off-host scoped recovery, exact restore and rollback. No production fix, secret rotation or provider operation is authorized by this review.

## Runnable local recheck

Run from repository root with Python 3. Reads local files and runs in-memory synthetic checks only. Input changes require reassessment. This checks contracts, not deployed PostgreSQL or API behavior.

```python
from pathlib import Path
import re
b = Path('docs/migration')
fence = chr(96) * 3
for name in ('PHASE1G_AUTH_INCLUSION_CONTRACT.md',
             'PHASE1G_DATABASE_EXTRACTION_CONTRACT.md',
             'PHASE1G_STORAGE_INCLUSION_CONTRACT.md'):
    text = (b / name).read_text(encoding='utf-8-sig')
    for code in re.findall(fence + r'python\s*\n(.*?)' + fence, text, re.S):
        namespace = {}
        exec(compile(code, name, 'exec'), namespace)
        if 'classify' in namespace:
            sample = next(r for r in namespace['rows'] if r['provider'] == 'external_other')
            for change in ({'identity_sha256': '0' * 64},
                           {'reference_sources': 'soundpub.copyright_registration_files.file_url'},
                           {'current_reference_count': '2'},
                           {'provider': 'gcs', 'identity_sha256': '0' * 64}):
                assert namespace['classify'](dict(sample, **change)) == 'UNKNOWN_BLOCKING'
print('PASS: reconciliations, synthetic non-login proof, adversarial external-reference denial')
```

## Reviewed fingerprints

SHA-256 of final reviewed document bytes; media bytes and credentials not hashed here.

| Input | SHA-256 |
| --- | --- |
| Auth contract | 8c5abfbce306a10ba62add71ba4b41041cd51b0042a17aea65a30646844f08c8 |
| Revised database contract | 7ca39d92957046e20dc604c2a76a405119b27102c92425320a633a3bfb82d9c3 |
| Revised Storage contract | eadea3404772ca950a39750d735cbb646a510ead36d935e06f7ca746337a0ab1 |
| Function map | e357cba3baba51fc303f508d198df274dd527bb215d5600c6ab43f536d25b9bc |
| Revised boundary | 7ecb65eab62345de8f4c29e741b3003c33955dcb31b56241158160a5104d68cf |
| Draft final report | 28e9665e727e676d331a14b20b5721de8e10721778233cd61384c5b7b8cc34df |
| Updated scope summary | 23ff3ca56d2c5cb222bbcf31e5c927e8ffb3fc2bc0b475dc3ed88332907d9d7e |
| Phase1F Storage CSV | 69e0134fabd466c7717c45a6d9af26177f7b2b05ac3ea78696d1d264442b9e30 |
