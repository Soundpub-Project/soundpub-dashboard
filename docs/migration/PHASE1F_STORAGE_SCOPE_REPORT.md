# Phase 1F Storage scope audit

**Scope: PARTIAL. Deterministic approved migration selection: NO. Exclusive ownership: UNVERIFIED. Storage isolation: FAIL.**

Snapshot: 2026-10-27T20:23:36.911323+07:00 (13:23:36 UTC). Origin: maskhar@20.20.20.3. Every remote inspection began in /data/supabase/instances/supabase-01/config. Main SQL snapshot used REPEATABLE READ READ ONLY, confirmed transaction_read_only=on, with a 90-second statement timeout and 3-second lock timeout.

## Human-readable findings

| Current Storage metadata | Objects | Metadata bytes |
| --- | ---: | ---: |
| Soundpub-attributed (soundpub_owned) | 582 | 9,945,025,635 |
| Other-app-attributed (other) | 108 | 56,995,510 |
| Confirmed shared object references | 0 | 0 |
| Unknown | 1,609 | 1,768,415,382 |
| Total | 2,299 | 11,770,436,527 |

**soundpub_owned means exact current Soundpub DB linkage, not exclusive legal ownership, consent, or transfer approval.** Other-app attribution likewise does not establish exclusive ownership or permission to delete. Absence of a reference does not prove an orphan. Zero confirmed shared objects does not prove absence of sharing.

**20 unknown objects have uploader metadata matching a current Soundpub profile:** 19 in iccn-gallery, one in 3d-models. Seven objects have uploader metadata linked to profile/membership rows in Soundpub and another application; identity overlap does not prove shared bytes. Profile membership, uploader IDs, filenames, bucket names, and user-editable metadata cannot establish application ownership.

The avatars bucket is demonstrably shared: 22 Soundpub-attributed, 26 other-app-attributed, 419 unknown. label-logos and iccn-gallery retain unresolved scope. No whole bucket is approved for copying.

**407 current external GCS/legacy Cloud identities have unverified bytes:** 279 GCS and 128 legacy Supabase Cloud. DB linkage does not establish provider ownership or recovery rights. Twelve additional legacy Cloud identities occur only in history; 17 current external avatar identities also remain unresolved. No external object endpoint was requested. Existence, actual size/MIME, content checksums and read authorization remain unverified.

## Routing-sensitive candidates

Strict classifications exclude references through supabase.carubra.com unless another accepted current reference establishes attribution. Existing routing evidence does not attest that hostname to this origin. Exact bucket/key metadata matches from that host remain candidates.

Including these unverified-host matches would yield 600 Soundpub candidates, 1,577 other-app candidates and 122 unknown objects. The 18 added Soundpub candidates are gallery images in app_settings.value; candidate Soundpub metadata bytes total 9,951,123,649. Primary scope remains 582 / 108 / 1,609. Candidate attribution still cannot establish exclusive ownership or an approved transfer list.

There are 59 distinct .space history-only references absent from current Storage metadata, plus 111 distinct unmatched/unattested-host history-only identities. These observations do not prove current required files are missing. CSV contains 606 reference-only rows, 2,299 local object rows and 25 bucket rows: 2,930 rows total. Reference rows and bucket totals must not be added to local object counts or bytes.

## Bucket inventory

Classifications describe evidence, not legal title. Empty buckets remain unknown. Visibility is bucket configuration, not proven effective access.

