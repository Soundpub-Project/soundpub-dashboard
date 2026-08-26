-- ARTIST PROFILE RLS FIX FOR LABEL-MANAGED ARTISTS
-- Allows labels/admins to create and update artist_profiles for artists under their label.
-- Run after 29-artist-profile-ui-columns.sql.

ALTER TABLE Soundpub.artist_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Labels can view artist profiles for their artists" ON Soundpub.artist_profiles;
CREATE POLICY "Labels can view artist profiles for their artists"
ON Soundpub.artist_profiles FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR Soundpub.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM Soundpub.profiles p
    WHERE p.id = artist_profiles.user_id
      AND p.parent_label_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Labels can insert artist profiles for their artists" ON Soundpub.artist_profiles;
CREATE POLICY "Labels can insert artist profiles for their artists"
ON Soundpub.artist_profiles FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR Soundpub.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM Soundpub.profiles p
    WHERE p.id = artist_profiles.user_id
      AND p.parent_label_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Labels can update artist profiles for their artists" ON Soundpub.artist_profiles;
CREATE POLICY "Labels can update artist profiles for their artists"
ON Soundpub.artist_profiles FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR Soundpub.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM Soundpub.profiles p
    WHERE p.id = artist_profiles.user_id
      AND p.parent_label_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR Soundpub.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM Soundpub.profiles p
    WHERE p.id = artist_profiles.user_id
      AND p.parent_label_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Labels can delete artist profiles for their artists" ON Soundpub.artist_profiles;
CREATE POLICY "Labels can delete artist profiles for their artists"
ON Soundpub.artist_profiles FOR DELETE
TO authenticated
USING (
  Soundpub.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM Soundpub.profiles p
    WHERE p.id = artist_profiles.user_id
      AND p.parent_label_id = auth.uid()
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON Soundpub.artist_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON Soundpub.artist_profiles TO service_role;

NOTIFY pgrst, 'reload schema';
