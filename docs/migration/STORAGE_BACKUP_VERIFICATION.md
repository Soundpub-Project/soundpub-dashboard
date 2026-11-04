# Independent Phase 1 storage backup verification

Status: **PASS — scoped archive integrity, isolated extraction and all 598 restored/source SHA-256 comparisons verified.** Full migration/privacy readiness is outside this PASS.

Comparison completed 2026-10-27 04:26:45 Asia/Bangkok (2026-10-26T21:26:45Z, server-reported UTC).

Verification performed through SSH `maskhar@20.20.20.3`, working from `/data/supabase/instances/supabase-01/config`. Backup: `phase1-backups/20261026T200848Z`. Production storage and selection artifacts are read-only throughout this verification.

## Evidence saved before cleanup

| Check | Independent result |
|---|---|
| Writer completion | `storage-backup.status` contains `PASS`; `STORAGE_SHA256SUMS` populated |
| Archive bytes | 9,953,083,392 |
| Archive SHA-256 | `0c5f0d18f465dcecd6d7d3ac80ed29cb7229d8e26d4bf28a5c30e05f7c6868b1`; independent full read matches writer checksum |
| `storage-files.list` SHA-256 | `39a8a545a3c233423ab01d3b2e115885a74cfcc7caf05a93afdb71a8d0362535`; matches writer checksum |
| `storage-object-selection.tsv` SHA-256 | `7a981df0d341d30872e618fb692c1a8a5303c147b16ed78868f4078a8b0ebc1d`; matches writer checksum |
| Selection | 598 unique physical paths; 598 unique selected logical objects |
| Archive inventory | Exactly 598 regular files; exact unordered path-set equality with `storage-files.list`; no duplicate or extra members, directories, links or special entries |
| Metadata reconciliation | Archive member sizes and selected source file sizes match each selected object's metadata; total 9,950,688,219 bytes |
| Versioned path mapping | Removing only the final version component maps physical paths exactly to all selected bucket/object identities |
| Path confinement | Relative paths only; no empty, dot or parent components; source resolution stays within the confirmed storage adapter root; no source symlinks |
| Restore | All 598 files extracted into an isolated backup subdirectory; 9,950,688,219 restored bytes; root and all nested directories verified `0700`, files `0600`; no symlinks or group/other permission bits |
| Byte comparison | 598/598 source-versus-restored SHA-256 matches; all 598 source size/inode/mtime checks stable during hashing; restored byte total exactly 9,950,688,219 |
| Final inventory | Zero extra archive paths and zero extra restored paths; exact restored path-set equality with selection |
| Cleanup | PASS: after saving evidence, removed only `restore-independent-qa-ocsoncld` and its 598 files; absolute path/direct-child confinement verified before removal; absence verified afterward |

The independent verifier exited successfully with `PASS: true`. Initial extraction directory was `storage-independent-qa-ocsoncld`; after verification it was renamed within the same backup directory to meet the requested `restore-*` cleanup guard. The validated cleanup target is `/data/supabase/instances/supabase-01/config/phase1-backups/20261026T200848Z/restore-independent-qa-ocsoncld`. No other extracted directory is in cleanup scope.

Cleanup completed 2026-10-27 04:27:59 Asia/Bangkok (2026-10-26T21:27:59Z). Archive, selection manifests, `STORAGE_SHA256SUMS`, `SHA256SUMS` and writer status retain the same inode, size and nanosecond modification time across cleanup. Both selection-manifest SHA-256 values were checked again and still match. Production source storage was never modified. Only this repository report was written by this QA task.

## Scope and privacy limits

The Compose storage mount resolves to `volumes/storage` at `/var/lib/storage`; the selected versioned files resolve under `volumes/storage/stub/stub`. No production file is extracted, overwritten, deleted or renamed. No selector, manifest, checksum file or archive is modified. Raw object keys, source file digests, URLs and secrets are excluded from this report and terminal output.

Exact archive/allowlist equality excludes additional unselected shared objects; it does not establish exclusive ownership or legal permission for selected objects that may be referenced by multiple applications. This test does not independently regenerate the DB selector or prove complete coverage of external GCS/legacy Cloud objects, other versions, omitted references or unknown shared objects.

Filesystem modes restrict ordinary group/other access; they do not restrict root, the owning account or privileged host administrators. No encryption-at-rest, off-host redundancy, ACL audit, application authorization, bucket privacy, RLS or signed-URL behavior is established. This is an on-host byte restoration check, not a full Supabase API/database metadata restore or disaster-recovery sign-off.

Source comparison reads each selected versioned source and each restored file once, sequentially, using SHA-256. Source size, inode and nanosecond modification time are checked before/after its hash read. This is per-file stability evidence, not an atomic DB/storage snapshot or a guarantee against later source changes. Archive integrity uses a separate full archive SHA-256 read; manifest checksums cover their exact bytes.
