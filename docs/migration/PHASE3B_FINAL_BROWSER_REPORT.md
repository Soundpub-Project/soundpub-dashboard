# Phase 3B Final Browser Report

Status: PASS for final browser acceptance at mobile, tablet and desktop on real local stack. No API response is mocked.

## Label

- Existing admin Users list and role selector display Label A/B; Label B starts with empty roster and later displays the transferred Artist after browser action.
- Label A and B rosters reflect current membership. SQL checks `soundpub.artists.label_id` and `soundpub.profiles.parent_label_id` after UI transfer, assign and detach; reload confirms persisted state.
- Label-specific 400/401/403/409 mutation denials leave dialog usable and persisted relationship unchanged. Missing Label yields actual 404 on related Artist detail; controlled 500 and aborted roster connection show recoverable errors and no retry loop.
- Existing account selector + own roster + related Artist management name are canonical Label list/detail surface. No dedicated Label metadata editor exists; see `docs/migration/PHASE3B_FINAL_LABEL_UI_SURFACE.md`.

## Artist

Full `/dashboard/artist-profile/:userId` page shows correct account identity, stage name and current management Label. Editing phone/country/city/bio calls backend PATCH, independently matches PostgreSQL and survives page reload. Missing Artist 404, revoked identity 401, controlled backend 500 and aborted network request produce recoverable errors. Direct Artist GET masks unauthorized third-party resources as 404 rather than disclosing existence; 403 detail GET is not applicable to that policy.

## Transport and isolation

Each viewport passes 27 checks without horizontal document overflow. Every observed Artist/Label backend response carries an `x-request-id`; unexpected direct Supabase Artist/Label PostgREST, RPC and Edge Function requests: 0. Deferred unrelated local Supabase requests are aborted by the harness and remain outside this Artist/Label boundary. No production credentials, data import, traffic switch, shared Supabase mutation or SSH.

See `docs/migration/PHASE3B_FINAL_BROWSER_MATRIX.md` and `docs/migration/phase3b-final-browser/results.json` for per-viewport assertions. Independent QA rerun is recorded separately.
