-- ARTIST PROFILE UI COLUMNS
-- Fixes PostgREST schema cache error: profile_image_url column missing.
-- Run this once after managed artist/profile migration.

ALTER TABLE Soundpub.artist_profiles
  ADD COLUMN IF NOT EXISTS profile_image_url text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS genre text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS spotify_artist_id text,
  ADD COLUMN IF NOT EXISTS spotify_artist_url text,
  ADD COLUMN IF NOT EXISTS spotify_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS spotify_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON Soundpub.artist_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON Soundpub.artist_profiles TO service_role;

NOTIFY pgrst, 'reload schema';
