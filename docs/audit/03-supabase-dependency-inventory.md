# 03 — Supabase Dependency Inventory

Status: **HIGH FRONTEND COUPLING — ADAPTER LAYER PRESENT BUT NOT DEFAULT**

## Dependency declarations

- `@supabase/supabase-js` is declared at `package.json:45`.
- `tus-js-client` is declared at `package.json:69` for resumable uploads.

## Import inventory

Scan scope: `src/*.{ts,tsx,js,jsx,mjs,cjs}`.

- **78** non-test source files import a Supabase module.
- **77** are runtime/value imports.
- **1** is type-only: `src/lib/sessionLimit.ts:1`.
- **19** `src/**/*.test.*` files were found; none import Supabase.
- Including tests, the count remains **78** total / **77** runtime-value.

Root client:

- `src/integrations/supabase/client.ts:2` imports `createClient`.
- `src/integrations/supabase/client.ts:5-7` reads URL, publishable key, and schema from env.
- `src/integrations/supabase/client.ts:12-19` exports singleton configured with `localStorage`, `persistSession`, and `autoRefreshToken`.

## Direct Supabase API usage

Non-test files with direct `supabase.<api>` calls: **69**.

| API area | Files | Occurrences | Representative paths |
|---|---:|---:|---|
| `from` | 48 | 162 | `src/services/users.ts:15,25-26,49-50`; `src/pages/Dashboard.tsx:236-276` |
| `auth` | 22 | 37 | `src/hooks/useAuth.tsx:15,130,159,190` |
| `storage` | 17 | 36 | `src/components/releases/MediaUploadSection.tsx:208-213`; `src/pages/MediaLibrary.tsx:96-102` |
| `functions.invoke` | 20 | 33 | `src/pages/UploadRoyalty.tsx:685`; `src/lib/xendit.ts:29,46` |
| `rpc` | 11 | 26 | `src/hooks/useRoyaltyData.ts:14-252`; `src/pages/Payouts.tsx:84,114` |
| Realtime `channel` | 3 | 3 | `src/components/layout/DashboardLayout.tsx:74`; `src/components/notifications/NotificationBell.tsx:48`; `src/components/notifications/NotificationCenter.tsx:40` |

Counts are non-exclusive; one file may use several API areas.

## Backend adapter layer

Central routing:

- `src/api/routing.ts:1-6` parses `VITE_SOUNDPUB_BACKEND_DOMAINS` and exports `usesBackendDomain()` plus copyright-specific gating.
- `.env.example:12-15` documents `VITE_SOUNDPUB_API_URL` and `VITE_SOUNDPUB_BACKEND_DOMAINS`.
- `src/components/finance/mode.ts:4-8` enables backend finance behavior for releases, royalties, payouts, or payments.
- `src/services/releases.ts:4` gates releases through `usesBackendReleases()`.

HTTP client:

- `src/api/client.ts:27-37` sets token provider and CSRF token.
- `src/api/client.ts:46-85` restricts paths to `/api/v1/`, sends bearer token and CSRF header, uses `credentials: 'include'`, and reads the base URL from `VITE_SOUNDPUB_API_URL`.

Adapter modules under `src/api/` include `auth.ts`, `users.ts`, `royalties.ts`, `media.ts`, `balance.ts`, `payouts.ts`, `payments.ts`, `finance-adjustments.ts`, `releases.ts`, `copyright.ts`, `copyright-registrations.ts`, `notifications.ts`, `settings.ts`, `takedowns.ts`, `tracks.ts`, `artists.ts`, `labels.ts`, `label-custom.ts`, `audit.ts`, and `public-catalog.ts`.

Representative backend switches:

- `src/services/users.ts:11,19-23,73-110`
- `src/services/media.ts:15-18,82-90`
- `src/pages/UploadRoyalty.tsx:1545-1548`
- `src/pages/CopyrightRoyaltyUpload.tsx:467-469`
- `src/components/royalty/ComposerRoyaltyUpload.tsx:636-638`
- `src/components/releases/MediaUploadSection.tsx:583-585`

## Other env-driven integration flags

- `VITE_PARTNER_SSO_ENABLED` at `src/context/SsoAuthContext.tsx:35`.
- `VITE_SSO_*` at `src/lib/keycloak.ts:3-5`.
- `VITE_CONTRACT_BUCKET` at `src/pages/CopyrightRegistrationReview.tsx:78`.

## Migration classification

High-risk direct paths to replace first:

- Auth/session and roles: `src/hooks/useAuth.tsx`, `src/services/users.ts`, `src/components/auth/ProtectedRoute.tsx`.
- Financial reads/writes: `src/hooks/useRoyaltyData.ts`, `src/pages/Payouts.tsx`, `src/pages/UploadRoyalty.tsx`, `src/lib/xendit.ts`.
- Storage/upload: `src/components/releases/MediaUploadSection.tsx`, `src/pages/MediaLibrary.tsx`, `src/lib/storagePaths.ts`, `src/lib/audioClipper.ts`.
- Realtime notifications: `src/components/notifications/*`, `src/components/layout/DashboardLayout.tsx`.

Medium-risk paths:

- Direct `from` reads for catalog, settings, releases, artists, labels, copyright, and takedowns.
- `functions.invoke` paths where backend equivalents exist but are not the production default.

Lower-risk paths:

- Type-only imports and pure utility helpers that can be deleted after the runtime call sites are gone.

## Recommendation

Do not attempt a bulk delete of Supabase imports. Migrate domain-by-domain behind explicit flags, prove parity with contract/integration tests, then remove direct Supabase usage only after the backend path is the default and the rollback plan has been approved.
