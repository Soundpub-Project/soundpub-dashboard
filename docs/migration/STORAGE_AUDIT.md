# Storage audit

Observed 2026-10-27 (Asia/Bangkok). Status: BLOCKED for complete migration; verified DB-reference scope available for staged backup. Production unchanged. No object bytes downloaded, moved or deleted; no signed URLs or object keys printed. Host metadata: 25 buckets, 2,299 objects shared across applications.

## Immediate scoped backup selection

| Bucket | Host objects | Exact Soundpub references matched | Decision |
|---|---:|---:|---|
| release-covers | 246 | 246 | Include exact referenced keys |
| track-audio | 297 | 297 | Include exact referenced keys |
| audio-clips | 8 | 8 | Include exact referenced keys |
| payout-proofs | 2 | 2 | Include exact referenced keys |
| release-invoices | 2 | 2 | Include exact referenced keys |
| avatars | 467 | 22 | Include 22; hold remaining 445 |
| label-logos | 11 | 3 | Include 3 settings-referenced keys; hold 8 |
| iccn-gallery | 31 | 18 | Include 18 settings-referenced keys; hold 13 |
| contracts | 0 | 0 | Record unsafe public configuration; no bytes |
| takedown-documents | 0 | 0 | Configuration only |
| track-video | 0 | 0 | Configuration only |

598 distinct metadata-matched objects, 9,950,688,219 metadata bytes (9.95 GB / 9.27 GiB). 11 GB is an operational capacity estimate, not verified Soundpub byte total. Archive overhead, versions, metadata and source churn require extra headroom. Metadata existence is not byte existence or checksum proof. Exact DB reference proves application linkage, not exclusive legal ownership.

Shared avatars: only 22 exact self-hosted references in profiles.avatar_url / artist_profiles.profile_image_url match storage.objects. Folder-prefix membership matches 20 objects, owner metadata membership matches 22; these are different predicates and must not replace exact selection. Remaining 445 are unknown, not proven other-app data or deletable orphans. Likewise hold unreferenced gallery/logo objects even when uploader has a Soundpub profile.

## Executable read-only key selector

Run inside existing SSH Docker directory using db psql, BEGIN READ ONLY. Keep raw output in protected backup workflow, not repository/chat. Selector outputs bucket/key/size for all 598 currently matched objects; recheck counts immediately before backup. Do not print value of app_settings, which may contain secrets. SQL reads candidate URL strings in-server and returns only matched object keys. This query does not initiate backup.

```sql
BEGIN READ ONLY;
WITH rows AS (
 SELECT to_jsonb(r) j FROM soundpub.releases r
 UNION ALL SELECT to_jsonb(r) FROM soundpub.tracks r
 UNION ALL SELECT to_jsonb(r) FROM soundpub.profiles r
 UNION ALL SELECT to_jsonb(r) FROM soundpub.artist_profiles r
 UNION ALL SELECT to_jsonb(r) FROM soundpub.copyright_contracts r
 UNION ALL SELECT to_jsonb(r) FROM soundpub.copyright_registration_files r
 UNION ALL SELECT to_jsonb(r) FROM soundpub.payout_requests r
 UNION ALL SELECT to_jsonb(r) FROM soundpub.release_payments r
 UNION ALL SELECT to_jsonb(r) FROM soundpub.takedown_request_documents r
), refs AS (
 SELECT e.key, e.value val FROM rows
 CROSS JOIN LATERAL jsonb_each_text(j) e
 WHERE e.key ~ '(url|path)$'
 AND e.key NOT IN ('xendit_invoice_url','spotify_artist_url')
 AND nullif(e.value,'') IS NOT NULL
 UNION ALL
 SELECT 'settings_url', m[1] FROM soundpub.app_settings s
 CROSS JOIN LATERAL regexp_matches(s.value,'https?://[^"[:space:]<>]+','g') m
), normalized AS (
 SELECT CASE
 WHEN val LIKE '%/storage/v1/object/%' THEN
 split_part(regexp_replace(val,'^.*?/storage/v1/object/(public/|sign/|authenticated/)',''),'?',1)
 WHEN key='payment_proof_path' THEN 'payout-proofs/'||val
 WHEN key='invoice_pdf_path' THEN 'release-invoices/'||val
 WHEN key='storage_path' THEN 'takedown-documents/'||val
 END obj FROM refs WHERE val NOT LIKE '%supabase.co/%'
)
SELECT o.bucket_id, o.name, o.metadata->>'size' size_bytes
FROM storage.objects o
WHERE o.bucket_id IN ('contracts','release-covers','track-audio','audio-clips',
'avatars','label-logos','iccn-gallery','payout-proofs','release-invoices',
'takedown-documents','track-video')
AND EXISTS (SELECT 1 FROM normalized n WHERE n.obj=o.bucket_id||'/'||o.name)
ORDER BY o.bucket_id,o.name;
ROLLBACK;
```

