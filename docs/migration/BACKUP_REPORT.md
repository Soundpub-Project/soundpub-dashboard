# Phase 1 backup report

Status: database **PASS**; scoped storage archive **PASS** (full Soundpub ownership/disaster recovery still BLOCKED). Observed 2026-10-27 (Asia/Bangkok). Production host `maskhar@20.20.20.3`; working directory `/data/supabase/instances/supabase-01/config`.

## Database

- 2026-10-26T20:08:48Z backup directory: `/data/supabase/instances/supabase-01/config/phase1-backups/20261026T200848Z`; host-only, mode 0700. Do not copy to repository or public storage.
- `docker compose exec -T db pg_dump -U postgres -d postgres -Fc`: full shared `postgres` database, including Soundpub, auth, storage metadata, and other tenants; archive approximately 5.2 MiB. `pg_dumpall --globals-only` gzip archive approximately 1.8 KiB provides host roles. Files mode 0600.
- `SHA256SUMS` in same private directory; `sha256sum -c` passed for both. PostgreSQL 17.6 archive; pg_restore TOC contains 3,347 lines. No secret values, rows or checksums published here.
- Original archive reflects state **before** Phase 1 live DB security migration. A second current-state archive, `postgres.post-remediation.dump`, was captured after the policy/grant fix; `POST_REMEDIATION_SHA256SUMS` passed. This archive was restored separately with grants and passed scoped object/row and security-grant checks. The first archive remains a before-image for rollback; restoring it requires replaying `supabase/migrations/20261026202235_harden_database_security_boundaries.sql`. Initial 0600 permissions protect at-rest content from other OS users but no encryption or off-host copy exists. Shared host failure still loses this backup. Disk space 853 GiB available at backup time.

## Storage

- Selector from `STORAGE_AUDIT.md` matched 598 Soundpub-referenced metadata objects and exactly 598 physical versioned files, with each physical size matching metadata; 9,950,688,219 metadata bytes. Includes 22 specifically matched avatars and 18 specifically matched `iccn-gallery` objects; unknown shared objects excluded.
- Private backup source list: `storage-object-selection.tsv`; versioned filesystem manifest: `storage-files.list`. Archive: `soundpub-storage.tar` in same private backup directory. Production storage mount remains untouched. Archive checksum and manifest checksum PASS (`STORAGE_SHA256SUMS`, 9,953,083,392-byte tar). Independent isolated extraction verified exact 598-member allowlist, 9,950,688,219 restored bytes, zero extras, and 598/598 source-versus-restored SHA-256 matches; private restore directory was safely removed after evidence capture.
- The 598 objects are source-reference candidates, not exclusive legal ownership. Missing external Cloud/GCS objects and non-matching/unknown shared objects are **not** backed up. Metadata-to-filesystem size match does not establish content integrity.
- Archive scope excludes the 445 non-matching avatars and 8 non-matching label logos. Legacy external media and bucket-specific privacy require separate recovery work.

## Operations

- Backup artifacts contain full shared-host database and Soundpub-linked bytes, including private data. Retain 0700 directory/0600 files; never commit or expose object keys. Storage manifest CSV is intentionally git-ignored by global `*.csv`; if publishing documentation is approved, sanitize and explicitly stage it.
- Backup has no demonstrated encryption, off-host copy, immutable retention, or recoverable disaster scenario. Current backup is **not** a substitute for production backup policy or a Phase 2 cutover snapshot.
## Phase 1B addendum — 2026-10-27

Off-host database and storage backup remain **NOT VERIFIED**. No sensitive archive transfer occurred because scope authorization, encryption recipient/key custody, protected destination and restore containment were not established. Existing on-host checksums remain valid only for their historical scoped copies. See `OFFSITE_BACKUP_REPORT.md`.