| Bucket | Visibility | Scope | Objects | Soundpub-attributed | Other-attributed | Unknown |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 3d-models | public | unknown | 11 | 0 | 0 | 11 |
| article | public | unknown | 1 | 0 | 0 | 1 |
| artikel-media | private | unknown | 66 | 0 | 63 | 3 |
| audio-clips | public | soundpub_owned | 8 | 8 | 0 | 0 |
| avatars | public | shared | 467 | 22 | 26 | 419 |
| blog-covers | public | unknown | 2 | 0 | 0 | 2 |
| certificate | private | unknown | 0 | 0 | 0 | 0 |
| chatten-media | private | other | 6 | 0 | 6 | 0 |
| contracts | private | unknown | 0 | 0 | 0 | 0 |
| daily-report | public | unknown | 1109 | 0 | 13 | 1096 |
| gallery | public | unknown | 18 | 0 | 0 | 18 |
| iccn-gallery | public | unknown | 31 | 0 | 0 | 31 |
| label-logos | public | unknown | 11 | 5 | 0 | 6 |
| learning | public | unknown | 1 | 0 | 0 | 1 |
| lelanganproperti | public | unknown | 20 | 0 | 0 | 20 |
| mentor | public | unknown | 0 | 0 | 0 | 0 |
| payout-proofs | private | soundpub_owned | 2 | 2 | 0 | 0 |
| release-covers | private | soundpub_owned | 246 | 246 | 0 | 0 |
| release-invoices | private | soundpub_owned | 2 | 2 | 0 | 0 |
| school-logo | public | unknown | 0 | 0 | 0 | 0 |
| takedown-documents | private | unknown | 0 | 0 | 0 | 0 |
| task | public | unknown | 0 | 0 | 0 | 0 |
| template | public | unknown | 1 | 0 | 0 | 1 |
| track-audio | private | soundpub_owned | 297 | 297 | 0 | 0 |
| track-video | private | unknown | 0 | 0 | 0 | 0 |

## Evidence and limitations

Scanned 195 base/partitioned application tables across 11 schemas: artikel, buzzerhood, carubra, carubra_db, chatten_cafe, honda, public, soundpub, utero-artikel, utero_academy, whatsapp. System schemas, Auth credential tables and application views were excluded; Storage metadata was read separately. Selected text, JSON/JSONB, array and ownership/link fields were scanned in-server; credential/contact columns were excluded. Nested JSON and JSON serialized in text were traversed. Raw source values stayed on-server.

Matching used exact bucket/key after stripping URL query/fragment and decoding percent escapes once. Accepted local URL host: supabase.carubra.space. The .com exact metadata matches remain candidates. Bucket-qualified relative paths and globally unique exact object keys also supplied evidence; ambiguous matches were not attributed. Audit/revision/archive/log/backup tables were separated from current references. Arbitrary embedded text, uncommon URL encodings, custom providers, omitted fields and app-only configuration can contain unrecognized references.

Business identity evidence follows track/payment-to-release, file/contract-to-registration and document-to-takedown-request links, plus direct ownership/uploader fields. Foreign keys were inspected. Uploader metadata (owner) and reference-derived business identities (business_owner_sha256) remain separate. owner_applications records profile/membership evidence only. Metadata application hints are exported only as present/absent and never trusted for authorization.

Storage image: supabase/storage-api:v1.60.4. Backend: file. Bind mount: /data/supabase/instances/supabase-01/config/volumes/storage to /var/lib/storage. No file stat, object read or archive inspection occurred. object_exists=metadata_only does not establish physical bytes. Size and MIME are metadata claims. No content checksum was computed.

Eight live storage.objects policies were inspected. SoundPub authenticated read private buckets grants authenticated SELECT on release-covers, track-audio and track-video using only bucket membership, without object-owner or Soundpub-membership restriction. Upload/update/delete use UID-prefix or Soundpub-admin predicates on listed buckets, without independently proven application isolation. contracts is private and empty, with no contracts-specific object policies. No real-role access, signed URL, expiry, tamper, public-download or cross-tenant byte test ran. Static isolation finding: FAIL. Empty buckets do not prove privacy.

## CSV contract and privacy

First 11 fields preserve prior manifest contract: logical_record, provider, bucket, key, owner, application, visibility, size, mime, checksum, final_disposition. The visible request did not enumerate another field list; evidence fields were appended.

row_type separates object, bucket and external_reference. scope_classification is conservative application attribution; candidate_scope_classification additionally admits unverified-host metadata matches for object rows. current_reference_count excludes these host candidates; unverified_host_reference_count records them separately. Reference counts measure distinct table/record/column/method evidence tuples, not files or URL occurrences. exclusive_ownership is UNVERIFIED throughout.

