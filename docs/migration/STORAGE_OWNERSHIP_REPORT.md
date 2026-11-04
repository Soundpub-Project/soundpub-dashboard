# Phase 1B storage ownership and external bytes

Status: **BLOCKED. Storage ownership verified: NO. External migration-required bytes recovered: NOT VERIFIED. Phase 2: NOT READY.**

Agent E observation date: 2026-10-27, Asia/Bangkok. Verification used the inspected origin over SSH to `maskhar@20.20.20.3`, beginning in `/data/supabase/instances/supabase-01/config`. SQL ran in explicit read-only transactions with statement timeouts. No uploads, downloads of asset bodies, signed-URL creation, production mutations, or recovery writes were performed. External probes were credential-free HTTPS HEAD requests only, without redirects, query strings, or reading response bodies. No object keys, URLs containing keys, identity values, or digests are published here.

## Baseline and independently checked scope

Read the full Phase 1B request, `PHASE1_FINAL_REPORT.md`, `SUPABASE_MIGRATION_AUDIT.md`, `STORAGE_AUDIT.md`, `STORAGE_MANIFEST.csv`, `STORAGE_BACKUP_VERIFICATION.md`, `BACKUP_REPORT.md`, `BACKUP_RESTORE_REPORT.md`, and the ownership/restore requirements. The historical 598-object scoped restore PASS remains historical; it is not full current-scope recovery or ownership approval.

Live `storage.objects` contains 2,299 objects in 25 shared buckets. Storage runs `supabase/storage-api:v1.60.4` with `STORAGE_BACKEND=file`; Docker bind mount is `/data/supabase/instances/supabase-01/config/volumes/storage` to `/var/lib/storage`. Container and host mount mapping were independently inspected. Adapter prefix components were resolved in-server rather than assuming that `bucket/key` is a physical path.

The historical selector was executed again and found exactly 598 metadata-matched objects, 9,950,688,219 metadata bytes, and zero unmatched normalized local references in its own scope. The 598 approved-list physical paths were then stat-checked under the confined adapter root: all 598 regular files present, total 9,950,688,219 bytes, no escaping paths or symlink components. A failed initial path interpretation was corrected using the adapter prefix; no missing-source conclusion rests on that initial lookup. Current source bytes were not rehashed per object, and no new restore was created.

An independent complete read of the existing on-host storage archive and selection files matched all three entries in `STORAGE_SHA256SUMS`, with zero mismatches, missing files, or escaping manifest paths. Tar headers show exactly 598 regular members totaling 9,950,688,219 bytes, exact selection path-set equality, and zero duplicate member names. This freshly verifies the existing archive, not an off-host copy, expanded 600-object coverage, or a new restore.

| Bucket | Host objects | Historical referenced selection | Expanded current selection | Public flag observed |
|---|---:|---:|---:|---|
| release-covers | 246 | 246 | 246 | false |
| track-audio | 297 | 297 | 297 | false |
| audio-clips | 8 | 8 | 8 | true |
| payout-proofs | 2 | 2 | 2 | false |
| release-invoices | 2 | 2 | 2 | false |
| avatars | 467 | 22 | 22 | true |
| label-logos | 11 | 3 | 5 | true |
| iccn-gallery | 31 | 18 | 18 | true |
| contracts | 0 | 0 | 0 | true |
| takedown-documents | 0 | 0 | 0 | false |
| track-video | 0 | 0 | 0 | false |
| Total across these buckets | 1,064 | 598 | 600 | Mixed |

## New scope gaps in the historical manifest

The Phase 1 CSV has **1,510 observations**, comprising 1,023 `soundpub_db` reference observations and 487 initial `storage_metadata` observations. Its object-identity digests are not content checksums; initial unreferenced observations can be superseded by later reference evidence. Rows must not be summed as unique files or bytes.

Independent scanning covered all top-level fields and nested JSON string values across all 33 Soundpub tables for recognized GCS and Supabase object URLs. This found omissions outside the historical `(url|path)$` field selector:

