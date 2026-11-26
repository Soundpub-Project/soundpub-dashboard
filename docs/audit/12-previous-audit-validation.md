# 12 — Previous Audit Validation

Status: **PREVIOUS AUDIT REMAINS A VALID SAFETY BASELINE; LIVE CLAIMS NOT REVALIDATED**

Reference: `SUPABASE_MIGRATION_AUDIT.md`

## Validation summary

| Previous claim | Validation result | Notes |
|---|---|---|
| Readiness **38/100 — NOT READY** (`SUPABASE_MIGRATION_AUDIT.md:7`) | Still accepted | New evidence is local-only; production-readiness gates remain unmet, so the score has not been recalculated. |
| Audit-only scope, no migration or mutative tests (`:3`) | Historical claim remains accurate for that audit | Later work first decrypted only the schema artifact and replayed backend migrations in disposable synthetic test databases. On 2026-11-26, a separately approved isolated local restore of the `soundpub` dump and limited in-memory Auth projection were completed; no production migration occurred. |
| Critical drift: 33 live tables without migration ledger and 14 deployed Edge Functions differing (`:124`) | Unverified | Live Supabase was not contacted. Worktree has 33 SQL migration files, but that does not prove live parity. |
| Financial/DDL drift (`:48`) | Partially evidenced; high priority | `docs/audit/17-definition-schema-diff.md` identifies three unexplained function-body differences plus expected privacy substitutions; behavior and final backend parity remain unverified. |
| `.env.example` key-name mismatch (`:25`) | Stale in this worktree | Current `.env.example:7-8` uses `VITE_SUPABASE_PUBLISHABLE_KEY`, matching `src/integrations/supabase/client.ts:5-13` and `Dockerfile:7-19`. The warning against secrets in `VITE_*` remains valid. |
| Storage-path risk: full/signed URLs and non-atomic upload/DB updates (`:78`) | Partially still visible | `src/lib/storagePaths.ts:27-30` centralizes path construction, but upload/DB atomicity is not proven in legacy mode. |
| Edge Function inventory count around 34 (`:88`) | Count changed | Current `supabase/functions` has 35 directories. Live deployed drift still unverified. |
| Do not cut over now (`:163`) | Confirmed | Backend architecture still reports 52/100 and production cutover unapproved (`docs/backend/ARCHITECTURE.md:3,7`). |
| Unverified live/schema/provider/backup/RTO evidence (`:165`) | Partially updated | All 24 backup artifacts pass cryptographic verification, and the `soundpub` dump was restored locally in isolation. Live schema, provider, RTO, cross-service snapshot consistency, and backend parity remain unverified. |
| No DNS-only rollback after target writes (`:158`) | Confirmed as binding | Roadmap preserves this constraint. |
| Static API compatibility `BLOCKED` (`docs/migration/API_COMPATIBILITY_MATRIX.md:3`) | Still blocked for production | Focused synthetic backend tests add local runtime evidence but do not prove credentialed frontend/backend compatibility. |
| Root production frontend not enabling backend domains (`docs/backend/SUPABASE_BACKEND_CAPABILITY_MATRIX.md:216`) | Confirmed | Frontend remains dual-mode with 78 Supabase-importing source files. |

## What improved since the previous audit

- Backend implementation materially expanded: 81 migrations, 140 test files, Fastify API, auth providers, financial ledger/reconciliation/correction logic, storage capabilities, worker/outbox, and OpenAPI metadata.
- Backend adapters exist across many frontend domains under `src/api/`.
- Backend config now has strong isolation gates rejecting production/nonlocal choices (`backend/src/config/database-target.ts:21-24`; `backend/src/config/index.ts:80-99`).
- Capability matrix and architecture docs now explicitly track remaining blockers instead of claiming completion.

## What did not improve enough

- Backup cryptographic verification passes for all 24 listed artifacts. The `soundpub` dump was subsequently restored in an isolated local container; only four Auth identity fields were projected in memory, and other Auth/Storage exports remain unprocessed.
- No live schema comparison.
- No production role E2E proof.
- No real provider cutover proof.
- CI workflow exists locally; first remote run and branch protection remain unverified.
- No production backend packaging.
- No root production build enabling backend domains.
- No explicit cutover approval.

## Conclusion

The previous audit should remain the controlling readiness baseline until the gates in `11-migration-roadmap.md` are met. Its score may be revised only after documented backup verification, schema parity, provider validation, restore/reconciliation rehearsal, and explicit approval.
