# Phase 3B Database Model

Migration: `backend/migrations/0007_artists_labels.sql`.

- `backend_users` and verified `user_roles` remain account/status authority.
- `profiles.parent_label_id` is current management relationship; unresolved `parent_label_reference_id` grants no operational permission.
- `artist_profiles.user_id` is unique artist metadata identity and references `profiles` with `ON DELETE RESTRICT`.
- `artists.artist_user_id` is unique UUID roster membership; `label_id` references a label profile. Deferred composite FK requires membership label to equal current parent at commit.
- `artist_deletion_requests` permits one pending request per artist and records review only. Permanent account deletion is not implemented.

Runtime uses private-schema server authorization, not browser RLS/PostgREST. `soundpub_app` receives only required column grants. Artist/label writes use bound SQL, verified principals, current-role locks, and audit rows. Catalog artist ID, artist user ID, and historical source references remain distinct. No Release/Royalty tables or production data were created/imported.
