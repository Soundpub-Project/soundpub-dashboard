# Phase 1F Finding Reclassification

Date: 2026-10-27 (Asia/Bangkok). Classifications use current `.space` production evidence. Each listed finding has exactly one P0–P5 category. Historical reports remain evidence; their severity labels are not carried automatically.

## Counts

| Category | Count |
| --- | ---: |
| P0 — PRODUCTION MIGRATION BLOCKER | 8 |
| P1 — PRODUCTION SECURITY ISSUE, NOT MIGRATION BLOCKER | 4 |
| P2 — SHARED-INFRA RISK REQUIRING ISOLATION | 5 |
| P3 — LEGACY/DEVELOPMENT ISSUE | 3 |
| P4 — TECHNICAL DEBT | 4 |
| P5 — RESOLVED / FALSE BASELINE | 7 |

## P0 — Production Migration Blocker

| ID | Finding | Previous position | Production evidence / action |
| --- | --- | --- | --- |
| P0-01 | Approved Soundpub Auth extraction set does not exist. | 211 host-wide users treated as migration population risk. | Current partition is 110 candidate-only, 16 SHARED, 29 OTHER PROJECT, 56 UNKNOWN. Resolve ownership/provider binding; never copy all users. **Also blocks formal Phase 2 scope admission.** |
| P0-02 | Approved deterministic Storage selection and required external bytes do not exist. | 598-file scoped archive and 1,533 observations were incomplete. | Current metadata: 582 attributed, 108 other, 1,609 unknown; 407 current GCS/legacy identities lack verified bytes. **Also blocks formal Phase 2 scope admission.** |
| P0-03 | Soundpub DB extraction is not independently isolated from shared Auth/Storage objects. | Application DDL reproduced, full platform not reproduced. | Shared Auth trigger calls Soundpub; Storage policies call Soundpub helpers; Auth FKs/roles/search paths required. Define target contracts and extraction order. **Also blocks formal Phase 2 scope admission.** |
| P0-04 | Mounted production `send-app-email` and `backup-storage-to-drive` lack caller authentication. | Previously conflated with unknown `.com` runtime. | Fresh mounted `.space` source proves missing handler boundary while router JWT verification is disabled. Secure/deploy/test without breaking legitimate internal callers. |
| P0-05 | Financial provenance/integrity has five current failures and provider settlement is not reverified. | Phase 1E 15 PASS / 5 FAIL. | Fresh active-production run: original 15 PASS / 5 FAIL plus 21 extended PASS. Classify 14,474 missing source rows, upload replay/count gaps, and two paid invoice gaps; reconcile provider state. |
| P0-06 | Full tenant-scoped disaster recovery and cutover rollback are absent. | On-host scoped DB/storage restore passed; off-host/full application restore failed. | Current artifacts remain on production host; no encrypted independent readback, full Auth/external object/provider config recovery, exact finance restore, or end-to-end smoke matrix. |
| P0-07 | Four active Copyright RPC contracts are absent in production. | Active frontend callers, zero live functions. | Still zero overloads. Approve behavior and build/test replacement before compatible migration. |
| P0-08 | Exposed current shared-stack and Soundpub ingress/provider credentials remain uncontained. | Phase 1D/1E incident open. | Shared Supabase/JWT/DB/SMTP and Soundpub Cloudflare/Xendit exposure require consumer mapping, coordinated rollover, old-credential rejection and rollback before production migration/cutover; do not rotate host-wide credentials unilaterally. |

## P1 — Production Security Issue, Not Migration Blocker

| ID | Finding | Production evidence / action |
| --- | --- | --- |
| P1-01 | SECURITY DEFINER boundaries remain unsafe. | 51 routines; two missing fixed search paths; client-executable sensitive routines. Harden grants/actor checks and verify intended callers. |
| P1-02 | Production dashboard exposes debug/OAuth pages and SQL schema export. | Current GETs return 200; served bundle uses `.space`, so this is an active frontend issue. Deploy clean build and verify cache/origin. |
| P1-03 | Artist password administration and SSO binding contain high-impact authorization gaps. | Mounted source lacks complete target hierarchy and strict SSO claim/account binding. Fix and run real role/provider matrix. |
| P1-04 | Xendit invoice creation lacks durable provider idempotency/reconciliation. | Local webhook fixtures pass, but provider-success/DB-failure and concurrent invoice creation remain unsafe; provider state not reverified. |