- `profiles.logo_url_light` and `profiles.logo_url_dark`: 10 nonempty references, eight distinct legacy Cloud objects across five profiles and two distinct local `label-logos` objects. Both local objects match metadata; together they add **435,430 bytes**, with MIME metadata present. They are not among the historical 598 selected objects.
- `app_settings.value`: one additional distinct GCS image URL, with nonempty bucket/key structure. It was omitted from the CSV's 21 selected local settings references. Its ongoing business requirement is unapproved; it must remain unresolved rather than silently deprecated.
- Audit JSON contains historical references. Including audit history, recognized external provider/object identities total **279 GCS and 140 legacy Cloud**, versus **279 GCS and 128 legacy Cloud** in current direct/settings references. Thus **12 additional legacy Cloud identities occur only in the scanned history**. Audit-only references require retention/disposition review; they are not automatically current required files or safe deletions.

Expanded current local metadata selection is therefore **600 distinct objects, 9,951,123,649 metadata bytes**. Current unselected objects in the scoped buckets reduce from 466 to **464**: 445 avatars, six logos, and 13 gallery objects. They remain UNKNOWN, not proven other-app data or disposable orphans. The archive still covers 598, not 600.

Within the enumerated direct-file fields, known settings links, and the two branding fields, the expanded current reference inventory is **1,034 observations**: 600 local references, 407 GCS/legacy Cloud references, 17 other external avatar references, and 10 placeholders. Placeholders represent eight unique placeholder identities and are not proof of file existence. This is a scoped reconciliation, not proof that arbitrary text, custom providers, audit-retention requirements, or every application-generated reference are covered.

## External HEAD results and affected records

Object identity was deduplicated in-server using provider, hostname/bucket, and decoded normalized object path, with query strings and Supabase public/sign/authenticated URL-mode differences removed. It happened that the baseline's 398 references resolve to 398 distinct provider/object identities; this was checked, not assumed from the reference count. The nine added current external references are distinct from those 398, making **407 current external candidates**. No content-duplicate conclusion is possible without bytes.

| Table/field | Provider | Reference cells / distinct objects | Affected records in that field | Credential-free HEAD result | Business impact |
|---|---|---:|---:|---|---|
| tracks.audio_url | GCS | 111 | 111 tracks | 111 HTTP 403 | HIGH: source audio unavailable for verified recovery |
| tracks.clip_url | GCS | 167 | 167 tracks | 167 HTTP 403 | HIGH: clip access/reproduction unverified |
| app_settings.value | GCS | 1 | 1 setting | 1 HTTP 403 | Requirement unknown; settings image candidate held |
| releases.cover_url | Legacy Cloud | 45 | 45 releases | 45 transport failures | HIGH: cover access/recovery unverified |
| tracks.audio_url | Legacy Cloud | 18 | 18 tracks | 18 transport failures | HIGH: source audio access/recovery unverified |
| tracks.clip_url | Legacy Cloud | 55 | 55 tracks | 55 transport failures | HIGH: clip access/recovery unverified |
| profiles.avatar_url | Legacy Cloud | 2 | 2 profiles | 2 transport failures | MEDIUM: profile imagery; replacement/deprecation requires approval |
| profiles.logo_url_light/dark | Legacy Cloud | 8 | 5 profiles across both fields | 8 transport failures | MEDIUM: label branding; replacement/deprecation requires approval |
| Total | GCS + Legacy Cloud | 407 | Per-field populations overlap | 279 HTTP 403; 128 transport failures | Zero bytes recovered or content-verified |

Counts of affected records are by table/field, not additive across fields. Raw affected-record mappings remain on the source database; they were not exported to repository or chat. An approved encrypted restricted manifest must retain those exact mappings before recovery work.

All legacy Cloud references examined use one hostname; name resolution from the inspected host returned `socket.gaierror` code `-2`. This explains the observed transport failures at that source, but does not prove project deletion, object absence, or failure from every network. GCS HTTP 403 is anonymous denial, not proof that an object exists or is missing. Error-page Content-Length/MIME was not treated as object metadata. No successful file size, file MIME, content checksum, or read authorization was obtained for these external candidates.

The inspected functions-container `GCS_SERVICE_ACCOUNT_KEY`, `GCS_PROJECT_ID`, and `GCS_BUCKET_NAME` are unset/empty. Repository `gcs-upload` is disabled. This proves neither global credential absence nor unavailability to an authorized provider operator; an approved external read identity has not been demonstrated in this session. No old signed URL or frontend credential was reused. The 17 other external avatar URLs were not dereferenced because no external-retention or transfer decision is established.

## Ownership and privacy

