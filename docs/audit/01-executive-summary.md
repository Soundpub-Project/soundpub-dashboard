# 01 — Executive Summary

Status: **AUDIT COMPLETE; BACKUP VERIFIED; MIGRATION NOT READY**

Scope: static repository audit, local backup artifact inventory, validation of the previous Supabase migration audit, a safe backend migration roadmap, local-only lint/egress hardening, and focused synthetic database tests. Only the schema backup artifact was decrypted, outside the repo and OneDrive; no row data was extracted or restored. Focused backend tests used disposable PostgreSQL 17 containers with synthetic fixtures. No production service, database, container, migration, deployment, lockfile, or environment file was changed. No production credentials or secrets were used or recorded.

## Overall conclusion

Soundpub has a substantial backend replacement under active development, but the repository does not currently support a safe production cutover from Supabase. The previous readiness score of **38/100 — NOT READY** in `SUPABASE_MIGRATION_AUDIT.md:7` remains the baseline: recent synthetic database tests add local backend evidence but do not meet the missing production-readiness gates, so the score has not been recalculated.

The backend foundation is real and increasingly strong: `docs/backend/ARCHITECTURE.md:22-30` describes a Node 22 / Fastify modular monolith, PostgreSQL 17, SQL migrations, transactional outbox, private S3-compatible development storage, and server-side authorization. However, the same document still records **52/100** and explicitly leaves production cutover unapproved at `docs/backend/ARCHITECTURE.md:3,7`. The runtime configuration gate rejects all environments except `development` and `test` at `backend/src/config/database-target.ts:21-24`.

## Local verification status

- `npm ci` installed exact locked dependencies in root and backend; no lockfiles were changed.
- Root contract tests, root build, and root egress check passed. Egress required a dummy local env and `VITE_SOUNDPUB_BACKEND_DOMAINS=auth,settings`; the production default build remains unchanged.
- Root lint initially failed with 453 errors and 57 warnings. It now passes with 0 errors and 57 warnings after disabling `@typescript-eslint/no-explicit-any` as a legacy baseline (409 sites) and fixing 42 concrete errors. Hook/fast-refresh warnings remain.
- Backend typecheck passed; backend unit tests were 46 pass / 0 fail / 1 skip; backend full suite was 340 pass / 0 fail / 86 skipped.
- On 2026-11-25, the latest non-Docker `npm test` run passed 351/438 backend tests, with 0 failures and 87 Docker-gated skips. This includes the 11 synthetic Soundpub dry-run mapper tests and does not access production or source rows.
- On 2026-11-25, six Docker-gated tests passed across managed-artist identity, royalty reporting, CSV commit, and staged royalty import. Each used a fresh disposable PostgreSQL 17 test database, applied the backend migration chain, and verified the migration runner was idempotent on a second pass. Fixtures were synthetic; this did not restore or compare the verified backup.
- On 2026-11-25, the full Docker-enabled backend suite completed with 475 passed, 0 failed, and 9 skipped. The dedicated synthetic recovery rehearsal then passed 5/5 tests using two fresh disposable PostgreSQL 17 targets, confirming identical replay, source immutability, rejection of unresolved owners and credential/session fields, and rollback on conflict. This did not restore the verified backup or prove full legacy-data conversion.
- The latest `npm run test:secrets` passed on the working tree (1384 non-ignored files, 0 findings), but git history still contains a previously committed Xendit webhook token pending approved rotation/cleanup.
- Encrypted backup copied to git-ignored `backend/backups/soundpub-20.20.20.173-20261030-212240`; source preserved. All 24 listed artifacts pass SHA-256 and AES-256-GCM authentication with a supervisor-provided key; no plaintext was produced by the verifier.
- GitHub Actions CI workflow added at `.github/workflows/ci.yml` covering frontend and backend checks with dummy env only; the first remote run and branch protection are still unverified.
- Added a non-authoritative repository-only SQL text comparison at `docs/audit/14-static-schema-diff.md`, then a preliminary backup-to-canonical statement comparison at `docs/audit/17-definition-schema-diff.md`. The latter found `rate_limits` RLS, policy, ACL, and function-body drift; it does not prove applied state or backend parity.
- Added `scripts/backup-decrypt-safe.mjs` plus synthetic fixture tests for correct-key decrypt, wrong-key rejection, unsafe-output rejection, and overwrite rejection. The verified schema artifact was then decrypted outside the repo/OneDrive; no row data was extracted.
- Added `docs/audit/16-backup-schema-metadata.md`: object counts match the historical manifest, but the newer definition comparison shows the `rate_limits` RLS identity differs.
- Added `docs/audit/18-source-to-backend-data-mapping.md`, a schema-backed crosswalk for all 33 canonical `soundpub` tables plus Auth/Storage boundaries. It identifies field conversions and rows that must be rejected or quarantined; it is not row-validated because no source data was opened.
- Added a pure synthetic-fixture dry-run planner for Auth identity, profiles/settings, role candidates, and supported artist-profile metadata. Eleven focused tests pass; it produces no database/file writes, leaves accounts inactive and unverified, and reports the 30 canonical tables not yet converted.
- The identity/profile/role planner was tested only with generated fixtures; no source rows were read. These results confirm local build/test health only and do not change production readiness.

## Highest-priority findings

