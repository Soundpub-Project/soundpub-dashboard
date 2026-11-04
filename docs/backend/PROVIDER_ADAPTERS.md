# Provider adapters

Status: Phase 2 ports and local mock contracts. No provider credential, live API, callback registration or network dependency is authorized.

## Adapter rules

Domain services depend on small provider interfaces. Bootstrap injects mock implementations; tests inject deterministic failures and result fixtures. Keep provider response formats, credentials and SDK types behind adapters. Validate inputs/results at trust boundaries and map failures to stable typed categories without leaking private provider details.

Implement only methods needed by representative slices. Future capability names below reserve semantics; they do not require unused SDKs, factories, OAuth stacks or real-provider clients. Unsupported capability returns an explicit controlled failure, never fabricated success.

| Port | Needed semantics | Phase 2 implementation | Later gate |
| --- | --- | --- | --- |
| `IdentityProvider` | Verify access evidence, resolve/get identity; refresh/revoke capability | Server-controlled synthetic identity and dedicated-DB principal resolver | Verified OIDC/Keycloak/Google issuer, audience, subject, sessions and callback approval |
| `EmailProvider` | Send authorized notification with stable operation ID | Local result recorder/failure injector; no SMTP | Dedicated SMTP/account, recipient scope, delivery/retry and credential review |
| `PaymentProvider` | Create invoice, fetch status, verify webhook, reconcile | Deterministic synthetic invoice/status/event fixture | Sandbox proof then separate production Xendit/settlement/callback approval |
| `ObjectStorageProvider` | Put/get/delete/exists, metadata, signed capabilities | Dedicated development S3-compatible object storage adapter | Approved per-object manifest, private access, restore and byte recovery |
| Spotify adapter | Bounded artist lookup/projection | Fixture artist response or explicit unsupported operation | Dedicated credentials, quotas, caller authorization and cache policy |
| `AnalyticsProvider` | Allowlisted public config/event boundary | Local no-op/recorder with no browser secret | Approved target property, consent/data policy and sanitized projection |
| Legacy/external Storage adapter | Later provider/host/key reference resolution | Disabled; synthetic reference mapping only | Owner/transfer rights, origin attestation, exact manifest and scoped credentials |

## Payments and webhooks

Mock invoice uses synthetic IDs and exact decimal amount representation. It must not reuse a real invoice, account, financial row, callback URL or client secret. Payment status does not become settled merely because a fixture says HTTP success; domain transition, idempotency and audit remain explicit service responsibilities.

Provider webhook verification receives raw bytes plus required authentication evidence. It verifies before parsing trusted event semantics and uses replay/deduplication contract from [worker design](WORKER_OUTBOX_DESIGN.md). A fake HMAC/header convention proves architecture only; it is not Xendit's production authentication specification.

Reconciliation is a distinct capability: compare durable local operation identity and provider status after ambiguous timeout or response loss. No automatic repeat of an unknown invoice/payment side effect without stable provider idempotency or reconciliation.

## Errors, retry and secrets

Classify provider outcomes as success, retryable, permanent, unauthorized or unsupported. Timeouts and cancellation are bounded; worker retry policy owns backoff and attempt budget. Avoid nested independent retries multiplying requests. Never log authorization headers, raw provider payloads, signed URLs, account tokens or private media.

Configuration contains names of dedicated local variables only in committed examples. Actual local credentials live outside version control. Browser/Vite variables must never contain server/provider secrets. Staging/production identity/payment/email/storage adapters cannot silently fall back to a successful mock.

## Legacy function responsibility

The [function map](../migration/PHASE1G_FUNCTION_REPLACEMENT_MAP.md) contains 37 future dispositions: 11 backend API, four worker, one webhook, 14 Auth adapter, one Storage adapter, two deprecations and four later-review entries. Preserve that exact scope; don't reconstruct shared runtime/router/mail hook or deploy replacement Edge Functions during foundation.

Five recorded deployed-source drifts remain later review input. New mocks do not fix source authorization, financial reconciliation, legacy callback ownership, missing Copyright RPCs or production credentials. No existing provider or Supabase dependency is removed from production in this phase.

See [Auth](AUTH_DESIGN.md), [Storage](STORAGE_DESIGN.md), and [module boundaries](MODULE_BOUNDARIES.md).

