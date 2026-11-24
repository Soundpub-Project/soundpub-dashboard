# 04 — Database and Backup Audit

Status: **BACKUP COPIED TO BACKEND; SHA-256 PASS; GCM AUTH PASS (24/24); SCHEMA DIFF IN PROGRESS**

## Backup inventory

Source directory: `C:\soundpub\soundpub-20.20.20.173-20261030-212240`

Local working copy: `backend/backups/soundpub-20.20.20.173-20261030-212240` (git-ignored; source preserved).

The local copy contains 25 files (24 listed artifacts plus `SHA256SUMS.txt`) totaling 10,047,171,204 bytes. All 24 listed artifacts match their recorded SHA-256 hashes; `SHA256SUMS.txt` also matches the source. AES-256-GCM authentication passed on 2026-11-24 with a supervisor-provided 32-byte key: 24 `OK` lines, `Verified 24 files`, exit code 0. No decrypted data was produced by the verifier.

`SHA256SUMS.txt` lists 24 artifacts and all 24 are present, including:

- `soundpub-schema.dump.enc` — PostgreSQL custom dump of schema `soundpub`; documented as 33 tables with schema and data (`C:\soundpub\soundpub-20.20.20.173-20261030-212240\README.md:5`).
- `auth/*.csv.enc` — rows for 198 users from `soundpub.profiles`, including identities, sessions, refresh tokens, MFA, and OAuth records (`README.md:6`).
- `storage/*.csv.enc` — 2,339 Storage object records, bucket definitions, and applicable policies (`README.md:7`).
- `storage/soundpub-storage.tar.gz.enc` — 2,409 physical files from SoundPub buckets and matching avatar directories, including version files and sidecars (`README.md:8`). Archive size is 10,042,365,802 bytes.
- `MANIFEST.txt` and `SHA256SUMS.txt` — source details and artifact hashes (`README.md:9`).

The export is explicitly a scoped export, not a one-command restore. Database, Auth, and Storage exports were produced sequentially while the source was live, not as one atomic snapshot (`README.md:25`). This weakens point-in-time consistency evidence and must be accounted for before any restore or reconciliation.

## Encryption and verification

The backup uses AES-256-GCM with a 32-byte key. `verify.cjs:25-37` checks the `SPBK1` header, 12-byte nonce, trailing 16-byte auth tag, and streams every `.enc` artifact through a decipher without writing plaintext.

The key was supplied by supervisor `bimok` on 2026-11-24. Its contents are intentionally not recorded here. Two 32-byte copies were checked: one in a OneDrive-synced desktop path and one in the non-synced backup source directory. Both produced 24 `OK` lines, `Verified 24 files`, and exit code 0. Prefer the backup-source copy for future runs; the OneDrive copy should be moved or removed. No key material was copied into the repo.

Verification result on 2026-11-24: `OK` for all 24 `.enc` artifacts, `Verified 24 files`, `ExitCode=0`. Local copy SHA-256 result remains `Verified=24`, `SHA256SUMSMatch=True`, `Hash verification passed`. GCM authenticity is now proven for the copied artifacts.

Verification command, when a local key path is supplied:

```powershell
node "C:\soundpub\soundpub-20.20.20.173-20261030-212240\verify.cjs" "<local-key-file-path>"
```

Expected successful output: one `OK <relative-path>` line per `.enc` artifact and `Verified 24 files`. `verify.cjs:41-44` sets a non-zero exit code on failure. The verifier creates no files and emits no plaintext.

## Decryption safety

The original `decrypt.cjs` must not be executed from its current location. Its output-root logic resolves to `C:\` when the backup itself is on `C:\`, which makes all `C:\` destinations invalid and any `D:\` destination acceptable without repo/OneDrive protection. A hardened replacement exists at `scripts/backup-decrypt-safe.mjs`. It requires a 32-byte key and `SPBK1` header, allowlists artifacts from `SHA256SUMS.txt`, verifies ciphertext SHA-256 before decrypt, validates the AES-256-GCM auth tag, refuses output inside the repository, OneDrive, or backup directory, refuses overwrite, and deletes partial output on failure.

Synthetic fixture tests on 2026-11-24 confirmed correct-key round-trip, wrong-key rejection with no leftover output, rejection of repository/backup-directory outputs, and overwrite rejection. No real artifact was decrypted, extracted, restored, or uploaded. See `15-key-handoff-runbook.md` for the post-key procedure.

## Schema evidence gap

The previous audit reports 33 live tables and 14 deployed Edge Functions differing from repository state (`SUPABASE_MIGRATION_AUDIT.md:124`). Current worktree contains 33 SQL files under `supabase/migrations`, but the live schema was not inspected because production contact is forbidden. A schema-only decrypted view from the verified backup is required before claiming parity.

`docs/audit/14-static-schema-diff.md` now provides a repository-only comparison: 33 Supabase SQL files with mixed 8/14-digit prefixes and duplicate day prefixes versus 81 contiguous backend migrations. It reports name-level overlap and statement counts but explicitly does not prove definition equivalence, applied state, effective grants, RLS expressions, function bodies, or final object state. It does not replace `docs/migration/CANONICAL_SCHEMA.sql`, `docs/migration/DATABASE_OBJECT_MANIFEST.md`, or `docs/migration/SCHEMA_DRIFT_REPORT.md`.

`docs/audit/16-backup-schema-metadata.md` records metadata extracted from the verified schema dump: 33 tables, 56 functions, 78 policies, 47 triggers, 43 foreign keys, 4 enums, and 32 RLS entries match the inspected live manifest. Definition-level comparison remains required.

Required comparisons after verification:

1. Backup schema `soundpub` vs `supabase/migrations` cumulative schema.
2. Backup schema vs backend migrations `backend/migrations/0001` through `0081`.
3. Table, column, type, default, nullability, constraint, index, foreign-key, trigger, function, policy, and role-grant drift.
4. Financial table/column drift, especially payment invoice columns checked at `backend/src/main.ts:55-70`.
5. Auth and Storage metadata shape before any migration plan that touches users or files.

## Restore/migration posture

Do not restore this backup into a production or staging Supabase instance without a separate plan. The README states that restoration requires a compatible Supabase installation, deliberate foreign-key ordering, and separate migration planning (`README.md:25`).

## Gate

Backup verification is now satisfied: the local copy passes SHA-256 and all 24 artifacts pass GCM authentication. Schema-only decryption may proceed to an explicit non-repo, non-OneDrive path. Restore, migration replay, and cutover still require separate approval and a rehearsal.