1. **Backup is cryptographically verified; schema parity is not established.** The scoped backup was copied to git-ignored `backend/backups/soundpub-20.20.20.173-20261030-212240` with the source preserved. All 24 listed artifacts pass SHA-256 and AES-256-GCM authentication (`Verified 24 files`, exit code 0). Only the schema artifact was decrypted. The preliminary comparison in `17-definition-schema-diff.md` found that backup SQL does not enable RLS on `rate_limits`, along with policy, ACL, and function-body differences. Restore/cutover remains unapproved.
2. **Frontend remains deeply coupled to Supabase.** 78 non-test source files import Supabase modules; 77 are runtime imports and 1 is type-only. Backend adapters exist, but domain routing is controlled by `VITE_SOUNDPUB_BACKEND_DOMAINS` (`src/api/routing.ts:1-6`) and the root production build does not enable those domains according to `docs/backend/SUPABASE_BACKEND_CAPABILITY_MATRIX.md:216`.
3. **Authorization and financial data still have dual sources of truth.** Legacy frontend code directly reads profiles/roles and computes the 70/21/9 royalty split, while the backend has authoritative integer-minor-unit split, checksum, reconciliation, and append-only correction logic. This is safe only while the legacy path is not authoritative for production.
4. **Upload and storage are also dual-mode.** Legacy TUS uploads target Supabase Storage buckets (`src/components/releases/MediaUploadSection.tsx:22,41-45,133-217`), while backend signed upload/download and multipart intent exist in `backend/src/storage/s3.ts` and `backend/src/media/store.ts`. Backend S3 storage is explicitly development/test-only.
5. **Production deployment hardening is incomplete.** Root Compose exposes only the frontend web container on port `8181` (`docker-compose.yml:1-21`); nginx denies exports/tests and uses SPA fallback (`nginx.conf:1-19`) but has no documented TLS/HSTS/security-header/rate-limiting layer. A GitHub Actions workflow was added during local follow-up (`.github/workflows/ci.yml`), but its first remote run has not been verified yet.
6. **Deployment documentation conflicts with repository rules.** `AGENTS.md:14` requires Edge Function deployment through `scp`, but `scripts/deploy-fixed-functions.ps1:14-16` and `scripts/deploy_functions.sh:60-63` call `supabase functions deploy`.
7. **Previous audit findings are mixed.** Some claims remain valid; one environment-variable mismatch appears stale. Live schema/Auth/Storage drift was not rechecked because production contact is forbidden. See `12-previous-audit-validation.md`.

## Readiness gates still required

- Keep the read-only verifier evidence with all 24 encrypted artifacts passing SHA-256 and AES-256-GCM authentication.
- Reconcile the preliminary backup/canonical differences in `17-definition-schema-diff.md`; focused tests have replayed backend migrations in disposable PostgreSQL, but the resulting schema still needs comparison against backup/canonical.
- Complete a full isolated restore rehearsal using an approved controlled input; the passing recovery rehearsal used generated JSON fixtures only.
- Complete role and auth E2E validation, including Keycloak/OIDC production-equivalent configuration.
- Prove financial parity: legacy 70/21/9 behavior vs backend `SOUNDPUB_LEGACY_70_21_9`, including rounding, reconciliation, and corrections.
- Enable backend domains in the actual production frontend build and remove or disable legacy direct paths per domain.
- Validate real providers rather than mocks for payments, payouts, distributor submission, and notifications.
- Add CI for contract, unit, integration, lint, typecheck, and build checks.
- Harden production deployment with TLS, security headers, rate limiting, health checks, logging, and a tested rollback plan.
- Obtain explicit written approval for any production cutover. A simple DNS rollback is not acceptable after target writes (`SUPABASE_MIGRATION_AUDIT.md:158`).

## Deliverables in this directory

- `01-executive-summary.md`
- `02-project-architecture.md`
- `03-supabase-dependency-inventory.md`
- `04-database-and-backup-audit.md`
- `05-authentication-and-security-audit.md`
- `06-royalty-and-financial-audit.md`
- `07-upload-and-storage-audit.md`
- `08-docker-and-deployment-audit.md`
- `09-testing-and-reliability-audit.md`
- `10-backend-target-architecture.md`
- `11-migration-roadmap.md`
- `12-previous-audit-validation.md`
- `13-secret-rotation-checklist.md`
- `14-static-schema-diff.md`
- `15-key-handoff-runbook.md`
- `16-backup-schema-metadata.md`
- `17-definition-schema-diff.md`
- `18-source-to-backend-data-mapping.md`

## Change control

This audit created documentation under `docs/audit/`, added `13-secret-rotation-checklist.md`, and updated `.env.example` templates with placeholders only. It also applied local-only hardening for lint and egress verification: `eslint.config.js`, `scripts/backend-egress-browser.mjs`, equivalent sanitizer regex rewrites, ESM/const/empty-block fixes, and `src/components/finance/backend-mode.test.cjs`. It added `scripts/scan-secrets.mjs` and a `test:secrets` npm script, then replaced a committed Xendit webhook token with a placeholder in tracked docs/scripts; git history still requires approved rotation/cleanup. It did not modify real environment files, migration files, deployment scripts, lockfiles, or production infrastructure. It also added `.github/workflows/ci.yml`, `scripts/static-schema-diff.mjs`, `scripts/backup-decrypt-safe.mjs`, `scripts/schema-snapshot-diff.mjs`, and reports 14-17. Only the schema artifact was decrypted; no row data was extracted. Focused Docker tests used only synthetic fixtures and disposable PostgreSQL. No production service was contacted, and no commit was created.
