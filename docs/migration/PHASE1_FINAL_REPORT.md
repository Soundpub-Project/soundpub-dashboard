# Phase 1 Final Report

## Status

**BLOCKED. Phase 2: NOT READY.** Observation date: 2026-10-27, Asia/Bangkok. This phase did not implement a replacement backend, redirect traffic, change OAuth/Xendit callbacks, migrate users, or cut over production. Original audit `SUPABASE_MIGRATION_AUDIT.md` remains untouched.

## Readiness Score

**53 / 100**. Original score: **38 / 100**. Coordinator rubric uses original weights, not the independent QA gate score:

| Category | Weight | Score | Evidence / cap |
|---|---:|---:|---|
| Source and schema reproducibility | 20 | 10 | Sanitized canonical DDL and object inventory; missing ledger, external auth trigger/roles and blank-stack equivalence. |
| Database, RLS and privileged SQL | 20 | 11 | Roles/limiter fixed and checked; many definer grants/search paths and missing SQL provenance remain. |
| Auth and privileged API | 25 | 9 | 182 linked candidates inventoried, origin create-user hardened; public hostname still serves old behavior, email/backup unauthenticated. |
| Storage and isolation | 15 | 10 | 598-object archive and byte restore PASS; external media, privacy and unknown shared ownership remain. |
| Deployment and observability | 10 | 7 | Compose/runtime mapped; public routing ambiguous, function/shared-source drift. |
| Cutover and rollback | 10 | 6 | Requirements documented; no full rehearsal/RPO/RTO or provider-safe cutover. |
| **Total** | **100** | **53** | **Below required 85; mandatory failures remain regardless of score.** |

## Critical Findings

Original: **5** numbered groups (C1-C5). Remaining: **3** groups: C1 unauthenticated email/backup, C2 public `create-user` routing not verified to use patched handler, C5 public `contracts` configuration. C3 direct `user_roles` escalation and C4 `rate_limits` exposure passed isolated and live security assertions. High-severity definer/storage/SSO/financial risks remain; critical count is not a claim that their impact is low.

## Schema

- Live Soundpub PostgreSQL 17.6: **33 tables, 56 functions (51 SECURITY DEFINER), 78 policies, 47 non-internal trigger catalog entries / 23 distinct trigger names, 101 indexes, 43 foreign keys**. Grants, default privileges, types, sequences and extensions appear in `DATABASE_OBJECT_MANIFEST.md`; no Soundpub default ACL rows.
- `CANONICAL_SCHEMA.sql` is a sanitized production schema representation with two production-specific identity constants parameterized and post-remediation ACL/policy state integrated. Isolated schema-only creation passed with prerequisites; clean-stack deterministic migration, external auth trigger, blank-cluster ledger and grant parity not proven. **Database Reproducible: NO** by full-phase standard.
- Thirty baseline SQL files include duplicate day-only versions, four pre-existing untracked financial migrations, and no live migration history. No historical migration replay or destructive SQL occurred.

## Edge Functions

- 34 repository entrypoints with deployed counterparts; **20 identical, 14 byte-drifted, 0 repo-only**, and **3 remote-only** (`auth-email-hook`, `hello`, `main`). After BOM/CRLF normalization, only two of the 14 differ in code; missing repo `_shared/cors.ts` and remote-only auth hook prevent clean checkout deployment.
- `create-user` alone was uploaded with `scp` after volume mapping check and rolled forward through `docker compose up -d --force-recreate functions`. Prior runtime source retained privately; local/remote/container SHA-256 match. Direct origin denies anonymous and admin-to-superadmin/label-other-parent probes, but public hostname still returns old behavior and does not reach this origin log. **Drift resolved: NO** (critical public path unresolved).

## Security

- Fixed: production role-table client DML revoked, admin/target policy hardened, rate-limit client grants and RPC execution revoked, limiter RLS enabled. A current-state database backup and isolated restore followed these fixes. SQL assertions pass both isolated and live.
- Not deployed: proposed email/backup authorization patches failed independent compatibility review (trusted service-role email callers and scheduler). Contracts remains public, with zero current objects but a future legal-document exposure path. Broad SECURITY DEFINER execution and shared-host storage SELECT policies still require remediation. No full real-user positive authorization matrix or public-path PASS.
- Regression checks: `scripts/database_security_assertions.sql` PASS; `scripts/phase1-edge-security.test.cjs` PASS mocks; `scripts/process-royalty-upload.test.cjs` PASS. `npm run build` PASS. `npm run lint` FAIL (294 errors, 46 warnings across existing repo). Independent QA status: **FAIL overall**.