## P2 — Shared-Infra Risk Requiring Isolation

| ID | Finding | Production evidence / action |
| --- | --- | --- |
| P2-02 | Shared authenticated role can read Soundpub private buckets by bucket membership alone. | Current policy covers private media without application/member/owner predicate. Replace permissive policy only after cross-app impact review. |
| P2-03 | Shared/unknown identities have cross-application dependencies. | 16 SHARED and six UNKNOWN-with-other-app records; external consumers cannot be disproved by DB alone. Preserve dependencies. |
| P2-04 | Auth trigger/email hook/session lifecycle is host-wide. | GoTrue and shared trigger/hook paths affect other projects. No global Auth setting or identity mutation without owner map. |
| P2-05 | DB roles, extensions, exposed schemas, search paths and Storage policies are shared platform contracts. | Recreate only Soundpub-required target contracts; do not clone/revoke host-wide authority blindly. |
| P2-06 | Backup Function selects shared/unclassified buckets and has unknown scheduler ownership. | Do not run or migrate host-wide bucket list as Soundpub backup. Establish authenticated scheduler and per-object approved scope. |

## P3 — Legacy/Development Issue

| ID | Finding | Reclassification |
| --- | --- | --- |
| P3-01 | `.com` privileged endpoint behavior and Kong path. | Live connector maps `.com` to legacy `20.20.20.173:8000`; results are not `.space` production evidence. Preserve only as legacy security/decommissioning work; provider callbacks remain separately unresolved under P0/P4 evidence. |
| P3-02 | Runbooks and Xendit setup documents label `.com` production. | Historical/stale documentation. Update after provider/consumer owner confirmation. |
| P3-03 | Migration runner defaults target `.com`. | Operator/development risk; must not be used for current production. Make production target explicit in later maintenance work. |

## P4 — Technical Debt

| ID | Finding | Production evidence / action |
| --- | --- | --- |
| P4-01 | Standard migration ledger and full platform provenance are absent. | Canonical counts/fingerprint help, but deploy history and shared platform replay remain incomplete. |
| P4-02 | Five mounted Functions differ semantically from repository source. | Select canonical source per handler; preserve remote-only fixes; deploy only in an approved later phase. |
| P4-03 | Complete real-role authorization matrix is missing. | Mocks/catalog checks do not cover ten roles, inactive/suspended states, two-way tenants, bytes, providers and sessions. |
| P4-04 | Legacy/deployed verification and GCS helper endpoints remain without retirement decisions. | Establish callers, replacement and removal plan; do not delete on absence of repository calls alone. |

## P5 — Resolved / False Baseline

| ID | Finding | Resolution evidence |
| --- | --- | --- |
| P5-01 | Production source hostname unknown. | Dashboard bundle, `.space` connector and direct `.3` stack align. |
| P5-02 | `.com` origin entirely unknown. | Connector now maps it to `20.20.20.173:8000`; downstream Kong ownership/runtime remains legacy follow-up. |
| P5-03 | Contracts bucket public. | Current production `contracts.public=false` and zero objects. Workflow authorization still requires testing. |
| P5-04 | Direct `user_roles` escalation and `rate_limits` exposure. | Earlier live/isolated assertions passed; not reproduced as current blockers. |
| P5-05 | Application DDL cannot reproduce. | Two isolated 949-record runs matched each other and live application fingerprint; full platform remains P4/P2 work. |
| P5-06 | Selected Storage archive bytes cannot restore. | Prior independent 598/598 checksum/isolated restore passed. Ownership/completeness remain P0-02. |
| P5-07 | `.com/create-user` mismatch proves current production is unpatched. | False baseline after authoritative production correction; current dashboard selects `.space`. `.space` privileged APIs are assessed directly instead. |

## Admission effect

Formal Phase 2 requires sufficient DB, Auth and Storage isolation and Backend Build Readiness at least 75. P0-01, P0-02 and P0-03 directly fail those admission conditions. P0-04 through P0-08 primarily block safe production migration/cutover, but must be represented in replacement contracts. Isolated prototype work with synthetic data can proceed outside formal Phase 2 only if it has no production import/write, provider callback, shared credential, or shared-stack dependency.
