# 15 — Backup Key Handoff and Post-Key Runbook

Status: **KEY PROVIDED; VERIFICATION PASSED — DO NOT BYPASS NEXT GATES**

This runbook covers the local 2026-10-30 encrypted backup only. It does not authorize production contact, restore, migration replay, or cutover. No key material belongs in this repository, chat, prompts, logs, source code, frontend env vars, or generated reports.

## Current state

- Backup source: `C:\soundpub\soundpub-20.20.20.173-20261030-212240` — untouched.
- Local working copy: `backend/backups/soundpub-20.20.20.173-20261030-212240` — git-ignored.
- 24 listed artifacts pass SHA-256; `SHA256SUMS.txt` matches the source.
- AES-256-GCM authentication passed on 2026-11-24: 24 `OK` lines, `Verified 24 files`, exit code 0.
- The key was supplied by supervisor `bimok`; its contents are not recorded here. A 32-byte copy exists in the non-synced backup source directory and another in OneDrive-synced storage; both verified 24/24. Prefer the backup-source copy and move/remove the OneDrive copy.
- The original `decrypt.cjs` is not approved for execution.

## Supervisor handoff options

### Option A — supervisor runs the read-only verifier

1. Supervisor opens a terminal in the backup directory on the key-holding machine.
2. Supervisor runs:

```powershell
node ".\verify.cjs" "<local-key-file-path>"
```

3. Required result: one `OK <relative-path>` line per artifact and `Verified 24 files`.
4. Share only the pass/fail summary and exit code. Do not paste key bytes or decrypted data.

### Option B — supervisor provides the key file path

1. Supervisor copies the key to a local path outside this repository and outside OneDrive.
2. Supervisor sends only the path string, for example `C:\Keys\<name>.key`.
3. The key file must not be copied into `Soundpub`, `backend/backups`, or any synced folder.
4. The local operator runs the verification command below and reports only the summary.

## Verification result

```powershell
node "backend\backups\soundpub-20.20.20.173-20261030-212240\verify.cjs" "<local-key-file-path>"
```

Result on 2026-11-24: 24 `OK` lines, `Verified 24 files`, exit code 0. The same result was reproduced with the key copy in the backup source directory. The verifier wrote no plaintext.
 Stop on any auth failure, malformed header, wrong key length, or missing artifact. Do not decrypt anything when verification fails.

## Safe schema-only decrypt

After verification passes, decrypt only `soundpub-schema.dump.enc` to an explicit output outside the repository and outside OneDrive. Use the hardened helper, not the original `decrypt.cjs`:

```powershell
npm run backup:decrypt -- "<local-key-file-path>" "soundpub-schema.dump.enc" "D:\soundpub-recovery\<output-name>"
```

The helper enforces:

- 32-byte key and `SPBK1` header.
- Artifact allowlisting against `SHA256SUMS.txt`.
- SHA-256 check before decrypt.
- AES-256-GCM auth tag validation.
- Output outside the repository, OneDrive, and backup directory.
- No overwrite of an existing file and cleanup on failure.

Synthetic fixture test result on 2026-11-24: valid key round-trip passed; wrong key was rejected with no leftover output; repository output, backup-directory output, and overwrite attempts were rejected. No real backup data was decrypted.

## Stop conditions

- Any key, plaintext, or extracted metadata appears in the repo or chat: stop and rotate/revoke.
- GCM verification does not report 24 files: stop.
- Decryption target is unclear, inside the repo, inside OneDrive, or already exists: stop.
- Requested artifact is not the schema dump: stop and get explicit approval.
- Any restore, migration replay, or production contact is requested without written approval: stop.

## Post-decrypt evidence

1. Record schema-only metadata counts in `docs/audit/16-backup-schema-metadata.md` and compare with `docs/migration/CANONICAL_SCHEMA.sql` and `docs/migration/DATABASE_OBJECT_MANIFEST.md`.
2. Reconcile `docs/audit/14-static-schema-diff.md` with the real decrypted schema view; the static report is non-authoritative.
3. Keep all plaintext outside the repository and delete it only when the approved retention period ends.
4. Update `docs/audit/04-database-and-backup-audit.md` with the verification summary, not key material.
5. Do not restore Auth sessions or refresh tokens into the new auth system; require deliberate identity migration and reauthentication.
