# 11 — Migration Roadmap

Status: **PLAN ONLY — DO NOT START PRODUCTION CUTOVER**

## Governing gates

The previous audit requires at least **75/100**, zero CRITICAL findings, and restore/reconciliation pass before cutover (`SUPABASE_MIGRATION_AUDIT.md:145`). The pre-cutover gate is defined at `:156`; DNS-only rollback is forbidden after target writes (`:158`); the audit explicitly says not to cut over now (`:163`) and lists unverified live/schema/provider/backup/RTO evidence at `:165`.

No phase below permits production contact unless explicitly approved in writing.

## Phase 0 — Governance and scope lock

- Keep production services untouched.
- Freeze branch movement, resets, rebases, force-push, and commits until intended changes are approved.
- Record approved domains for cutover and named rollback owner.
- Resolve deployment-script conflict with `AGENTS.md:14-18`.
- Define success metrics and stop conditions.

Exit gate: written approval of scope, owner, and stop conditions.

## Phase 1 — Backup verification

- Supply local key path without placing the key in the repository, chat, logs, prompts, or generated docs.
- Use `15-key-handoff-runbook.md`; prefer supervisor-side verification if the key cannot safely leave the supervisor device.
- Run the read-only verifier:

```powershell
node "backend\backups\soundpub-20.20.20.173-20261030-212240\verify.cjs" "<local-key-file-path>"
```

- Require `Verified 24 files` and exit code 0.
- Result on 2026-11-24: 24 `OK` lines, `Verified 24 files`, exit code 0. GCM verification passed.
- Only schema-only decryption is allowed next; do not extract all artifacts or restore yet.

Exit gate passed: all 24 artifacts pass SHA-256 and GCM authentication.

## Phase 2 — Schema and metadata parity

- Treat `docs/audit/14-static-schema-diff.md` as preparatory context only; it is not an applied-state or definition-level proof.
- Review `docs/audit/17-definition-schema-diff.md` as preliminary static evidence: backup `rate_limits` lacks the canonical RLS enablement, with additional policy, ACL, and function-body differences to reconcile.
- Focused tests on 2026-11-25 replayed the backend migration chain into fresh disposable PostgreSQL 17 databases and passed 6 synthetic managed-artist/royalty tests. This is backend test evidence only; it is not backup restore, backup parity, or production migration.
- `docs/audit/18-source-to-backend-data-mapping.md` crosswalks all 33 canonical `soundpub` tables and records explicit rejects/blockers. A pure synthetic-fixture planner now covers Auth identity, profiles, and review-only role candidates; no source rows were inspected.
- Use `docs/audit/16-backup-schema-metadata.md` as verified provenance evidence; directly comparable counts match the inspected live manifest.
- From the verified backup, produce schema-only/metadata views in a controlled private location outside repo/OneDrive using `scripts/backup-decrypt-safe.mjs`.
- Diff backup schema against `supabase/migrations` and `backend/migrations/0001`–`0081`.
- Include tables, columns, types, defaults, nullability, constraints, indexes, foreign keys, triggers, functions, policies, grants, Auth shape, and Storage metadata shape.
- Resolve mismatch between audit-era drift claims and current worktree counts.

Exit gate: schema diff report approved; no unexplained CRITICAL drift.

## Phase 3 — Auth and role E2E

- Validate backend OIDC/Keycloak configuration in a production-equivalent isolated environment.
- Test exact redirects, partner SSO, impersonation replacement, Google OAuth disabled mode, and error redirects.
- Test all role policies: `authenticated`, `owner`, `owner-or-admin`, `admin`, `superadmin`.
- Validate that dev/mock identity cannot be selected in production config.

Exit gate: role/redirect matrix passes; legacy privileged browser paths are scheduled for disablement.

## Phase 4 — Financial parity

- Run fixture parity for 70/21/9 splits, half-up per-row rounding, same-owner aggregation, checksum-bound preview/commit, reconciliation, correction reversal, notification gating, and composer royalties.
- Compare legacy outputs with backend ledger minor units and audit/outbox records.
- Keep backend authoritative; do not alter split logic to force superficial parity without approval.

Exit gate: finance parity report signed; reconciliation and correction drill passes.

## Phase 5 — Storage cutover

- Define production private object storage, bucket policy, lifecycle, encryption, and access logging.
- Validate short-lived signed PUT/download, 6 MiB/24 MiB multipart behavior, checksum enforcement, ownership checks, and stable DB references.
- Test media, royalty CSV, contracts, takedown documents, payout proofs, avatars, and audio clips.
- Only then disable legacy TUS/Supabase Storage paths.

Exit gate: storage E2E passes with rollback that does not require overwriting target writes.

## Phase 6 — Domain-by-domain frontend cutover

- Enable one backend domain at a time through `VITE_SOUNDPUB_BACKEND_DOMAINS`.
- Start with read-heavy or low-risk domains after their tests pass; keep finance and storage until their gates pass.
- Monitor contract errors, auth failures, reconciliation status, and storage capability failures.
- Remove direct Supabase calls for a domain only after legacy writes are disabled and parity holds.

Exit gate: production build enables backend domains; target domain has no active legacy writes.

## Phase 7 — CI/CD and production packaging

- `.github/workflows/ci.yml` covers root secret-scan/build/lint/contract/egress and backend typecheck/build/test; first remote run and branch protection remain unverified. Six focused Docker tests pass, but the full Docker suite is still unverified.
- Add production backend packaging separate from `dashboard-sounpub-dev`.
- Add health checks, TLS, security headers, rate limiting, resource limits, structured logging, metrics, and alerts.
- Correct Edge Function deployment scripts or retire them.

Exit gate: required checks pass automatically; deployment runbook approved.

## Phase 8 — Rehearsal and cutover decision

- Run a full isolated rehearsal using verified backup data under privacy controls.
- Exercise restore, schema migration, smoke tests, reconciliation, monitoring, and rollback.
- On 2026-11-25, a narrower synthetic recovery rehearsal passed 5/5 tests using generated JSON fixtures and two fresh disposable PostgreSQL 17 targets. It verified identical replay, source immutability, rejection of unresolved owners and credential/session fields, and transaction rollback. It did not restore the verified backup or validate full legacy-to-backend conversion; the phase remains open.
- Recalculate readiness score against `SUPABASE_MIGRATION_AUDIT.md:145`.
- Require score >= 75, zero CRITICAL, and restore/reconciliation pass.

Exit gate: explicit written cutover approval.

## Phase 9 — Cutover and observation

- Use a domain-by-domain rollout, not a single global flip.
- Maintain an append-only change log.
- Freeze writes during reconciliation checkpoints if required.
- Do not claim rollback readiness via DNS after target writes (`SUPABASE_MIGRATION_AUDIT.md:158`).
- Observe error rates, auth failures, ledger mismatch, outbox lag, storage failures, and user-reported defects.

Exit gate: stable operation for the agreed observation window and formal closure report.

## Immediate next action

Backup verification and schema-only extraction passed. The latest non-Docker backend suite passed 351/438 (87 skipped, 0 failed); the Docker-enabled suite previously passed 475/484 (9 skipped), selected Storage tests passed 22/22, and a synthetic recovery rehearsal passed 5/5 on two disposable PostgreSQL targets. The new Soundpub identity/profile/role/artist-profile dry-run planner passed 11 generated-fixture tests; it is not validated against source rows and does not convert the remaining 30 canonical tables. These results validate code paths and schema rules, not backup restoration or data parity. Next extend the planner by domain and use source rows only after a separately approved isolated export. No backup restore, production migration, production contact, or cutover has occurred.
