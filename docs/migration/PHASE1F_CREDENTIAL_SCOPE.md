# Phase 1F Credential Scope

Date: 2026-10-27 (Asia/Bangkok). Read-only reclassification; no secret values, fingerprints, token probes, or rotations.

## Production linkage

The active dashboard bundle at `dashboard.soundpub.xyz/assets/index-DBB0wF_R.js` contains `https://supabase.carubra.space` (public GET, 2026-10-27). Direct SSH to `maskhar@20.20.20.3` from `/data/supabase/instances/supabase-01/config` confirms running Auth, gateway, DB, Functions, REST, Realtime, and Storage. Prior credential exposures documented in `PHASE1D_CREDENTIAL_CLOSURE.md` and `PHASE1E_CREDENTIAL_INCIDENT.md` concern this self-hosted stack, not merely the `.com` gateway. The reports document exposure but do not prove which external consumers have retained copies or which provider credentials remain valid today.

| Previously exposed credential family | Phase 1F scope | Evidence / uncertainty | Required action, not performed |
| --- | --- | --- | --- |
| Privileged Supabase secret API key; service-role JWT and signing material | SHARED PRODUCTION IMPACT | Shared `.space` gateway, Functions and signing/verifier path; earlier incident reports. | Map every consumer and verifier; coordinated rollover and old-token rejection with shared-app approval. |
| Symmetric JWT secret/JWK and service token | SHARED PRODUCTION IMPACT | Earlier incident reports identify Auth, REST, Realtime, Storage and other common verifiers. | Verify supported rollover, session recovery and complete verifier retirement. |
| PostgreSQL credentials | SHARED PRODUCTION IMPACT | Shared DB and dependent services in prior incident report. | Inventory external clients; coordinate DB/service credential replacement. |
| SMTP password and email-hook secret | SHARED PRODUCTION IMPACT | Auth/Functions mail path in prior incident report; provider ownership and current validity not reverified. | Coordinate provider and hook changes, test delivery and recovery. |
| Xendit API secret and webhook token | PRODUCTION SOUNDPUB IMPACT | Soundpub invoice/webhook source and earlier exposure; live provider dashboard callback destination and current validity unverified. | Confirm callback ownership, reconcile pending events, rotate through provider owner. |
| Cloudflare tunnel token exposed in Phase 1E | PRODUCTION SOUNDPUB IMPACT | Earlier report names `network-soundpub`; fresh topology maps that connector to the live `dashboard.soundpub.xyz` frontend. Its exact exposed-token validity and Cloudflare control-plane state remain unverified. | Identify owner and token validity; rotate/revoke through frontend ingress rollback plan. |
| Migration service-role JWT in local artifact | UNKNOWN | Prior report cannot establish issuer, destination, validity or tenant scope. | Identify owner/issuer offline; safely retire if active. |

No exposed family is demonstrated **LEGACY ONLY**. `.com` route findings alone do not prove `.space` compromise, but shared-stack credentials above are not cleared by the corrected hostname. No production credential was changed. Existing incident remains OPEN. No shared key rotation, global session revocation, or gateway/service restart is permitted without impact map, checkpoint, and other-application owners. This is security remediation before production cutover, not a prerequisite to writing an isolated replacement backend without production writes.
