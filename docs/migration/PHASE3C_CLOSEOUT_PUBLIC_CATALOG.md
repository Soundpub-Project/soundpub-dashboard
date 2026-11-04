# Phase 3C closeout public catalog

Date: 2026-10-28. Agent D. Backend contract PASS; frontend/browser acceptance remains separate.

## Required product behavior

Required, not N/A. `src/App.tsx` registers `/catalog` with `LandingPage`; `src/pages/LandingPage.tsx` defines public Release/Track cards and paging. Its backend-mode branch currently returns an empty list. `PHASE3C_FINAL_REPORT.md`, `PHASE3C_EDGE_FUNCTION_REPLACEMENT_MATRIX.md` and `PHASE3C_INDEPENDENT_QA.md` explicitly identify public catalog replacement as blocked. The local legacy `get-catalog-tracks` handler exposes active, unarchived releases with nested tracks, Label display, genre/search and count/paging.

## Backend contract

- Anonymous `GET /api/v1/public/releases` returns `{ success: true, data: Release[], pagination: { total, limit, offset, hasMore } }`.
- Anonymous `GET /api/v1/public/releases/:id` returns a public Release directly; hidden and nonexistent IDs both return the same standard 404 envelope.
- Eligibility is exactly `status = 'active' AND archived_at IS NULL`, enforced in both SQL paths before projection. No request can override status. No separate private/public flag exists in the current backend schema; active and unarchived is the documented legacy publication rule. Any future visibility flag must become an additional eligibility condition.
- Optional `limit` defaults to 12, range 1–100; `offset` defaults to 0, range 0–999999. Optional literal case-insensitive `search` matches title/artist; exact `genre` matches genre. Filter strings are at most 200 characters. Unknown query fields and malformed UUIDs return 400.
- List order is release date descending, null dates last, then ID. Nested tracks use position then ID. Count and page share one SQL statement/snapshot, including empty pages beyond the end.
- Routes retain shared IP rate limiting, error envelopes and explicit anonymous OpenAPI operations. Existing authenticated Release/Track routes are untouched.

## Allowlist and media boundary

Release fields: `id`, `title`, `artist_name`, `genre`, `release_type`, `release_date`, `upc`, `cover_url`, `label`, `tracks`. Label contains only `full_name`.

Track fields: `id`, `title`, `artist_name`, `isrc`, `genre`, `duration`, `explicit_lyrics`, `audio_url`, `clip_url`.

Both SQL projections and strict output schemas enforce this allowlist. Ownership IDs, profile IDs, emails, creator IDs, payment/pricing data, rejection reasons, custom distribution internals, lyrics, contributors, audit/version/timestamps and provider secrets are excluded.

`cover_url`, `audio_url` and `clip_url` are always null: current persisted URLs have no verified public asset classification. No URL is signed or copied from private metadata. Public asset validation/playback belongs to PHASE3D_STORAGE. This is metadata catalog support, not full media parity.

## Changed files / integration handoff

- `backend/src/public-catalog/index.ts`: dedicated read service and schemas.
- `backend/src/api/public-catalog.ts`: list/detail routes and OpenAPI.
- `backend/src/api/types.ts`: optional public catalog dependency.
- `backend/src/api/index.ts`: route registration only.
- `backend/src/main.ts`: runtime service injection only.
- `backend/test/public-catalog.test.ts`: isolated restricted-login PostgreSQL HTTP acceptance.
- This report.

No aggregate/submission service, repository, migration or test edited. The three shared bootstrap files contain additive integration lines only. Frontend agent must replace the empty backend branch with the anonymous API list call, pass search/genre/paging, and handle errors without Supabase fallback. Browser agent must verify list/detail, hidden drafts/private states and visible active records across viewports. No frontend/browser PASS claimed here.

## Validation

From `backend`: `npx tsx --test test/public-catalog.test.ts` passed: 1 test, 0 failures, 0 skips. Uses self-provisioned loopback PostgreSQL 17, synthetic fixtures, migrations and `soundpub_app` runtime login; container removed afterward. Covers every nonpublic status, active archived hiding, nonexistent masking, nested field allowlists, private media suppression, anonymous access, SQL injection-shaped literal search, filters, bounded input, empty offset count and OpenAPI.

`npm run typecheck` passed. No production data imported, production credentials used, production traffic switched, shared Supabase accessed or mutated. No SSH, provider calls or deployment performed.
