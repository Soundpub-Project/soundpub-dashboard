# Phase 1 backup restore report

Status: **PASS for scoped database and selected self-hosted storage restore; overall migration recovery remains BLOCKED** by external/unknown data, encryption/off-host recovery and application/privacy tests.

## Isolated database drill

- Source: private full PostgreSQL 17.6 archive `postgres.full.dump` and gzipped role globals in `/data/supabase/instances/supabase-01/config/phase1-backups/20261026T200848Z`. Target: disposable `soundpub-phase1-restore` container, PostgreSQL 17.6, network `none`, no published ports; database `soundpub_restore`. All tests avoid real email/payment.
- First `pg_restore --no-owner --no-privileges` produced exact data counts but **lost grants/ACLs**; independent QA detected anon/schema and function access differences. Those results were discarded as an incomplete restore method. On fresh database, role globals imported, then `pg_restore --no-owner --exit-on-error` with privileges enabled returned 0 and zero error lines.
- Second restore matches 33 Soundpub tables, 56 functions, 78 RLS policies, 101 indexes, 23 distinct triggers, and 34,425 rows. Per-table row counts for all 33 tables match; 43 FK/orphan checks passed independently. No invalid Soundpub foreign keys; anon schema USAGE and limiter SELECT match the **pre-remediation** archive. Archive hashes passed.
- A separate isolated rehearsal of the role/limiter migration and SQL assertions passed. Live production role/limiter migration later passed the corrected read-only assertions. Archive remains pre-remediation; do not treat original privilege snapshot as current.
- Data equality, monetary decimal equality per row, table storage/reference cross-check, password login, OAuth, refresh/logout, application read flows and provider callback behavior were **not** exercised. Sequential live-vs-restore row counts are not a simultaneous transactional snapshot.

## Storage and privacy

- Exact 598-object source selection, physical existence and size checked. Private scoped tar checksum passed. Independent restore extracted exactly 598 regular files, 9,950,688,219 bytes, zero extras, and all 598 source/restored SHA-256 values matched. Extracted copy was removed after verification; archive/manifests retained.
- Public `contracts` bucket remains open; Storage API privacy/owner/signed-URL behavior was not tested. External GCS/legacy Cloud bytes and unknown shared objects remain excluded.

## Recovery blockers

- Role globals import generated benign duplicate-role notices against an initialized Supabase image; a fully empty cluster/role replay without duplicates remains unverified. Restore requires platform extensions and host role setup. Canonical schema-only DDL has isolated prerequisites, but blank-cluster deterministic application plus independent QA is still BLOCKED.
- Archive and storage files sit on same host as production, lack encryption/off-host redundancy, and require RPO/RTO approval. No Phase 2 migration or cutover tested.
## Current-state snapshot drill

A second postgres.post-remediation.dump archive and checksum were captured after role/limiter fixes. Fresh isolated database soundpub_restore_current restored with ACLs (pg_restore --no-owner --exit-on-error, zero stderr). It matches 33 tables, 56 functions, 78 policies, 101 indexes, 23 distinct triggers and 34,425 aggregate rows; restored RLS on limiter=true, anon limiter SELECT=false, authenticated role INSERT=false, service-role limiter EXECUTE=true. Scoped DB backup and restore now **PASS**, but complete host recovery and storage privacy still **BLOCKED**.

After validation, the disposable isolated soundpub-phase1-restore container was removed. The original and current-state backup archives, role globals, storage tar, checksums and private evidence remain. Production Compose services stay running.

## Phase 1B addendum — 2026-10-27

Restore from an encrypted off-host copy and application-level restore remain **NOT RUN / FAIL**. Prior on-host scoped database and 598-object byte results remain historical PASS evidence only. See `APPLICATION_RESTORE_REPORT.md`.
