# Phase 1C Public Build Deployment

Observed 2026-10-27 (Asia/Bangkok). **PUBLIC BUILD HYGIENE = FAIL. Production frontend deployment = NOT PERFORMED.** Phase 2 remains blocked.

## Public hostname verification

The dashboard is served at `https://dashboard.soundpub.xyz/` (HTTP 200, title `Soundpub Dashboard`), not `https://carubra.com/` (an unrelated CARUBRA AI landing page). The former returns real contents, not the SPA fallback, for these previously exposed paths:

| Public path | Result on dashboard hostname | Evidence |
| --- | --- | --- |
| `/cors-test.html` | HTTP 200 | HTML title `CORS Test`, 3,031 response bytes |
| `/test-oauth.html` | HTTP 200 | HTML title `Test Google OAuth`, 3,820 response bytes |
| `/exports/full-schema.sql` | HTTP 200 | SQL content, 76,769 response bytes |
| `/silent-check-sso.html` | HTTP 200 | Required Keycloak silent-check page; retain |

Responses include Cloudflare edge headers and `Last-Modified: Fri, 23 Oct 2026 11:26:36 GMT`. HTTP 200 for nonexistent paths on `carubra.com` is its unrelated SPA fallback, not proof of Soundpub asset exposure. No sensitive body or configured secret was copied into this report.

## Local candidate

Phase 1B already removed the debug pages and moved legacy exports out of `public/`; its clean local build contained neither. `nginx.conf` now explicitly returns 404 for `/exports/`, `/cors-test.html` and `/test-oauth.html`, avoiding SPA fallback masquerading as removal. `silent-check-sso.html` remains served. This is local candidate code, **not** a production security fix until deployed and independently tested.

## Ownership and release block

Public DNS resolves to Cloudflare; its upstream/frontend deployment origin, release process, current image/revision, Cloudflare routing, cache purge requirements and tested rollback are not established. The repository Compose file defines `soundpub-dashboard` on port 8181, but the inspected Supabase host `maskhar@20.20.20.3` has no such container or listener. SSH to the repository SSH-configured `soundpub-project` host (`20.20.20.25`) timed out. These observations do **not** authorize deploying to either server. Current worktree contains existing uncommitted Phase 1B changes; do not blindly build/release from an unidentified tree.

Required next checkpoint: establish Cloudflare origin and authorized frontend deploy owner; capture before-image, source/build digest and rollback; build clean candidate with approved public-only configuration; deploy through known pipeline; then verify the public dashboard hostname returns 404 for removed paths, required SSO still works, sensitive configured values do not appear in served bundles, and independent QA repeats checks. No production frontend change was made in Phase 1C.
