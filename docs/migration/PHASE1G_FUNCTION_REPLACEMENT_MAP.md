# Phase 1G Function Replacement Map

Evidence: `PHASE1F_FUNCTION_SCOPE.md` mounted-source inventory (2026-10-27); 37 entrypoints, including two shared/platform entrypoints and one unowned example. These are future design dispositions, not approvals to migrate, invoke, disable, or delete any deployed function. One primary classification applies per entrypoint. Shared runtime and Auth hook must not be copied as Soundpub functions.

| Current entrypoint | Replacement class | Phase 2 contract / deferred gate |
| --- | --- | --- |
| `auth-email-hook` | LATER_REVIEW | Shared GoTrue hook: preserve in place; design Soundpub-only notification adapter, seek owner/consumer approval before changes. |
| `backup-storage-to-drive` | WORKER | Build scoped scheduled job from approved object manifest; no shared-bucket sweep, no current unauthenticated invocation. |
| `change-own-password` | AUTH_ADAPTER | User-bound password update; no shared Auth writes during build. |
| `create-copyright-invoice` | BACKEND_API | Authenticated invoice request; sandbox provider and defer settlement proof. |
| `create-user` | AUTH_ADAPTER | Scoped account provisioning with role hierarchy and identity map. |
| `create-whitelabel-artist` | AUTH_ADAPTER | Tenant-bound artist provision; enforce active status and ownership. |
| `create-xendit-invoice` | BACKEND_API | Idempotent payment request, sandbox only until reconciliation. |
| `delete-royalty-upload` | BACKEND_API | Admin reversal transaction with audit and ownership. |
| `delete-user` | AUTH_ADAPTER | Local Soundpub lifecycle only; never delete another project's shared identity. |
| `download-release-invoice` | STORAGE_ADAPTER | Authorized invoice generation plus scoped private object retrieval. |
| `gcs-manage` | DEPRECATE | Disabled deployed stub; remove caller only after supported Storage API replaces it and consumer review passes. |
| `gcs-upload` | DEPRECATE | Disabled deployed stub; same guarded retirement. |
| `get-catalog-tracks` | BACKEND_API | Public allowlisted catalog projection; no service-role overexposure. |
| `get-ga4-config` | BACKEND_API | Public allowlisted analytics configuration only. |
| `hello` | LATER_REVIEW | Remote-only example; owner/consumer unknown; exclude from Soundpub build, do not delete on absent repo callers. |
| `info-soundpub` | BACKEND_API | Public ICCN integration information; contract and consumers to verify. |
| `main` | LATER_REVIEW | Shared Edge runtime/router; replace with dedicated backend ingress, not source copy. |
| `process-royalty-upload` | WORKER | Transactional import with scoped identity creation and commit semantics. |
| `remove-artist-from-label` | BACKEND_API | Scoped artist lifecycle with release/ownership guards. |
| `reset-password` | AUTH_ADAPTER | Native verified recovery; existing token consumers need review. |
| `send-app-email` | WORKER | Authenticated capability-bound outbox; no open mail relay. |
| `send-password-reset` | AUTH_ADAPTER | Native verified recovery and signed notification hook; caller inventory pending. |
| `send-royalty-notification` | WORKER | Authorized royalty outbox; provider sandbox, caller inventory pending. |
| `send-verification-email` | AUTH_ADAPTER | Verified enrollment and signed notification hook; never mutate arbitrary target. |
| `set-artist-password` | AUTH_ADAPTER | Scoped credential management, hierarchy and target-owner checks. |
| `spotify-fetch-artist` | BACKEND_API | Authenticated provider proxy, bounded use and sandbox credentials. |
| `sso-login` | AUTH_ADAPTER | Verify issuer, audience and subject; explicit account linking, no email-only binding. |
| `start-user-impersonation` | AUTH_ADAPTER | Audited explicit capability with active-status and origin checks. |
| `test-gcs` | LATER_REVIEW | Diagnostic caller exists; retain only after owner/need decision; never copy GCS credentials. |
| `transfer-artist-label` | BACKEND_API | Admin transaction preserving historical royalty semantics. |
| `update-app-settings` | BACKEND_API | Superadmin allowlist and value validation. |
| `update-user-password` | AUTH_ADAPTER | Scope credentials to approved Soundpub identity; no shared account mutation. |
| `update-user-role` | BACKEND_API | Validate target, hierarchy and authorization; role is Soundpub-local. |
| `update-user-status` | AUTH_ADAPTER | Soundpub-local suspension; never ban shared Auth globally. |
| `verify-email` | AUTH_ADAPTER | Native verification and signed hook, legacy consumer review. |
| `verify-password-reset-token` | AUTH_ADAPTER | Native recovery/session verification, legacy consumer review. |
| `xendit-webhook` | WEBHOOK | Dedicated authenticated, idempotent callback; no production provider registration in Phase 2. |

Current source includes five semantic production/repository drifts (`backup-storage-to-drive`, `send-app-email`, `send-royalty-notification`, `update-user-role`, `xendit-webhook`). Preserve remote-only fixes during later remediation. Existing `VERIFY_JWT=false` and current privileged endpoint authorization failures are cutover blockers, not permission to invoke them for validation. This map does not include unrelated platform functions merely because they share a volume.

Invariant: table has 37 distinct entrypoints; replacement is built only with synthetic/sanitized fixtures. Runtime deployment, provider callback changes, and shared-hook changes require separate owner approval and impact analysis.
