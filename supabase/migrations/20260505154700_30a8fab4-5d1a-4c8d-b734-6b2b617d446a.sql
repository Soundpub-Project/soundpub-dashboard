
-- Add new columns to artist_profiles
ALTER TABLE public.artist_profiles
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS profile_image_url text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS spotify_artist_id text,
  ADD COLUMN IF NOT EXISTS spotify_artist_url text,
  ADD COLUMN IF NOT EXISTS spotify_data jsonb,
  ADD COLUMN IF NOT EXISTS spotify_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Ensure 1:1 user to artist_profile
CREATE UNIQUE INDEX IF NOT EXISTS artist_profiles_user_id_unique
  ON public.artist_profiles(user_id);

-- Helper: returns artist stage name, fallback to profiles.full_name
CREATE OR REPLACE FUNCTION public.get_user_artist_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT artist_name FROM public.artist_profiles WHERE user_id = _user_id LIMIT 1),
    (SELECT full_name FROM public.profiles WHERE id = _user_id LIMIT 1)
  );
$$;
