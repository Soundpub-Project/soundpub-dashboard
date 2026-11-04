# Phase 3B Final Label UI Surface

## Discovery

No dedicated Label list/detail page or route exists in `src/App.tsx`. Existing product surfaces are `/dashboard/users` (admin account list and `ChangeRoleDialog` Label selector) and `/dashboard/my-artists` (the authenticated Label's current roster). `/dashboard/artist-profile/:userId` displays the current management Label using backend `GET /api/v1/labels/:id`. No new Label product route or metadata editor was added.

## Supported entry points and business purpose

- List: admin opens Users, sees Label A/B account rows, opens an Artist row's `Ubah Role` dialog, and sees current Label A/B choices from `listLabels()`. The selection controls real assign/transfer, not an API-only probe.
- Detail: a Label actor opens `/dashboard/my-artists`; `listLabelArtists(profile.id)` reads `GET /api/v1/labels/:id/artists`. Empty and populated rosters are product views of current Label membership. The related Artist detail shows that Label's name from `GET /api/v1/labels/:id`.
- Missing Label detail: removing the synthetic destination's Label role makes `GET /api/v1/labels/:id` return 404 on the related Artist detail; the page shows a recoverable error and does not display stale Label information.

These existing screens together express Label list and detail semantics. The backend has a Label detail endpoint, but no separate Label metadata page or mutation form; asserting such a UI would invent a product feature. Browser actions through existing role and roster controls prove the supported Label changes and persisted membership.

Live entry point: `docs/migration/phase3b-final-browser.ts`. Evidence: `docs/migration/phase3b-final-browser/results.json` and `docs/migration/phase3b-final-browser/browser.log`.
