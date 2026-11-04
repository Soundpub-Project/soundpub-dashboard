# Privileged API Closure — Agent C

Observed 2026-10-27, Asia/Bangkok. **PRIVILEGED API SECURITY = BLOCKED. Email authorization and backup authorization remain UNVERIFIED in production.** Baseline staged remediation is documented in `PRIVILEGED_API_SECURITY_REPORT.md`; it is not deployed. Public `.com` routing remains unresolved; see `PUBLIC_ROUTING_CLOSURE_REPORT.md`.

## Coordinator lock and scope

No Edge Function upload, service recreation, production SQL mutation or routing modification is permitted until Agent B reports the credential dependency/rollback checkpoint and coordinator explicitly releases. Neither prerequisite was received in this assignment. No mail/backup execution probe was sent: existing deployed handlers can perform side effects before authorization, so anonymous probing cannot be assumed read-only. No provider delivery, Drive write, test token issuance or credential rotation occurred. Existing staged code was preserved without edits. Only the two owned closure reports were created.

## Legitimate callers and minimum capability

Current executable repository searches reconfirm the baseline caller set. Previous mounted-source inventory is historical evidence, not a complete current external caller inventory.

| Handler / caller | Caller class | Staged authorization |
| --- | --- | --- |
| Email / `src/components/notifications/AnnouncementDialog.tsx:55` | Authenticated admin browser | Auth getUser plus authoritative active profile and admin/superadmin DB role; bounded announcement broadcast |
| Email / `src/pages/Payouts.tsx:136` | Authenticated payout owner browser | Owned recent pending payout with matching stored details; server-derived admin recipients and payout deduplication |
| Email / `send-password-reset/index.ts:138` | Internal function | Exact configured service credential; password-reset template, UUID recipient, configured-origin action URL |
| Email / `reset-password/index.ts:103` | Internal function | Exact service credential; password-reset-confirmation template |
| Email / `send-verification-email/index.ts:89` | Internal function | Exact service credential; email-verification template |
| Email / `xendit-webhook/index.ts:189` | Internal payment handler | Exact service credential; payment-success template; upstream callback trust is separate |
| Backup / no executable caller found | Scheduler, worker or operations identity UNKNOWN | Exact service credential only; no browser role or spoofable trigger/IP header grants access |
| Both / external clients and private schedules | Inventory incomplete | Unknown identities denied by staged code; compatibility unproven |

Normal user privileged email execution is denied. Owned payout notification is a narrowly authorized existing user workflow, so blanket denial of every ordinary-user email request would break that caller. Admin announcements require admin role; backup denies every user token, including admin. No privileged secret enters frontend code.

The four existing internal email callers use one shared service credential; staged code restricts template capabilities but cannot attribute individual processes. Process-specific least privilege requires coordinated caller changes outside this agent's ownership. Credential rotation must update those consumers. Backup scheduler identity, payload, cadence, destination ownership and rotation dependency remain unknown. Historical inspection found no relevant cron or SQL caller; absence from readable files does not exclude external/private schedules.

## Local controls reviewed

Existing `_shared/privileged-api.ts` compares SHA-256 digests against the configured service credential, checks legacy service JWT role/expiry/not-before, and uses Auth getUser plus server-side profile/role for browser callers. User metadata is not an authorization source. POST only, bounded JSON parsing (65,536 bytes), fail-closed errors and database unique-slot rate limiting precede business effects.

Email restricts templates/selectors, validates action URLs and stored payout ownership, escapes rendered data and uses keyed delivery claims. Backup requires empty JSON, service identity, provider readiness and rate reservation before backup work. Limits are 60 service email requests/minute, 10 user email requests/minute and 1 backup/minute; compatibility with unidentified scheduler is unverified. Existing Bearer credentials remain reusable: no cryptographic anti-replay claim. Keyed email deduplication is not an outbox; claim retention after failure can delay retries. Backup rate limiting is not a distributed execution lock. These limitations remain as described in the prior staged report.

## Deployment identity and checksums

Fresh Compose inspection from `/data/supabase/instances/supabase-01/config` confirms `functions` bind `/data/supabase/instances/supabase-01/config/volumes/functions` to `/home/deno/functions`. Runtime image is `supabase/edge-runtime:v1.74.0`. No upload followed. This host is proven for `.space`, not `.com`.

| Source | Mounted SHA-256 | Local staged SHA-256 |
| --- | --- | --- |
| `send-app-email/index.ts` | `bc51345a1021ec8856c0b8f50fb53a6cb059b83513429c849d50c7d9409ee1ab` | `95a57892f6a60ce34bd2b86673ce4a0ce9237f5ad0eddb420d9f3674118bcc8e` |
| `backup-storage-to-drive/index.ts` | `6bbfbf3091ada52201dfabb5cec5e502e919b8ec017e1c17cbe79e43ddf07130` | `d7708c39e063ab30f8161cb84e4352638d90482738248c3500e7c390c796b460` |
| `_shared/privileged-api.ts` | Not attested in this run | `3c8a599959c29b0be91056333c27087a1c74edf047d4edb17fdf23ac24188d1f` |

Mounted handler hashes equal Phase 1B values: staged guards are not proven deployed. Runtime restart count remained zero at inspection. Future rollback must privately preserve exact handler/shared source and permissions without copying or overwriting secrets/configuration. After release, inspect volume mapping again before first scp; transfer only intended files; recreate/reload only `functions` if required. Do not run Supabase Cloud deployment commands.

## Exact validation run

| Command / test | Result |
| --- | --- |
| `node scripts/phase1-edge-security.test.cjs` | PASS: create-user mock Auth/DB security checks |
| `node scripts/phase1b-privileged-api-security.test.cjs` | PASS: actual staged handler code with isolated Auth/DB/provider fixtures |
| `npm exec -- eslint supabase/functions/_shared/privileged-api.ts supabase/functions/send-app-email/index.ts supabase/functions/backup-storage-to-drive/index.ts` | PASS, exit 0 |

Privileged suite covers anonymous/forged/expired credentials, authoritative role/status checks, internal template ALLOW, admin announcement and owned payout ALLOW, cross-owner denial, malformed/oversized payload, action URL validation, keyed replay/concurrent claims, shared rate limits and provider/DB failure. These remain MOCK results, including simulated database uniqueness and token validation. No production ALLOW, rate, replay or role matrix result is claimed. Build/typecheck not rerun: no source was changed in this assignment. Existing staged typecheck/build results remain historical, not current closure evidence.

Read-only public create-user tests returned `.com` 400 for anonymous, invalid token and malformed body; `.space` 401 in all three cases. Exact request IDs and correlation are in the routing closure report. This mismatch prevents attributing public email/backup behavior to inspected source.

## Remaining blockers

1. Agent B credential dependency/rollback checkpoint and explicit coordinator release.
2. `.com` Cloudflare/Kong route ownership, actual handler runtime and safe rollback proven.
3. Backup legitimate caller, credential delivery, cadence and destination ownership confirmed; shared internal credential scope disposition coordinated with caller owners.
4. Deploy staged guards to the proven intended runtime with source rollback; preserve remote secrets and configuration.
5. Public `.com` integration matrix: anonymous, ordinary user, invalid internal credential and malformed payload DENY; actual valid internal callers ALLOW; replay where supported and rate abuse controlled. Use safe recipient/object fixtures and provider controls so tests do not email production recipients or duplicate backups.
6. Independent QA against public runtime, including compatibility and old-credential revocation evidence from Agent B.

No production gate earns PASS or readiness credit from this assignment. Phase 2 remains blocked.
