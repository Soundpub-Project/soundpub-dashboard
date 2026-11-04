# Phase 1F Backup Scope

Date: 2026-10-27 (Asia/Bangkok). Source: direct read-only SSH to `maskhar@20.20.20.3`, working from `/data/supabase/instances/supabase-01/config`; prior `STORAGE_BACKUP_VERIFICATION.md`, `PHASE1E_OFFSITE_BACKUP.md` and `PHASE1E_RESTORE.md`. No new backup, restore or data movement.

## Required Soundpub boundary

- Soundpub application schema, rows, policies, grants, routines, financial state and schema provenance; required shared extensions/roles represented as dependencies, not copied wholesale without approval.
- Soundpub-linked Auth users **plus** identities/provider bindings/sessions or approved reset/rebinding plan. Shared and unknown identities require separate disposition, not a global `auth.users` export.
- Soundpub-owned Storage metadata and bytes, including referenced versions, visibility and private-file rules; unknown/shared bucket objects require explicit ownership before selection.
- Required external GCS/legacy-cloud bytes and references, or approved intentionally-external/deprecated disposition; Soundpub-specific Functions and safe configuration, never secrets in reports.

## Observed recovery material

| Evidence | Result | Boundary |
| --- | --- | --- |
| `phase1-backups/20261026T200848Z/postgres.post-remediation.dump` | On-host current-state DB dump, 5,413,336 bytes, last modified 2026-10-27 03:42 UTC. | Full/shared database archive; must **not** be treated as Soundpub-only export. |
| `phase1-backups/20261026T200848Z/soundpub-storage.tar` | On-host 9,953,083,392-byte archive; writer status `PASS`, checksum manifest exists. Independent earlier restore verified 598/598 selected file hashes. | Selection based on DB references, **not** verified exclusive ownership or complete external bytes. |
| `restore-object-comparison.txt` | Recorded 33 tables, 56 functions, 78 policies, 101 indexes, 23 triggers and 34,425 rows on production and isolated restore. | Application-scope count comparison; no exact current financial equality or full-stack smoke proof. |
| Off-host encrypted copy and independent readback | NOT VERIFIED; Phase 1E says absent. | No disaster-recovery or cutover sign-off. |

Prior 598-file archive includes data whose exclusive ownership is not proven; it is evidence, **not** permission to restore it into a new tenant. Snapshot is non-atomic across DB/Storage and was taken before this phase. Auth scope, Storage unknowns, external bytes, provider credentials, full-platform restore, off-host custody, retention, RPO/RTO, and exact financial state remain open.

For Phase 2 **isolated backend construction with no production writes or production-data import**, existing on-host checked application restore and selected-byte restore offer limited development safety. They are **not sufficient** to authorize production mutation, tenant data extraction, or cutover; a newly scoped verified backup and separate encrypted off-host recovery are required before those steps.
