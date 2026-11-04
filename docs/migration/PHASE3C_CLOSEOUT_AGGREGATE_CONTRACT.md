# Release aggregate contract

`POST /api/v1/releases/aggregate` accepts existing Release create fields plus required `tracks[]`.
Existing `POST /api/v1/releases` remains unchanged.

`PATCH /api/v1/releases/:id/aggregate` accepts required `version`, required `tracks[]`, and optional
Release metadata: title, artist_name, release_type, genre, release_date, cover_url, upc.
UPC edits require admin authority. Status and historical ownership cannot be changed here.

Both return HTTP 200 with `{ release: ReleaseDto, tracks: TrackDto[] }`.

Tracks require title and artist_name; optional fields are genre, composer, lyricist, lyrics, isrc,
duration, explicit_lyrics. Existing tracks require both id and version; new tracks omit both.
Each array is bounded to 10,000 tracks. Zero tracks is valid for a draft save; this operation
does not establish submission readiness. Array order defines contiguous one-based positions.
Omitted existing tracks are removed. Browser-supplied positions, ownership, and diff actions are rejected.
Unspecified optional track metadata is preserved on existing tracks.

Create validates and locks current actor/Artist authority, derives historical Label attribution,
then inserts Release, initial Tracks, and aggregate audit in one transaction.
Edit reloads current locked authority, locks Release, checks expected aggregate version, and reads
stored Tracks before classifying CREATE/UPDATE/REMOVE/UNCHANGED. Only unarchived draft, pending,
and rejected Releases can be edited. Track versions are checked before mutations. Unchanged Tracks
retain their versions; changed existing Tracks increment once. Every accepted aggregate edit,
including a no-op, increments Release version exactly once.

Stale Release or Track versions, duplicate existing IDs, foreign/unknown Track IDs, blocked states,
and referenced Track removal return 409 CONFLICT. Invalid bodies return 400; inaccessible resources
use existing 404 masking; revoked actor access uses existing 403 rules. Validation, Track SQL,
audit, or commit failure rolls back Release and every Track change. Concurrent aggregate and
standalone Track writes share the parent Release lock/version discipline.

Synthetic checks: `cd backend` then `npx tsx --test test/release-aggregate.test.ts`.
The test provisions disposable loopback PostgreSQL with restricted runtime role, then removes it.
No SSH, Supabase, production data, or external providers are used.