An exact application reference proves linkage, not exclusive ownership or permission to transfer. The independent auth review found eight current Soundpub users also linked to other applications. Across all shared storage buckets, **434 objects** have owner metadata matching auth users without a current Soundpub profile. That global count cannot identify the application owner or be used to mark the objects as non-Soundpub. Bucket membership, uploader ownership, and filename prefixes are not sufficient attribution.

Owner derivation must follow business relationships: release creator/label/artist, track-to-release, profile identity, copyright file/contract-to-registration, payout/payment user, takedown document-to-request, and explicitly approved app settings. Audit history is separate evidence with its own retention decision. Joint ownership and shared identities require explicit dispositions rather than automatic copying.

At observation, `contracts` is **public** with zero objects and zero contract rows. There are 10 copyright-registration-file rows; an empty contracts bucket does not prove the legal-document workflow has no sensitive references. Storage policies include a generic authenticated SELECT for private media that is not owner-qualified. These are configuration/source findings, not a completed privacy integration matrix. No owner/other-user/admin/signed-URL expiry/tamper byte-access test was performed by Agent E. Another agent's later privacy change must be verified separately and timestamped; this report does not certify it.

## Canonical manifest acceptance contract

The existing CSV was intentionally preserved under the explicit three-report write scope. It is **not** upgraded to a complete canonical object-level manifest by this report. Authorized manifest work must reconcile the 600 current local objects, 407 current external candidates, 17 other external references, placeholders, and historical-only candidates without flattening observations into files.

| Required field | Current verified coverage | Remaining evidence |
|---|---|---|
| Application/logical owner | Direct links and relationship columns inspected | Approved per-object ownership, shared/excluded/retained dispositions |
| Provider/bucket/key and references | In-server normalized joins and deduplication; no raw values published | Encrypted restricted canonical map with exact affected record IDs |
| Existence/size/MIME | Metadata and physical stat for original 598; metadata for two added logos | External authorized reads; new-logo physical/content checks |
| Content checksum | Historical 598-object restore evidence only | Current per-object checksums, two logos, external bytes; identity digests are insufficient |
| Access class | Current bucket flags and policy source | Owner/other-user/admin/anonymous and URL expiry/tamper integration tests |
| Duplicate relationships | Reference-identity duplicates distinguishable | Content duplicate/equivalence decisions require checksummed bytes |
| Migration status | Historical scoped archive and explicit holds | Every required reference must have a verified final disposition |

Every required reference must resolve to `PRESENT + VERIFIED`, `INTENTIONALLY EXTERNAL + DOCUMENTED`, or `INTENTIONALLY DEPRECATED`. None of the 407 inaccessible current external candidates receives an intentional-external/deprecated waiver here. Only a documented business/retention decision can supply one. Unavailable source audio and covers block the gate regardless of aggregate checksum success on local files.

## Runnable aggregate gap check

Run through the SSH/Compose read-only `psql` method described in the auth report. Expected current observation: eight external branding references and two local metadata matches. This checks the specific manifest omission without returning paths or user data.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
WITH branding AS (
  SELECT fields.value AS reference
  FROM soundpub.profiles AS profiles
  CROSS JOIN LATERAL jsonb_each_text(to_jsonb(profiles)) AS fields
  WHERE fields.key IN ('logo_url_light', 'logo_url_dark')
    AND nullif(fields.value, '') IS NOT NULL
), normalized AS (
  SELECT reference,
    split_part(regexp_replace(reference,
      '^.*?/storage/v1/object/(public/|sign/|authenticated/)', ''), '?', 1) AS object
  FROM branding
)
SELECT
  count(*) FILTER (WHERE reference LIKE '%supabase.co/%') AS external_branding_refs,
  count(*) FILTER (
    WHERE reference NOT LIKE '%supabase.co/%'
      AND EXISTS (
        SELECT 1 FROM storage.objects AS objects
        WHERE normalized.object = objects.bucket_id || '/' || objects.name
      )
  ) AS local_metadata_matches