key hashes normalized bucket/key; path_sha256 hashes normalized key alone. identity_sha256 binds provider and bucket, and additionally hostname for external identities, using NUL separators. These SHA-256 identity digests are not content hashes. logical_record contains schema/table/column and hashed record identity. Owner and business identity fields contain SHA-256 digests. External bucket/host labels are hashed. No raw object paths, source URLs, signed queries, names, contact details, UUIDs, credentials or metadata values are exported. Digests are pseudonymous correlation data, not encryption.

Object/reference checksums are NOT_COMPUTED. Unknown external size/MIME stay UNKNOWN. final_disposition records conservative hold/exclusion recommendations, not owner-approved legal dispositions. No object has transfer approval. Raw private mappings remain in production; this CSV alone cannot execute recovery.

## Gate decision

| Gate | Result | Reason |
| --- | --- | --- |
| Local metadata coverage | PASS | All 25 buckets and 2,299 objects reconcile within one snapshot. |
| Application scope attribution | PARTIAL | 582 Soundpub-attributed, 108 other-attributed, 1,609 unknown; host candidates separate. |
| Exclusive ownership / approved disposition | FAIL | Legal approvals, shared-owner agreements and complete dispositions absent. |
| Storage isolation | FAIL | Broad private-media authenticated SELECT; real access matrix untested. |
| Bytes / external recovery | FAIL | 407 current external identities lack verified bytes; none retrieved. |
| Deterministic approved migration selection | NO | Ownership, unknown/shared scope, routing and byte verification unresolved. |

Matching rules give a reproducible candidate inventory for this snapshot, not an approved migration selection. Required closure: attest hostname mappings; resolve required identities and unknown/shared objects with application/legal owners; approve exclusions and retention; then authorize byte verification and access isolation tests.

No object copying/downloads, backups, signed URLs, production mutations, deployments, reloads or configuration changes occurred. Only the two requested local deliverables were created/edited.

## Runnable local check

Run from repository root with Python 3. Checks reconciliation and obvious raw identifiers/secret patterns; does not prove legal ownership or replace secret scanning.

```python
import csv, collections, pathlib, re
p = pathlib.Path("docs/migration/PHASE1F_STORAGE_SCOPE.csv")
with p.open(encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    assert set("logical_record provider bucket key owner application visibility size mime checksum final_disposition".split()) <= set(reader.fieldnames)
    rows = list(reader)
assert collections.Counter(r["row_type"] for r in rows) == {"bucket": 25, "object": 2299, "external_reference": 606}
objects = [r for r in rows if r["row_type"] == "object"]
assert collections.Counter(r["scope_classification"] for r in objects) == {"soundpub_owned": 582, "other": 108, "unknown": 1609}
assert sum(r["scope_classification"] == "unknown" and r["owner_soundpub_profile"] == "true" for r in objects) == 20
assert sum(r["row_type"] == "external_reference" and r["provider"] in {"gcs", "legacy_supabase_cloud"} and int(r["current_reference_count"]) > 0 for r in rows) == 407
assert len({r["identity_sha256"] for r in rows}) == len(rows)
assert {r["observed_at"] for r in rows} == {"2026-10-27T20:23:36.911323+07:00"}
for r in rows:
    assert r["exclusive_ownership"] == "UNVERIFIED"
    assert r["checksum"] == ("NOT_APPLICABLE" if r["row_type"] == "bucket" else "NOT_COMPUTED")
    for field in ("identity_sha256", "key", "path_sha256"):
        assert (r["row_type"] == "bucket" and field != "identity_sha256" and r[field] == "NOT_APPLICABLE") or re.fullmatch(r"[0-9a-f]{64}", r[field])
    for field in ("owner", "business_owner_sha256"):
        assert all(re.fullmatch(r"[0-9a-f]{64}", v) for v in r[field].split(";") if v)
    assert all(not v.startswith(("=", "+", "-", "@")) for v in r.values())
text = p.read_text(encoding="utf-8-sig")
assert not re.search(r"https?://|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|-----BEGIN .*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{12,}\.", text)
assert sum(int(r["size"]) for r in objects) == 11770436527
print("PASS: counts, identities, digests, metadata bytes, raw URL/email/UUID/key-pattern checks")
```
