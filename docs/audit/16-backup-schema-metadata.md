# 16 — Backup Schema Metadata

Status: **BACKUP VERIFIED; SCHEMA METADATA EXTRACTED; DEFINITION DIFF STILL REQUIRED**

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
| ROW SECURITY entries | 32 | 32 | PASS |
| Explicit INDEX TOC entries | — | 55 | NOT DIRECTLY COMPARABLE |
| Constraint TOC entries | — | 88 | NOT DIRECTLY COMPARABLE |

The manifest's 101 indexes include constraint-backed indexes, and its 109 constraints include inline table constraints. Those totals are not directly comparable with explicit TOC entry counts. The 88 constraint TOC entries consist of 45 `CONSTRAINT` and 43 `FK CONSTRAINT` entries.

## Interpretation

The verified backup's schema metadata matches the inspected live manifest for the directly comparable object classes: tables, functions, policies, triggers, foreign keys, enums, and RLS entries. This substantially strengthens backup provenance, but it is still metadata-level evidence.

`docs/audit/14-static-schema-diff.md` remains a non-authoritative repository-only SQL text comparison. A definition-level diff is still required for columns, types, defaults, nullability, check expressions, index definitions, function bodies, grants, RLS expressions, and trigger definitions.

## Remaining gates

- Compare schema-only SQL from the verified backup against `docs/migration/CANONICAL_SCHEMA.sql`, `supabase/migrations`, and `backend/migrations`.
- Build a disposable local database from repository migrations using synthetic data only.
- Run auth/role, financial, and storage parity tests before any restore rehearsal.
- Keep restore, migration replay, production contact, and cutover unapproved.

## Tooling

`scripts/inspect-pg-custom-dump.mjs` reads a PostgreSQL custom dump without a database server or Docker and emits schema-only SQL plus a metadata report. It refuses to write outputs inside the repository or OneDrive.
