# Phase 1F Final Report

## Status

BLOCKED

## Authoritative Production

Domain: `supabase.carubra.space`

Server: `20.20.20.3`

Verified: YES — served dashboard bundle selects `.space`; live Cloudflare connector selects `supabase-envoy:8000`; direct SSH verifies the shared Compose stack and mounted Functions.

## Legacy Environment

Domain: `supabase.carubra.com`

Server: `20.20.20.173`

Classification: LEGACY / DEVELOPMENT — live connector targets `20.20.20.173:8000`, distinct from `.space`. Downstream Kong ownership and any remaining provider/external-client callbacks are not approved or fully inventoried; do not decommission blindly.

## Multi-Project Status

Shared Supabase:
YES

Soundpub isolation:
PARTIAL

## Database Scope

PARTIAL — Soundpub catalog is identifiable, but Auth FKs/helpers, shared Auth trigger, Storage policies, API roles/search paths and shared extensions prevent a schema-only independent extraction today. Dedicated target database is recommended.

## Auth Scope

FAIL — 211 identities classify provisionally as 110 SOUNDPUB ONLY candidates, 16 SHARED, 29 OTHER PROJECT and 56 UNKNOWN. Approved ownership/provider/session migration set does not exist.

## Storage Scope

FAIL — 25 buckets/2,299 objects inventory is complete, but only 582 are Soundpub-attributed, 1,609 remain unknown, exclusive ownership is unverified, and 407 current external identities lack verified bytes. Deterministic approved selection: NO.

## Edge Function Scope

PARTIAL — all 37 runtime entrypoints are inventoried and mapped. Ownership/retirement approval is incomplete; active mounted privileged handlers contain current authorization gaps.

## Previous Findings Reclassified

P0:
8

P1:
4

P2:
5

P3:
3

P4:
4

P5:
7

## Backend Build Readiness

69 / 100

Threshold:
75

| Area | Maximum | Score | Build-stage reason |
| --- | ---: | ---: | --- |
| Source/schema reproducibility | 20 | 18 | Production topology and application DDL are well evidenced; full platform provenance/ledger incomplete. |
| Database/RLS/privileged SQL | 20 | 14 | Catalog/dependencies known; shared hooks, broad Storage read, definers and RPC gaps remain. |
| Auth & privileged API | 25 | 15 | Complete snapshot partition exists; 72 shared/unknown Soundpub-profile identities and active privileged-handler failures prevent sufficient scope. |
| Storage & isolation | 15 | 9 | Complete metadata inventory; approved selection, external bytes and tenant access isolation fail. |
| Deployment & observability | 10 | 8 | `.space` route/runtime and dashboard origin verified; source drift and stale public build remain. |
| Cutover & rollback | 10 | 5 | On-host scoped restore evidence exists; off-host/full application recovery absent. |
| **Total** | **100** | **69** | Below formal Phase 2 threshold. |

## Production Cutover Readiness

52 / 100

Threshold:
85

| Area | Maximum | Score | Cutover reason |
| --- | ---: | ---: | --- |
| Source/schema reproducibility | 20 | 16 | App source/topology strong; platform provenance and callback consumers incomplete. |
| Database/RLS/privileged SQL | 20 | 10 | Isolation, definers, missing RPCs and financial provenance unresolved. |
| Auth & privileged API | 25 | 8 | Approved identity set absent; current privileged APIs and credential incident open. |
| Storage & isolation | 15 | 6 | Ownership/bytes/access gates fail despite full metadata inventory and scoped restore. |
| Deployment & observability | 10 | 7 | Active route known; five function drifts and stale public assets remain. |
| Cutover & rollback | 10 | 5 | No encrypted off-host full recovery, provider reconciliation or end-to-end restore. |
| **Total** | **100** | **52** | Far below cutover threshold. |

## P0 Production Migration Blockers

