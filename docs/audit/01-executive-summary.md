# 01 — Executive Summary

Status: **AUDIT COMPLETE; BACKUP VERIFIED; MIGRATION NOT READY**

Scope: static repository audit, backup inventory, validation of the previous Supabase migration audit, a backend migration roadmap, local-only lint/egress hardening, synthetic tests, and an approved isolated backup rehearsal. The `soundpub` dump was restored in a disposable PostgreSQL 15 container with networking disabled and data on tmpfs; 33 tables/26,204 rows and 43 foreign keys were validated. Only four Auth identity fields were selected in memory. Temporary decrypted data and the container were removed. No production service, database, or deployment was changed.

## Overall conclusion

Soundpub has a substantial backend replacement under active development, but the repository does not currently support a safe production cutover from Supabase. The previous readiness score of **38/100 — NOT READY** in `SUPABASE_MIGRATION_AUDIT.md:7` remains the baseline: recent synthetic database tests add local backend evidence but do not meet the missing production-readiness gates, so the score has not been recalculated.

The backend foundation is real and increasingly strong: `docs/backend/ARCHITECTURE.md:22-30` describes a Node 22 / Fastify modular monolith, PostgreSQL 17, SQL migrations, transactional outbox, private S3-compatible development storage, and server-side authorization. However, the same document still records **52/100** and explicitly leaves production cutover unapproved at `docs/backend/ARCHITECTURE.md:3,7`. The runtime configuration gate rejects all environments except `development` and `test` at `backend/src/config/database-target.ts:21-24`.

## Local verification status

- `npm ci` installed exact locked dependencies in root and backend; no lockfiles were changed.
- Root contract tests, root build, and root egress check passed. Egress required a dummy local env and `VITE_SOUNDPUB_BACKEND_DOMAINS=auth,settings`; the production default build remains unchanged.
- Root lint initially failed with 453 errors and 57 warnings. It now passes with 0 errors and 57 warnings after disabling `@typescript-eslint/no-explicit-any` as a legacy baseline (409 sites) and fixing 42 concrete errors. Hook/fast-refresh warnings remain.
- Backend typecheck passed; backend unit tests were 46 pass / 0 fail / 1 skip; backend full suite was 340 pass / 0 fail / 86 skipped.
- On 2026-11-26, the latest non-Docker `npm test` run passed 370/457 backend tests, with 0 failures and 87 Docker-gated skips. The focused Soundpub mapper suite passed 30/30; see `docs/audit/18-source-to-backend-data-mapping.md`.
- On 2026-11-25, six Docker-gated tests passed across managed-artist identity, royalty reporting, CSV commit, and staged royalty import. Each used a fresh disposable PostgreSQL 17 test database, applied the backend migration chain, and verified the migration runner was idempotent on a second pass. Fixtures were synthetic; this did not restore or compare the verified backup.
- On 2026-11-25, the full Docker-enabled backend suite completed with 475 passed, 0 failed, and 9 skipped. The dedicated synthetic recovery rehearsal then passed 5/5 tests using two fresh disposable PostgreSQL 17 targets, confirming identical replay, source immutability, rejection of unresolved owners and credential/session fields, and rollback on conflict. This did not restore the verified backup or prove full legacy-data conversion.
- The latest `npm run test:secrets` passed on the working tree (1384 non-ignored files, 0 findings), but git history still contains a previously committed Xendit webhook token pending approved rotation/cleanup.
- Encrypted backup copied to git-ignored `backend/backups/soundpub-20.20.20.173-20261030-212240`; source preserved. All 24 listed artifacts pass SHA-256 and AES-256-GCM authentication with a supervisor-provided key; no plaintext was produced by the verifier.
- GitHub Actions CI workflow added at `.github/workflows/ci.yml` covering frontend and backend checks with dummy env only; the first remote run and branch protection are still unverified.
- Added a non-authoritative repository-only SQL text comparison at `docs/audit/14-static-schema-diff.md`, then a preliminary backup-to-canonical statement comparison at `docs/audit/17-definition-schema-diff.md`. The latter found `rate_limits` RLS, policy, ACL, and function-body drift; it does not prove applied state or backend parity.
- Added `scripts/backup-decrypt-safe.mjs` plus synthetic fixture tests for correct-key decrypt, wrong-key rejection, unsafe-output rejection, and overwrite rejection. The schema artifact and, after explicit approval, the database dump were decrypted only to private locations outside the repo/OneDrive; temporary plaintext was removed.
- Added `docs/audit/16-backup-schema-metadata.md`: object counts match the historical manifest, but the newer definition comparison shows the `rate_limits` RLS identity differs.
- Added `docs/audit/18-source-to-backend-data-mapping.md`, a schema-backed crosswalk for all 33 canonical `soundpub` tables plus Auth/Storage boundaries. An isolated backup rehearsal now validates selected source domains; it is not a full-domain conversion or parity proof.
- The no-write planner was exercised against the approved backup using minimal Auth identity fields and selected profile fields. It produced 198 inactive identity candidates, 0/198 profile candidates, 197 review-only role candidates, 0/20 app-settings candidates, and 0/43 notification candidates. Block reasons and limitations are documented in the mapping report.
- A separately approved, aggregate-only release/track projection found 291 releases and 427 tracks. It counted media, financial snapshot, lyrics, and contributor-field presence without loading those values. No release/track candidate was produced because Auth/profile rows and track-order approvals were intentionally excluded from that projection.
- The 30 focused mapper tests include verification/reset-token guards and the fail-closed release/track planner. `apply_supported` remains false; no candidate was written to the backend or production.

## Highest-priority findings

1. **Backup is cryptographically verified; full parity is not established.** All 24 listed artifacts pass SHA-256 and AES-256-GCM authentication. The `soundpub` database dump was restored in isolation; a minimal Auth ID stub was used for external foreign keys. Only `id`, `email`, `email_confirmed_at`, and `created_at` were selected from the Auth users export. Other Auth and Storage artifacts remain unprocessed. The backup components were exported sequentially, not atomically. The preliminary comparison in `17-definition-schema-diff.md` found RLS, policy, ACL, and function-body differences. Restore/cutover remains unapproved.
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

This audit created documentation under `docs/audit/`, added `13-secret-rotation-checklist.md`, and updated `.env.example` templates with placeholders only. It also applied local-only hardening for lint and egress verification and added the backup/schema comparison tools described above. Git history still requires approved rotation/cleanup for a previously committed Xendit webhook token. It did not modify real environment files, migration files, deployment scripts, lockfiles, or production infrastructure. The limited source dump was restored only in a local network-isolated temporary container; temporary plaintext was removed. No production service was contacted, and no commit was created.
