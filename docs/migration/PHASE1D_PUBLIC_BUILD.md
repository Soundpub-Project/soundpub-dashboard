# Phase 1D Public Build

## Status

**PUBLIC BUILD = FAIL.**

## Local candidate

- Debug OAuth/CORS pages and migration/schema exports are absent from `public/` and the rebuilt `dist/`.
- Nginx candidate returns 404 for removed paths while retaining `silent-check-sso.html`.
- ICCN function casing now matches `info-soundpub`.
- PDF generation no longer falls back to visitor localhost; it requires same-origin HTTPS and an authenticated session.
- Whitelabel password request now sends the handler's `password` field.
- Six concatenated declarations in generated Supabase types were repaired.
- `npm run build` passes. Broad pre-existing TypeScript errors remain, so `tsc --noEmit` fails.

## Production evidence

On 2026-10-27, `dashboard.soundpub.xyz` still served `/cors-test.html`, `/test-oauth.html`, `/exports/full-schema.sql`, and `/exports/migration-scripts/.env.example` with actual content. Live HTML referenced a different JS bundle than the clean local build. Frontend origin, deploy owner, rollback, and cache purge control remain unknown. No deployment occurred.
