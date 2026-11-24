# 02 — Project Architecture

Status: **SPLIT ARCHITECTURE — LEGACY SUPABASE RUNTIME WITH PARTIAL BACKEND REPLACEMENT**

## Current architecture

Soundpub is currently two systems sharing one frontend codebase.

### Frontend

- React/Vite SPA in `src/`.
- Root Supabase singleton at `src/integrations/supabase/client.ts:2,5-19`, using `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, schema selection, `localStorage`, `persistSession`, and `autoRefreshToken`.
- Domain adapters under `src/api/` provide an alternate HTTP path to `/api/v1` using `VITE_SOUNDPUB_API_URL`, bearer token provider, CSRF header, and `credentials: 'include'` (`src/api/client.ts:27-37,46-85`).
- Backend routing is opt-in by domain through `VITE_SOUNDPUB_BACKEND_DOMAINS` (`src/api/routing.ts:1-6`). Finance mode is derived from releases/royalties/payouts/payments domains (`src/components/finance/mode.ts:4-8`).

### Backend

- TypeScript modular monolith, Node 22, Fastify, REST `/api/v1`, PostgreSQL 17, SQL migrations, outbox/worker, local identity and private S3-compatible development object storage (`docs/backend/ARCHITECTURE.md:22-30`).
- Entrypoint `backend/src/main.ts:38-51` loads config, identity provider, and DB pool, and refuses to boot if the migration ledger table is missing. It also checks required domain tables and payment-invoice migration columns at `:55-70`.
- Fastify app factory uses schema validation, request IDs, and redacted auth headers (`backend/src/api/index.ts:48-58`). Route modules are registered conditionally at `:199-214`.
- Server authorization is policy-based: `authenticated`, `owner`, `owner-or-admin`, `admin`, and `superadmin` (`backend/src/auth/index.ts:52-67`). Identity mock/dev configuration is bootstrap-only and forbidden in production (`:23-30`).
- OIDC configuration validates endpoint/audience and claims (`backend/src/auth/providers.ts:110-146,218-246`) and selects configured provider at `:258-269`. The mock provider is dev/test-only at `:13-17`.

### Data and storage

- Backend migrations: 81 SQL files, contiguous `0001` through `0081`, under `backend/migrations`.
- Backend tests: 140 `*.test.ts` files under `backend/test`.
- Storage: backend S3 adapter keeps buckets private and rejects production at `backend/src/storage/s3.ts:10-24,54-57,80-90`.
- Financial ledger: money is IDR-only with `BigInt` minor units (`backend/src/finance/money.ts:3-15`); royalty posting, reconciliation, and corrections are in `backend/src/royalties/`.

### Deployment packaging

- Root Compose packages only the web frontend: one `web` service, container `soundpub-dashboard`, port `8181:80`, external network (`docker-compose.yml:1-21,29-31`).
- Root image builds with Node 22 and serves with nginx (`Dockerfile:1-54`). Environment build args are checked at `:6-35`.
- Backend dev stack uses Compose project `dashboard-sounpub-dev` (`backend/docker-compose.yml:1`) with local-only Postgres/object-storage ports (`:19-20,47-48`), backend API (`:129-136`), frontend dev (`:171-180`), and internal networks/volumes (`:182-188`).

## Target architecture

The intended target is a single authoritative backend for domain writes and reads:

- `src/api/*` adapters replace direct Supabase table/RPC/function calls.
- `backend/src/api/*` becomes the only HTTP contract for frontend clients.
- PostgreSQL schema is owned by migrations, with live schema drift eliminated.
- Auth sessions move from browser-persisted Supabase sessions to backend-issued sessions with CSRF and server-side policy enforcement.
- Storage moves from direct browser-to-Supabase bucket access to backend-issued short-lived capabilities against private object storage.
- Financial calculations, royalty splits, ledger entries, reconciliation, and corrections are authoritative only in the backend.
- Outbox/worker handles side effects and provider integration.

## Current mismatch

The target is not yet the operating model.

- The previous audit still reports **38/100 NOT READY** (`SUPABASE_MIGRATION_AUDIT.md:7`).
- Backend architecture still reports **52/100** and production cutover unapproved (`docs/backend/ARCHITECTURE.md:3,7`).
- Runtime code rejects non-dev/test environments (`backend/src/config/database-target.ts:21-24`).
- The production frontend build does not enable backend domains (`docs/backend/SUPABASE_BACKEND_CAPABILITY_MATRIX.md:216`).
- Provider integrations are partially mocked or blocked, including real distributor integration at `:198`, real Xendit at `:201`, and broader provider gaps at `:215`.

## Architectural risk

The main risk is ambiguous authority. While both paths remain active, the same user action may be validated, stored, or authorized differently depending on build-time env flags. This is acceptable for staged development but not for production. Cutover must be domain-by-domain with explicit parity evidence, not a global flag flip after target writes begin.