FROM normalized;
ROLLBACK;
```

## Exact blockers

| ID | Blocker | Closure evidence |
|---|---|---|
| STORAGE-E1 | Object-level application/logical ownership incomplete, including 464 unselected scoped objects and shared users | Restricted canonical per-object ownership/disposition manifest and independent cross-reference review |
| STORAGE-E2 | 407 current external candidates not readable/verified; 17 other external references lack disposition | Authorized read access, encrypted destination, bytes/checksums and restored reference resolution, or approved per-reference disposition |
| STORAGE-E3 | Two additional local logos missing from 598-object archive | Approved scope update, physical/content verification and encrypted backup/restore coverage |
| STORAGE-E4 | Historical JSON adds candidates beyond current reference scope | Retention decision for 12 additional Cloud identities and historical local references; required bytes included |
| STORAGE-E5 | Legal-bucket and generic private-media privacy unverified/unsafe at observation | Private-default configuration plus complete owner/admin/other/anonymous and signed-URL integration matrix |
| STORAGE-E6 | Historical manifest incomplete; current object checksums and full invariant unproven | Reconciled canonical manifest and zero unexplained required DB-reference failures |

No external recovery, broader shared-bucket copy, archive extension, or production metadata change was attempted. Storage PASS cannot be asserted.

## Phase 1C manifest reconciliation — 2026-10-27

**STORAGE OWNERSHIP = NO. EXTERNAL STORAGE = BLOCKED.** All Phase 1B observations above retain their original time and scope. Incident lock remains active. Fresh read-only SQL confirms `contracts.public=false`; the earlier `true` observations above are historical, superseded for that flag only. Owner/admin/other-user and signed-URL behavior remain untested.

The CSV now preserves all 1,510 baseline observations and adds 23: eight current legacy Cloud logos, one current GCS setting, two current local logos and 12 history-only Cloud objects. Total: **1,533 observations**. Local logo metadata is freshly verified: two distinct `label-logos` objects, each 217,715 bytes, MIME `image/png`, total 435,430 bytes. These are metadata sizes, not fresh physical stat or checksum evidence. They remain outside the historical 598-object archive. Their ownership and byte verification remain blocked.

Fresh server-side recursive traversal of string values in tracks, releases, profiles, app settings and audit logs deduplicated external identities by provider, lowercase hostname and decoded bucket/path, excluding query/fragment and Supabase access mode. It confirms **407 current objects (279 GCS, 128 Cloud)** and **12 additional history-only Cloud objects**. All 419 normalized external identities are represented in the revised CSV without publishing raw paths/URLs. The five-table recheck is narrower than the historical 33-table scan and does not independently prove absence of other provider/path formats. See `EXTERNAL_STORAGE_RECOVERY_REPORT.md` for disposition gates.

### Classification rules for every manifest observation

| Observation class | Current decision |
|---|---|
| Current Soundpub DB reference | Soundpub-linked candidate; exclusive/logical ownership and transfer authority unapproved |
| Local metadata referenced by DB | Retain; metadata presence is not content verification |
| Initial metadata observation marked unreferenced | UNKNOWN; never delete or exclude from retention based on that stale selector |
| Current GCS/Cloud reference | Migration candidate, BLOCKED pending authorized recovery or approved disposition |
| History-only Cloud reference | UNKNOWN BLOCKING RETENTION; preserve until legal/business retention decision |
| Other external avatar reference | UNKNOWN external-retention decision; no implicit intentionally-external waiver |
| Placeholder | Reference marker only; no file/byte existence claim |

Rows are observations rather than a final exclusive object list. An added branding reference supersedes an earlier unreferenced classification for the same provider/bucket/key; preserve both evidence rows. `object_key_sha256` hashes normalized bucket/key, not file content; provider must remain part of the identity. Repeated reference identity is not proof of equal content or a verified duplicate. Record and owner digests are pseudonymous linkage, not approved ownership.

The historical current scope remains 600 local metadata objects, 9,951,123,649 metadata bytes, and 464 unselected objects in the enumerated shared buckets. These totals were not fully recounted by the narrower new query. No scope was silently discarded: 17 other external references, ten placeholder observations, shared-bucket UNKNOWNs and historical-only candidates remain held. The CSV remains incomplete as a final ownership/checksum/restore manifest; no claim that every DB reference or migration-required byte is resolved is made.

Remaining blockers: approved per-object logical owner and legal retention; approved disposition for all external objects; physical/content verification and backup of both logos; current content checksums for all required bytes; complete arbitrary-field/provider/path reconciliation; private access and cross-tenant integration tests. Metadata-only evidence and old scoped restores cannot close these gates.