## Authentication

- 211 shared auth users; 182 linked to Soundpub profiles, 29 without profile held as unknown. No orphan Soundpub profiles/role links or normalized duplicate email groups found. Manifest hashes internal UUIDs; no passwords, tokens or identity values exported.
- Cross-tenant exclusivity, Keycloak `(issuer, subject)` mapping, Google linking, provider callback allowlists, password-hash migration feasibility, session revocation and suspension flows remain unverified. **Auth ownership verified: NO** for migration approval.

## Storage

- 598 distinct database/settings-referenced physical objects matched metadata (9,950,688,219 metadata bytes): 22 exact avatars and 18 gallery objects included, 445 other avatars held. Initial scan also found **278 GCS + 120 legacy Supabase Cloud URL references**, not backed up. CSV has 1,510 observations, not 1,510 unique files.
- Source-linked ownership is not exclusive ownership; 466 local candidates and external objects remain unresolved. Scoped content checksum/restore PASS: 598/598 SHA-256 matches, exact bytes and zero extras. **Storage ownership verified: NO** for migration approval.

## Backup

Database: **PASS** for scoped custom-format current-state archive, checksums, isolated PostgreSQL 17.6 restore with ACLs and matching 33-table/34,425-row metadata comparison. Full shared-host role/platform and off-host disaster recovery remain BLOCKED.

Storage: **PASS for 598-object scoped archive and isolated byte restore**; 598/598 hashes match, zero extras. Full external/shared-owner disaster recovery and privacy remain FAIL/BLOCKED. Restore: database scoped **PASS**, storage scoped **PASS**, overall **FAIL/BLOCKED** because external/unknown objects, privacy, encryption/off-host recovery and application restore are incomplete. Archives are private on production host, not encrypted or off-host; do not treat them as a full disaster recovery plan.

## Financial Integrity

**FAIL for migration sign-off.** Current balance/reservation arithmetic read-only checks passed; 14,474 royalties reconcile today. Legacy upload provenance, two paid invoice PDFs, webhook partial-success recovery, composer's missing RPCs, historical correctness and exact snapshot equality remain unresolved. No balance/payment mutation was performed.

## Compatibility Matrix

655 repository static call records and 205 deployed-source records documented, across Data API, RPC, auth, Edge, Storage, Realtime and environment/type usage. **Static scan coverage: all discovered matches; behavioral/contract coverage: unmeasured, not 100%.** Four live-missing Copyright RPCs have active frontend callers. Dynamic URLs, aliases, external consumers and public routing remain open.

## Tests

Unit/mock: create-user and royalty regressions PASS. Integration: limited negative production probes PASS at direct origin; public routing FAIL. Security: role/limiter PASS, privileged APIs/definers/contracts FAIL. Database restore: scoped PASS; storage byte restore: scoped PASS. Provider-safe webhook/email/login/authorization full matrices, legacy external-byte restore and independent end-to-end QA are NOT VERIFIED.

## Remaining Risks

**CRITICAL:** privileged email/backup callers unauthenticated, public `create-user` route not mapped to patched runtime, legal bucket public. **HIGH:** 51 definers, shared Storage RLS, SSO identity linking, Xendit callback idempotency, external object ownership, incomplete recovery. RPO/RTO and provider reconciliation unknown.

## Phase 2 Recommendation

**NOT READY.** Mandatory 85/100, zero critical, full reproducibility, security, ownership, full-scope restore and independent QA gates have not passed. No automatic progression to Phase 2.

## Required Next Action

Trace Cloudflare/public `supabase.carubra.com` to its actual origin and validate/deploy the right `create-user` runtime without changing production callbacks. Design and independently test internal service-role email and scheduled backup authorization; move `contracts` to private with owner-scoped signed downloads. Finish definer/grant/security and tenant ownership review, recover external storage bytes, complete scoped storage checksum/restore plus off-host encrypted backup, reproduce schema with auth prerequisites, run role/provider/financial exactness matrices, then score again. Preserve all current traffic/routes until every gate passes.