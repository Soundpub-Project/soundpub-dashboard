# Phase 1E Public Build

## Status

**Public build = FAIL.**

## Local candidate

- `npm run build`: PASS.
- Removed debug pages and migration/schema exports are absent from local `public/` and rebuilt `dist/`.
- Tested privileged secret variable names are absent from local `dist/`.
- `silent-check-sso.html` is still required by `src/lib/keycloak.ts` as the Keycloak silent-check redirect.

## Public production evidence

| Path | Status | Content evidence |
| --- | ---: | --- |
| `/cors-test.html` | 200 | title `CORS Test`, 2,664 bytes |
| `/test-oauth.html` | 200 | title `Test Google OAuth`, 3,453 bytes |
| `/exports/full-schema.sql` | 200 | SQL DDL markers, 76,769 bytes |
| `/silent-check-sso.html` | 200 | retained helper, 1,045 bytes |
| unknown path | 200 | SPA fallback title `Soundpub Dashboard` |

Public schema SHA-256 exactly matches `/usr/share/nginx/html/exports/full-schema.sql` in local `soundpub-dashboard`, identifying that container as a strong active-origin candidate. Public HTML references stale bundle `assets/index-DBB0wF_R.js`; clean local build references `assets/index-B0jqsWXI.js`.

No frontend deployment or cache purge occurred because production sequence remains blocked at credential closure. Authenticated Cloudflare route ownership and rollback are also unavailable.

**Gate: FAIL.**
