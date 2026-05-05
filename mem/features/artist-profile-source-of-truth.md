---
name: Artist Profile as Source of Truth
description: artist_profiles table is the canonical source for stage name, photo, Spotify, and identity used in releases
type: feature
---
- `artist_profiles` (1:1 with profiles via unique user_id) is the canonical artist identity used in DSP metadata.
- Required fields for "complete" status: artist_name, artist_type, genre, country. `profiles.artist_profile_completed` is set true only when ALL required fields are present.
- All artists (not only SSO) MUST complete artist profile before creating any release. Releases.tsx blocks via ArtistOnboardingDialog; ArtistReleaseFormDialog blocks if stageName empty.
- Main Artist field in release forms is locked & auto-filled from artist_profiles.artist_name. Featured artists remain free input via ArtistSelector.
- Helper SQL: `get_user_artist_name(uuid)` returns artist_profiles.artist_name with fallback to profiles.full_name.
- Spotify integration: edge function `spotify-fetch-artist` uses Client Credentials OAuth. Result cached in `artist_profiles.spotify_data`. Sync is manual.
- Photo upload: bucket `avatars`, folder `artist-photos/`. URL stored in `artist_profiles.profile_image_url`.
- Roles: artist edits own; label/whitelabel edits artists in their hierarchy; admin full access + can set `verified=true`.