1. Approved Soundpub Auth inclusion/exclusion set is absent: 16 SHARED and 56 UNKNOWN identities require disposition.
2. Approved deterministic Storage selection is absent: 1,609 unknown objects, ownership gaps and 407 unverified external bytes.
3. Soundpub DB extraction still depends on shared Auth/Storage objects and platform contracts.
4. Active `.space` email and backup Functions lack caller authentication.
5. Five production financial/provenance assertions fail; Xendit settlement/idempotency is not closed.
6. Full tenant-scoped encrypted off-host backup, exact restore and rollback proof are absent.
7. Four active Copyright RPC contracts/functions are absent.
8. Current shared-stack and Soundpub ingress/provider credential exposure remains uncontained; rotate only with other-project impact analysis, rollback and old-credential rejection.

## Shared Infrastructure Constraints

- Never migrate all `auth.users`, all buckets, all objects, global roles, extensions, Auth settings, Storage policies or shared Functions.
- Do not rotate JWT, Supabase, PostgreSQL, SMTP or tunnel credentials until every shared consumer/verifier and session recovery path is mapped.
- Do not invoke current backup/email handlers for testing; reviewed source can write or call providers without authenticated caller proof.
- Do not change shared Auth trigger/email hook, GoTrue configuration, exposed schemas, gateway, Storage RLS or common API roles without impact analysis and other-project approval.
- Treat `.com` as a separate live legacy route until provider dashboards and external consumers confirm non-use; do not redirect or decommission it from repository evidence alone.

## Phase 2 Decision

NOT READY

The formal admission rule fails: Backend Build Readiness is below 75; DB scope is only PARTIAL; Auth and Storage scopes are insufficient; three P0 scope findings directly block safe Phase 2 admission; independent QA is FAIL/PARTIAL. Backend coding with synthetic data could be performed in a separately approved isolated sandbox, but that is not admission to Phase 2 and must not import production data, use shared credentials, call providers, or modify shared production.

## Phase 2 Safety Conditions

- Use a dedicated database/environment, synthetic fixtures and project-specific credentials; no dependency on shared production runtime.
- Define Auth/Storage/DB inclusion contracts first; inclusion lists must be approved, versioned and reversible.
- Preserve UUID/provider mapping requirements without exporting passwords, sessions, tokens or unrelated identities.
- Model privileged operations as authenticated server-side APIs with role hierarchy, active-status checks, idempotency and audit trails.
- Keep all provider integrations disabled or sandboxed; no production Xendit, SMTP, Drive, GCS, OAuth or webhook changes.
- Require a fresh scoped backup and restore checkpoint before any production-data extraction or mutation.

## Remaining Work Before Cutover

- Resolve 56 UNKNOWN and 16 SHARED Auth identities; approve migration/reset/provider-binding/session strategy.
- Resolve Storage ownership/disposition, retrieve and checksum required external bytes, replace broad shared policies and run two-way real-identity tests.
- Define dedicated target DB/Auth contracts; remove shared-object assumptions; close definers and four Copyright RPCs.
- Secure/deploy/test privileged Functions; reconcile function source drift and legitimate internal/scheduler callers.
- Classify finance exceptions, add durable Xendit recovery/idempotency and verify provider settlement/callback destination.
- Contain and rotate affected credentials through coordinated shared-infrastructure change control.
- Deploy clean frontend without debug/schema artifacts; update stale `.com` runbooks only after callback/consumer confirmation.
- Create encrypted independent off-host tenant-scoped backups, independently read them back, restore full application stack and pass cutover/rollback smoke tests.

## Required Decisions

1. Is `supabase.carubra.space` confirmed as authoritative production? **YES.**
2. Is `.com` confirmed legacy/dev? **YES for environment classification; remaining callbacks/consumers are UNKNOWN.**
3. Is Soundpub DB scope independently identifiable? **PARTIAL; catalog yes, extraction boundary no.**
4. Is Soundpub Auth scope sufficiently identifiable? **NO.**
5. Is Soundpub Storage scope sufficiently identifiable? **NO.**
6. Can backend development begin without modifying shared production? **YES only as isolated synthetic-data prototype work; formal Phase 2 remains blocked.**
7. Are there any P0 blockers preventing backend construction? **YES — DB extraction boundary, Auth scope and Storage scope prevent formal Phase 2 admission.**
8. Backend Build Readiness score? **69 / 100.**
9. Production Cutover Readiness score? **52 / 100.**
10. Phase 2 READY or NOT READY? **NOT READY.**