## Manifest interpretation and coverage

STORAGE_MANIFEST.csv uses SHA-256 object identity (bucket/key), record IDs and owner IDs; no raw paths, UUIDs, signed query parameters or URLs. These hashes are NOT content checksums. URL normalization removes public/sign/authenticated prefix and query string. Non-cloud Supabase-style URLs are self_hosted_candidate until exact metadata join; host equality is not verified. Percent-encoded keys and uncommon URL forms require review; placeholders are not missing objects. MIME/size come from metadata, not byte inspection. Owner is direct record owner where available, not proof of tenant consent; registration-linked contract/file ownership requires join review.

Initial scan: 1,002 nonempty DB file references; 1,000 unique provider/object identities including placeholders. Providers: 278 GCS, 120 legacy Supabase Cloud, 17 other external URLs, 10 pending placeholders, 573 self-hosted candidate URLs, 4 local paths. Thus 398 GCS/Cloud references now, versus historical 396; references are not unique files. 577 initial local references matched 577 unique objects. Settings URL extraction adds 21 objects (3 logos, 18 gallery), yielding 598. Initial 487 unreferenced candidate objects reduce to 466 unresolved after settings review. CSV retains initial metadata observations and adds settings-reference rows: 21 initial unreferenced rows are superseded by referenced rows sharing object_key_sha256. Deduplicate by provider-independent local bucket/object_key_sha256 and prefer referenced evidence; do not sum CSV rows as objects or bytes. The manifest contains 1,510 observations, not 1,510 files.

Scanned tables: releases, tracks, profiles, artist_profiles, copyright_contracts, copyright_registration_files, payout_requests, release_payments, takedown_request_documents; settings URLs extracted separately. Excludes payment checkout URLs and Spotify profile URLs. Arbitrary JSON/nested metadata, generic external providers, historical backups, unrepresented storage buckets and local filesystem references may remain; completeness not PASS. Proven other-application ownership is not assigned from bucket membership alone. Unknown objects never automatically migrated.

## Visibility, orphan and checksum feasibility

contracts is public with no MIME/size constraints despite legal document workflow. Covers/audio/video are private but all authenticated users can SELECT them under generic policy; signed URL access must be owner-scoped with short expiry. Public avatars/logos/gallery/clips are current business behavior, pending privacy review. Private proofs/invoices lack explicit client policies. No privacy behavior was tested by retrieving document bytes.

Database URL removal/upload failure can leave unreferenced objects; this inventory cannot prove orphan deletion safety. Check historical records, all tenant references, pending uploads and retention/legal requirements before labeling orphans. Repeated identity is not content duplication. At initial audit, byte SHA-256 coverage was 0% and restore was unverified; the later scoped backup addendum supersedes this for the 598 selected self-hosted objects only. ETag must not be treated as SHA-256, especially multipart uploads.

Storage Docker mount verified: /data/supabase/instances/supabase-01/config/volumes/storage to /var/lib/storage. For approved scoped backup, resolve physical adapter layout from configuration without printing secrets; do not assume bucket/key equals filesystem path. Hash bytes while streaming exact allowlist into encrypted off-host archive, hash restored bytes independently and reconcile size/count. Preserve object metadata and bucket configuration. External GCS/Cloud needs separate read credentials and exact reference allowlists; do not reuse expired signed URLs or copy whole legacy buckets. Backup-run metadata remains two failures, zero logged objects. No backup/restore success claimed.


## Scoped backup and restore result

On-host allowlisted backup and independent byte restore **PASS**: archive SHA-256 passed; exact 598 regular members; 9,950,688,219 restored bytes; zero extra paths; 598/598 source-versus-restored SHA-256 matches; extracted QA copy removed safely. See STORAGE_BACKUP_VERIFICATION.md. This does not change ownership status: selected references are not exclusive legal ownership, 398 external GCS/legacy Cloud references and unresolved shared objects remain outside backup, and privacy behavior was not tested.

## Phase 1B addendum — 2026-10-27

The live `contracts` bucket public flag is now `false`; zero objects and zero contract rows existed at the preconditioned change. Complete owner/admin policies and signed-URL integration are not deployed, so full contracts privacy remains FAIL. External/reference coverage now identifies 407 external candidates and two local logo references omitted from the historical archive; full ownership remains NO. See `CONTRACTS_PRIVACY_REPORT.md` and `STORAGE_OWNERSHIP_REPORT.md`.
