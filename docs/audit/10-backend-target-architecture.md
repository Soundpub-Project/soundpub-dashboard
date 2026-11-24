# 10 — Backend Target Architecture

Status: **TARGET DESIGN — PARTIALLY IMPLEMENTED, NOT PRODUCTION-ENABLED**

## Target boundary

The backend should become the single authoritative runtime for all Soundpub domain operations. Supabase may remain the legacy source until verified migration, but production writes and reads should flow through `/api/v1`.

Target request path:

```text
React/Vite UI
  -> src/api/* adapters
  -> backend Fastify /api/v1
  -> server-side authorization and validation
  -> PostgreSQL schema owned by migrations
  -> ledger/outbox/worker
  -> private object storage and external providers
```

## API layer

- Versioned REST under `/api/v1`.
- Strict request/response schema validation.
- Bearer authentication with trusted verifier and repository-resolved principal.
- CSRF protection for browser sessions.
- Policy-based authorization, never UI-based authorization.
- Request IDs and redacted auth headers.
- OpenAPI contract kept in sync with routes.

Evidence of partial implementation: `backend/src/api/index.ts:48-58,138-195,199-214,267-276,329-331`.

## Identity and authorization

- Backend-issued sessions with local/CSRF handling in frontend adapter (`src/hooks/useAuth.tsx:74-77,114-130`).
- Production identity through validated OIDC/Keycloak, never dev mocks (`backend/src/auth/providers.ts:13-17,110-146,218-246,258-269`).
- Exact redirect allowlists (`backend/src/auth/providers.ts:172-202`).
- Policies for `authenticated`, `owner`, `owner-or-admin`, `admin`, and `superadmin` (`backend/src/auth/index.ts:52-67`).

## Data layer

- PostgreSQL 17 with migrations as the only schema authority.
- Startup checks for migration ledger, required domain tables, and required columns (`backend/src/main.ts:38-70`).
- No query/hash override in runtime config (`backend/src/config/index.ts:80-99`).
- Isolation gate allowing only development/test (`backend/src/config/database-target.ts:21-24`).
- Live schema drift must be eliminated before production uses backend routes.

## Financial domain

- IDR-only `BigInt` minor-unit money (`backend/src/finance/money.ts:3-29`).
- Legacy split policy `SOUNDPUB_LEGACY_70_21_9` with `HALF_UP_PER_ROW` (`backend/src/royalties/split.ts:4-14`).
- Checksum-bound import, transactional commit, idempotent ledger events, independent reconciliation, and append-only corrections (`backend/src/royalties/contracts.ts:6-39`; `backend/src/royalties/index.ts:111-130,750-802,1003-1062`).
- Composer royalties enforce active copyright beneficiaries and exact minor-unit posting (`backend/src/composer-royalties/index.ts:118-139,224-232,266-278`).

## Storage domain

- Private object storage only.
- Browser never receives long-lived bucket credentials.
- Short-lived signed PUT/download capabilities with ownership checks.
- SHA-256, MIME, and size validation before finalizing uploads.
- Stable DB object references, not signed URLs (`backend/src/media/index.ts:186-190`).
- Capability lifetimes bounded (`backend/src/storage/s3.ts:40-43`).
- Production storage adapter required; current S3 adapter rejects production (`backend/src/storage/s3.ts:10-24,54-57`).

## Side effects and providers

- Outbox/worker for asynchronous side effects.
- Notification only after successful reconciliation and integrity checks (`backend/src/royalties/notification-handler.ts:7-28`).
- Real provider adapters required for Xendit, payouts, distributor submission, and notifications; current state is partial/mock-oriented (`docs/backend/SUPABASE_BACKEND_CAPABILITY_MATRIX.md:198,201,215`).

## Frontend migration model

- Domain flags from `VITE_SOUNDPUB_BACKEND_DOMAINS` remain the temporary rollout mechanism (`src/api/routing.ts:1-6`).
- Each domain must be proven independently, then defaulted to backend.
- Direct Supabase imports are removed only after the domain has no legacy writes and rollback has been tested.
- Production build must actually enable the selected backend domains; current evidence says it does not (`docs/backend/SUPABASE_BACKEND_CAPABILITY_MATRIX.md:216`).

## Observability and operations

Required target controls:

- Structured logs with request IDs.
- Metrics for request rate, error rate, latency, ledger posting failures, outbox lag, reconciliation status, and storage capability failures.
- Alerts for migration-ledger failure, stale outbox, mismatched reconciliation, and rejected checksums.
- Runbooks for restore, rollback, batch correction, provider outage, and storage incident response.

## Finding

The target architecture is coherent and partly implemented. It is not yet a production architecture because config gating, schema parity, provider integrations, production storage, frontend default routing, CI/CD, and operational controls remain incomplete.
