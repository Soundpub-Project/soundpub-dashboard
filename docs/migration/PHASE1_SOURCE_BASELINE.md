# Phase 1 source baseline

Observed 2026-10-27 (Asia/Bangkok). Branch `main`; HEAD `48222ffb9c9e60da82d224e1e8aaccd4dd597442`. Primary audit: `SUPABASE_MIGRATION_AUDIT.md` (untracked, preserved). Supabase is self-hosted on shared host `maskhar@20.20.20.3`, Compose root `/data/supabase/instances/supabase-01/config`; no Phase 2 implementation or cutover.

## Pre-existing local changes

- Modified before Phase 1: `AGENTS.md`, `src/components/releases/DeleteReleaseDialog.tsx`, `src/pages/UploadRoyalty.tsx`, `supabase/functions/delete-royalty-upload/index.ts`, `supabase/functions/process-royalty-upload/index.ts`.
- Untracked before Phase 1: `.env copy`, `SUPABASE_MIGRATION_AUDIT.md`, `scripts/process-royalty-upload.test.cjs`, `scripts/royalty_financial_assertions.sql`, `scripts/royalty_financial_smoke.sql`, `scripts/royalty_import_adversarial_assertions.sql`, `scripts/royalty_import_safety_assertions.sql`, and four October 23 SQL migrations under `supabase/migrations/`. These are user work, not reset, committed, or replayed.
- Phase 1 modifies `.gitignore` to exclude `.env copy`; `git check-ignore -v '.env copy'` passes. Tracked `.env.example` contains placeholder key names; `.env`, `.env.local`, and other ignored `.env` files exist locally. Do not print their values or assume ignored files are safe to archive. `.gitignore` explicitly re-includes `docs/migration/STORAGE_MANIFEST.csv` while continuing to ignore other CSV exports.
- Source of truth remains unresolved: deployed functions differ from repository, canonical schema comes from live database, and a clean checkout cannot reproduce required shared helpers or migration provenance. Preserve the exact current dirty worktree.

## Locations and inventory

- SQL: 30 `supabase/migrations/*.sql` at baseline, with duplicate day-only prefixes (20260816/20260901/20260904/20260907/20260909); 52 historical runbooks in `docs/soundpub-local-migration/`; live schema has no migration ledger. See `SCHEMA_DRIFT_REPORT.md`.
- 34 repository Edge Function entrypoints: `supabase/functions/*/index.ts`; runtime bind mount: `volumes/functions` under host Compose root. Do not upload/deploy without reviewing exact source and independent test.
- Deployment/build locations: `Dockerfile`, `docker-compose.yml`, `supabase/config.toml`, `scripts/deploy_functions.sh`, `scripts/deploy_functions.ps1`, host Compose files and `.env`. Avoid placing secrets in repository or frontend `VITE_*` variables.
- Database host is shared with other applications; full-host recovery archive is private and must never enter repository. Soundpub ownership is not equivalent to all host users/objects. See `AUTH_MIGRATION_MATRIX.md`, `STORAGE_AUDIT.md`.

Gate: **BLOCKED** until sources, schema provenance, ownership and security stabilize. This file records a starting point, not a clean Git state.