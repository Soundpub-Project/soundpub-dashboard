# Phase 1C external storage recovery

Date: 2026-10-27, Asia/Bangkok. **EXTERNAL STORAGE = BLOCKED. STORAGE OWNERSHIP = NO. Phase 2 = NOT READY.**

Incident lock remains active. This pass performed read-only SQL over SSH, beginning in `/data/supabase/instances/supabase-01/config`, with explicit read-only transactions, statement timeouts and rollback. No external provider requests, object downloads, signed-URL generation, credential discovery, recovery writes, configuration changes or deployment occurred. Phase 1B HEAD results below are historical, not repeated.

## Reconciled inventory

Fresh recursive string traversal of tracks, releases, profiles, app settings and audit JSON confirmed 419 distinct provider/host/bucket/path identities: 407 with current references plus 12 history-only Cloud objects. Query strings, fragments and Supabase access-mode prefixes are excluded from identity; paths are URL-decoded and hostnames normalized. This does not prove equivalence of file contents. No cross-provider or content deduplication is claimed.

| Owning reference | Provider | Current distinct candidates | Importance |
|---|---|---:|---|
| tracks.audio_url | GCS | 111 | HIGH: source audio |
| tracks.clip_url | GCS | 167 | HIGH: clips |
| app_settings.value | GCS | 1 | UNKNOWN: configured imagery, owner decision required |
| releases.cover_url | Legacy Cloud | 45 | HIGH: release covers |
| tracks.audio_url | Legacy Cloud | 18 | HIGH: source audio |
| tracks.clip_url | Legacy Cloud | 55 | HIGH: clips |
| profiles.avatar_url | Legacy Cloud | 2 | MEDIUM: profile imagery |
| profiles.logo_url_light/dark | Legacy Cloud | 8 | MEDIUM: branding, five profiles |
| Total current | Both | 407 | None approved for omission |
| audit_logs nested JSON, history only | Legacy Cloud | 12 additional | UNKNOWN BLOCKING RETENTION |

`STORAGE_MANIFEST.csv` contains all 419 external object identities using provider/bucket/object-key digests, with table/column and record digest where available. Twelve history-only entries deliberately omit a record digest because the aggregate traversal did not export individual historical record mappings. Exact owner/reference/path mappings remain in the source database and require a restricted recovery register; this public-safe inventory is not sufficient to execute recovery by itself. Bucket labels are not authorization to access a provider.

The CSV also retains 17 other external avatar-reference observations and ten placeholder observations. Those are separate from the 407 GCS/Cloud candidates. No provider classification or retention decision has silently removed them. Local branding adds two metadata objects totaling 435,430 bytes; local audio, covers, clips, invoices, payout proofs, legal/takedown files and galleries remain covered by the companion ownership report's scope and gaps.

## Object evidence and proposed destination

For every one of the 407 current external candidates and 12 history-only identities: existence **UNKNOWN**, object size **UNKNOWN**, content checksum **NOT COMPUTED**, actual object MIME **UNKNOWN**, legal retention **UNAPPROVED**, and approved migration destination **UNASSIGNED**. Error response headers and identity hashes do not supply these fields. Provider recovery must preserve original bytes and MIME and map references to an approved ownership-filtered destination; no new backend/bucket is provisioned in Phase 1C. Business importance above is technical impact, not a legal-retention or loss approval.

Phase 1B observed anonymous HEAD denial for 279 GCS candidates and transport failures for 128 current Cloud candidates. The Cloud hostname failed DNS resolution at that inspected source. These observations prove neither nonexistence nor permanent unrecoverability. Prior inspected functions environment lacked populated GCS configuration; this does not prove credentials are absent elsewhere. No secret search or credential reuse was performed. A provider operator must establish authorized source read access after coordinator release.

## Required dispositions

No final disposition has been established for any candidate. All 419 remain pending and block applicable ownership/recovery gates. `BLOCKED_*` CSV states describe evidence gaps and are not extra final dispositions. A candidate may enter exactly one final disposition only with supporting evidence:

| Final disposition | Evidence needed |
|---|---|
| RECOVERED + VERIFIED | Authorized read, complete bytes, size/MIME/content checksum, protected destination and independent restored read |
| DUPLICATE OF VERIFIED OBJECT | Explicit verified target and content equality plus ownership/retention compatibility; identity repetition alone is insufficient |
| INTENTIONALLY EXTERNAL | Named accountable owner, continued access/availability and backup/retention decision for every reference |
| INTENTIONALLY DEPRECATED | Approved business/legal retirement and replacement/reference treatment |
| UNRECOVERABLE + ACCEPTED BUSINESS LOSS | Documented recovery attempts, explicit accountable acceptance, per-object severity and affected business records |

No loss, deprecation, legal waiver or intentional-external decision is invented here. Audio and cover loss remains HIGH impact. History-only imagery must remain held pending retention review; low apparent business use cannot waive legal retention. Checksummed local files cannot be declared duplicates of external candidates without verified bytes from both.

## Verification and exact blockers

Fresh SQL reconciled 279 current GCS, 128 current Cloud and 12 history-only Cloud objects. CSV reconciliation preserves baseline rows, adds all nine omitted current external references and 12 history-only identities, and adds two local logos. No raw URLs, credentials, identities or file bodies leave the server. The broader historical scan is not replaced by proof that these five tables are exhaustive.

Runnable local inventory check from repository root; no network or production access. This verifies inventory structure only, not recovery or ownership:

```powershell
$rows = @(Import-Csv docs/migration/STORAGE_MANIFEST.csv)
if ($rows.Count -ne 1533) { throw 'Manifest observation count changed; reconcile scope' }
$external = @($rows | Where-Object provider -In @('google_cloud_storage', 'legacy_supabase_cloud'))
$current = @($external | Where-Object reference_source -eq 'soundpub_db' | ForEach-Object { $_.provider + '|' + $_.bucket + '|' + $_.object_key_sha256 } | Sort-Object -Unique)
$history = @($external | Where-Object reference_source -eq 'soundpub_audit_history' | ForEach-Object { $_.provider + '|' + $_.bucket + '|' + $_.object_key_sha256 } | Sort-Object -Unique)
if ($current.Count -ne 407 -or $history.Count -ne 12) { throw 'External inventory mismatch' }
if (@($history | Where-Object { $_ -in $current }).Count) { throw 'History/current identity overlap' }
'Inventory structure PASS; recovery remains BLOCKED'
```

1. Incident lock has no coordinator release; provider recovery and production writes remain prohibited.
2. Authorized external source reads and a protected approved recovery destination are unproven; no external bytes or checksums recovered.
3. Per-object business owner, exact restricted affected-record mappings and legal retention remain unapproved, including shared identities and history.
4. Zero candidates have evidence sufficient for one of the five required final dispositions; 17 other external references also lack approval.
5. Full reference coverage, current local checksums, both additional logo bytes and complete restore/access tests remain unverified.

After coordinator release, recover only approved scope to a protected isolated destination, compute content checksums, reconcile affected references and retain every unresolved row. Only independently verified recovery or explicit approved disposition can close the gate. No production provider calls are authorized by this report.
