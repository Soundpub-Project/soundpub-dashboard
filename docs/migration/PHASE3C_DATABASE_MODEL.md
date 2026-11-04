# Phase 3C database contract

Migration: `backend/migrations/0008_release_tracks.sql`. Private `soundpub` schema; backend runtime `soundpub_app`. No Supabase/production access required or performed.

## Legacy sources and columns

Sources: `src/components/releases/ReleaseFormPage.tsx`, `src/integrations/supabase/types.ts`, `supabase/migrations/20260909_add_release_distribution_service.sql`, `supabase/migrations/20260909_add_revision_submitted_release_status.sql`.

`releases`: UUID `id`; ownership UUIDs `label_id` (required), `artist_user_id`, `created_by`; `title`, `artist_name` (required, 200 characters); `release_type` (`single`, `ep`, `album`, `compilation`, default `single`); `genre`, `release_date` (date), `upc` (20 characters), `cover_url`; `status`, `rejection_reason`; `distribution_service` (`standard` default or `custom_label`), `custom_label_name`, `custom_record_name`; nonnegative numeric(20,2) `price_per_track_snapshot`, `total_payment_snapshot`; `archived_at`; `created_at`, `updated_at`; positive integer `version` default 1. Status defaults to `draft`; API must explicitly submit `pending` when requested.

`tracks`: UUID `id`, required `release_id`; nullable `artist_user_id`; required `title`, `artist_name`; nullable JSON arrays `artists`, `contributors`; `composer`, `lyricist`, `genre`, `lyrics`; boolean `explicit_lyrics` default false; `isrc`, finite nonnegative numeric seconds `duration`; `audio_url`, `clip_url`, `video_url`; required positive integer `position`; `created_at`, `updated_at`, positive integer `version` default 1. No independent track status. JSON element validation and URL safety belong to API input validation.

## Ownership and integrity

Release `label_id`, `artist_user_id`, `created_by` are historical ownership snapshots, immutable even for privileged SQL updates through normal triggers. Track `release_id`, `artist_user_id` likewise immutable. IDs and creation timestamps cannot change. All identity references point to `soundpub.profiles` with `ON DELETE RESTRICT`; release references also restrict deletion. Nullable legacy identity references remain nullable; unresolved imports need explicit reconciliation, never guessed identities.

Artist roster transfer does not update releases/tracks and no FK binds historical owners to current `parent_label_id`. Services must lock and verify current roster/role authority on creation, then authorize historical releases from their stored ownership. Current verified management may grant the new Label authority over the Artist catalog after transfer, while stored historical Label/creator attribution remains immutable. The former Label loses authority. Artist display names remain editable metadata, not authorization inputs. Ownership corrections require separately reviewed owner migration, not runtime reassignment.

## Service integration contract: release and track agents

All updates use `WHERE id = $id AND version = $expectedVersion RETURNING *`. Trigger increments version and sets `updated_at`; never assign `version` in INSERT/UPDATE. Zero rows means absent/unauthorized or conflict; determine response without disclosing inaccessible records. DELETE tracks uses version predicate too.

Track insert/update/delete/reorder must lock parent release `FOR UPDATE`, verify expected parent version and editability, then mutate tracks and bump parent with `UPDATE soundpub.releases SET updated_at = now() WHERE id = $id AND version = $expectedVersion RETURNING *` in same transaction. This aggregate rule is a service obligation, not an automatic DB trigger. Lock parent before children in every route. Track version predicates remain required for updates/deletes. Roll back whole transaction on conflict.

`UNIQUE (release_id, position) DEFERRABLE INITIALLY DEFERRED` supports swaps in one transaction, rejects duplicates at commit. Service assigns positions explicitly, returns `ORDER BY position, id`, and normalizes gaps if contiguous UI positions are required. No global UPC/ISRC uniqueness: legacy catalog can reuse identifiers. No minimum track count at DB level: draft creation/import can precede track inserts; submission validation checks complete aggregate.

Runtime SELECT allowed on both tables. INSERT/UPDATE granted only named business columns; ownership only on INSERT, no version/created_at writes. Runtime can DELETE tracks, cannot DELETE releases, change schema, or invoke guard directly. Archive releases instead. Price snapshot updates are available to trusted backend payment logic only; never accept them from frontend payloads. Trigger is SECURITY INVOKER with fixed pg_catalog search path. No browser grants or RLS policies introduced: backend service must enforce actors, consistent with existing private-schema migrations.

## Disposable verification

`backend/test/release-track-db.test.ts` requires `RELEASE_TRACK_DB_TEST_URL` and `RELEASE_TRACK_DB_RUNTIME_URL`; both must target same loopback database named `soundpub_test_release_tracks...`, with no query/fragment. Owner migrates; runtime must log in as `soundpub_app`. Test drops only disposable `soundpub` schema before/after. Provision runtime role separately with LOGIN and no superuser/BYPASSRLS/schema ownership. Run `npx tsx --test test/release-track-db.test.ts` from backend. Missing owner URL explicitly skips; this is not a DB pass.

Existing migrations also require `soundpub_owner` role provisioned before running. Verified 2026-10-28 against temporary local `postgres:16-alpine` container, independent of project/production databases: integration test passed (1/1, no skips); backend `npm run typecheck` passed. Container removed after verification. Coverage includes concurrent same-version writers (exactly one succeeds), deferred reorder, duplicate rejection, immutable historical label after roster transfer, FK restrictions, runtime ownership/version/delete denials, all eight statuses, JSON shape and numeric/order validation, rollback, and migration repeatability.
