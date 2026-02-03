-- =============================================
-- Phase 1: Add artist_user_id columns to tables
-- =============================================

-- 1. Add artist_user_id to releases table
ALTER TABLE public.releases 
ADD COLUMN IF NOT EXISTS artist_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Add artist_user_id to tracks table
ALTER TABLE public.tracks
ADD COLUMN IF NOT EXISTS artist_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Add artist_user_id to royalties table (no FK due to imported data)
ALTER TABLE public.royalties
ADD COLUMN IF NOT EXISTS artist_user_id UUID;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_releases_artist_user_id ON public.releases(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_user_id ON public.tracks(artist_user_id);
CREATE INDEX IF NOT EXISTS idx_royalties_artist_user_id ON public.royalties(artist_user_id);

-- =============================================
-- Phase 2: Helper function for artist ID lookup
-- =============================================

CREATE OR REPLACE FUNCTION public.get_artist_user_id_by_name(_artist_name TEXT, _label_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(p.full_name)) = LOWER(TRIM(_artist_name))
    AND (_label_id IS NULL OR p.parent_label_id = _label_id)
  LIMIT 1
$$;

-- =============================================
-- Phase 3: Migrate existing data
-- =============================================

-- Migrate releases: match artist_name to artist profiles
UPDATE releases r
SET artist_user_id = (
  SELECT p.id 
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(r.artist_name)) = LOWER(TRIM(p.full_name))
    AND (r.label_id = p.parent_label_id OR p.parent_label_id IS NULL)
  LIMIT 1
)
WHERE r.artist_user_id IS NULL;

-- Migrate tracks: match artist_name to artist profiles via release
UPDATE tracks t
SET artist_user_id = (
  SELECT p.id 
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(t.artist_name)) = LOWER(TRIM(p.full_name))
  LIMIT 1
)
WHERE t.artist_user_id IS NULL;

-- Migrate royalties: match artist name to artist profiles
UPDATE royalties r
SET artist_user_id = (
  SELECT p.id 
  FROM profiles p
  JOIN user_roles ur ON p.id = ur.user_id
  WHERE ur.role = 'artist'
    AND LOWER(TRIM(r.artist)) = LOWER(TRIM(p.full_name))
  LIMIT 1
)
WHERE r.artist_user_id IS NULL AND r.artist IS NOT NULL;

-- =============================================
-- Phase 4: Update RLS Policies with Hybrid Matching
-- =============================================

-- Drop existing artist policies
DROP POLICY IF EXISTS "Artists can view their releases" ON public.releases;
DROP POLICY IF EXISTS "Artists can view their tracks" ON public.tracks;
DROP POLICY IF EXISTS "Artists can view their royalties" ON public.royalties;

-- Recreate with hybrid ID + Name fallback

-- Releases: Artists can view their releases (ID-based with name fallback)
CREATE POLICY "Artists can view their releases" ON public.releases
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist'::app_role) AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid()))
    )
  );

-- Tracks: Artists can view their tracks (ID-based with name fallback)
CREATE POLICY "Artists can view their tracks" ON public.tracks
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist'::app_role) AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid()))
      OR artists @> jsonb_build_array(jsonb_build_object('name', get_user_full_name(auth.uid())))
      OR EXISTS (
        SELECT 1 FROM releases 
        WHERE releases.id = tracks.release_id 
        AND (
          releases.artist_user_id = auth.uid()
          OR (releases.artist_user_id IS NULL AND releases.artist_name = get_user_full_name(auth.uid()))
        )
      )
    )
  );

-- Royalties: Artists can view their royalties (ID-based with name fallback)
CREATE POLICY "Artists can view their royalties" ON public.royalties
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist'::app_role) AND (
      artist_user_id = auth.uid()
      OR (artist_user_id IS NULL AND artist = get_user_full_name(auth.uid()))
    )
  );