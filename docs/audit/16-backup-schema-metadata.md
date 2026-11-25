# 16 — Backup Schema Metadata

Status: **BACKUP VERIFIED; PRELIMINARY DEFINITION DIFF COMPLETE; PARITY UNRESOLVED**

## Evidence

- Verification completed 2026-11-24: 24 `OK` lines, `Verified 24 files`, exit code 0.
- Only `soundpub-schema.dump.enc` was decrypted, using `scripts/backup-decrypt-safe.mjs`.
- Decrypted dump and generated schema SQL stayed outside the repository and OneDrive.
- No row data, Auth sessions, refresh tokens, Storage objects, Xendit data, or decrypted personal data was extracted.
- Decrypted dump size: 2,177,592 bytes.
- Decrypted dump SHA-256: `9ff5c67218247440d6238f099f974bb1afe4cb252b524beaf899f41392eb9daa`.

## Archive header

| Field | Value |
|---|---|
| Archive version | 1.14-0 |
| Integer size | 4 |
| Offset size | 8 |
| Format | custom |
| Compression | gzip |
| Database | postgres |
| Remote version | PostgreSQL 15.8 |
| Dump version | pg_dump 15.8 |
| TOC entries | 544 |

## Counts versus inspected live manifest

| Object | Reference | Backup dump | Result |
|---|---:|---:|---|
| Tables | 33 | 33 | PASS |
| Functions | 56 | 56 | PASS |
| Policies | 78 | 78 | PASS |
| Non-internal table triggers | 47 | 47 | PASS |
| Foreign keys | 43 | 43 | PASS |
| Enums | 4 | 4 | PASS |
| ROW SECURITY entries | 32 | 32 | COUNT MATCH ONLY; TABLE IDENTITIES DIFFER |
| Explicit INDEX TOC entries | — | 55 | NOT DIRECTLY COMPARABLE |
| Constraint TOC entries | — | 88 | NOT DIRECTLY COMPARABLE |

The manifest's 101 indexes include constraint-backed indexes, and its 109 constraints include inline table constraints. Those totals are not directly comparable with explicit TOC entry counts. The 88 constraint TOC entries consist of 45 `CONSTRAINT` and 43 `FK CONSTRAINT` entries.

## Interpretation

The `32/32` RLS count matches the historical manifest only; it does not establish that the same tables have RLS enabled. The preliminary statement comparison in `docs/audit/17-definition-schema-diff.md` found that backup SQL omits RLS on `soundpub.rate_limits`, while the current canonical schema enables it. The canonical schema also contains security-hardening policy and ACL changes absent from the backup definition. Reconcile this with the backup capture date and the manual-remediation timeline.

`docs/audit/14-static-schema-diff.md` remains a non-authoritative repository-only migration comparison. `docs/audit/17-definition-schema-diff.md` adds a preliminary lexical comparison of backup and canonical SQL, but it is not a PostgreSQL semantic diff and does not prove applied state, owner parity, final backend schema, or runtime behavior.

## Remaining gates

- Reconcile the findings in `docs/audit/17-definition-schema-diff.md`, then compare the intended final backend schema against the backup/canonical definitions in an isolated disposable PostgreSQL environment.
- Build a disposable local database from repository migrations using synthetic data only.
- Run auth/role, financial, and storage parity tests before any restore rehearsal.
- Keep restore, migration replay, production contact, and cutover unapproved.

## Tooling

`scripts/inspect-pg-custom-dump.mjs` reads a PostgreSQL custom dump without a database server or Docker and emits schema-only SQL plus a metadata report. It refuses to write outputs inside the repository or OneDrive. `scripts/schema-snapshot-diff.mjs` compares two schema SQL files without printing definitions or literal values; run `npm run test:schema-snapshot-diff` for its synthetic tests.
