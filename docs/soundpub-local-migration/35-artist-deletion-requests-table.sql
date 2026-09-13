-- 35-artist-deletion-requests-table.sql
-- Purpose:
--   Create Soundpub.artist_deletion_requests and related RLS/grants used by /dashboard/users.
--   Run this when Users page shows: Could not find table Soundpub.artist_deletion_requests.

BEGIN;
CREATE TABLE IF NOT EXISTS Soundpub.artist_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES Soundpub.profiles(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES Soundpub.profiles(id) ON DELETE CASCADE,
    reason TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies for deletion requests
ALTER TABLE Soundpub.artist_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Label can view their own requests" ON Soundpub.artist_deletion_requests;
CREATE POLICY "Label can view their own requests" 
    ON Soundpub.artist_deletion_requests FOR SELECT 
    USING (label_id = auth.uid());

DROP POLICY IF EXISTS "Label can insert their own requests" ON Soundpub.artist_deletion_requests;
CREATE POLICY "Label can insert their own requests" 
    ON Soundpub.artist_deletion_requests FOR INSERT 
    WITH CHECK (label_id = auth.uid());

DROP POLICY IF EXISTS "Admin can view all requests" ON Soundpub.artist_deletion_requests;
CREATE POLICY "Admin can view all requests" 
    ON Soundpub.artist_deletion_requests FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM Soundpub.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'superadmin')
        )
    );

DROP POLICY IF EXISTS "Admin can update requests" ON Soundpub.artist_deletion_requests;
CREATE POLICY "Admin can update requests" 
    ON Soundpub.artist_deletion_requests FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM Soundpub.user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role IN ('admin', 'superadmin')
        )
    );

-- Add missing columns to Soundpub.artist_profiles schema cache
ALTER TABLE Soundpub.artist_profiles
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

-- Ensure 1:1 user to artist_profile on Soundpub
CREATE UNIQUE INDEX IF NOT EXISTS artist_profiles_user_id_unique ON Soundpub.artist_profiles(user_id);

-- Additional RLS Policies for Profiles and Artist Profiles to allow Labels to manage their artists

DROP POLICY IF EXISTS "Labels can update their artists" ON Soundpub.profiles;
CREATE POLICY "Labels can update their artists"
    ON Soundpub.profiles FOR UPDATE
    TO authenticated
    USING (parent_label_id = auth.uid());

DROP POLICY IF EXISTS "Labels can view artist profiles for their artists" ON Soundpub.artist_profiles;
CREATE POLICY "Labels can view artist profiles for their artists"
    ON Soundpub.artist_profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = (SELECT parent_label_id FROM Soundpub.profiles WHERE id = user_id));

DROP POLICY IF EXISTS "Labels can insert artist profiles for their artists" ON Soundpub.artist_profiles;
CREATE POLICY "Labels can insert artist profiles for their artists"
    ON Soundpub.artist_profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = (SELECT parent_label_id FROM Soundpub.profiles WHERE id = user_id));

DROP POLICY IF EXISTS "Labels can update artist profiles for their artists" ON Soundpub.artist_profiles;
CREATE POLICY "Labels can update artist profiles for their artists"
    ON Soundpub.artist_profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = (SELECT parent_label_id FROM Soundpub.profiles WHERE id = user_id));

DROP POLICY IF EXISTS "Labels can delete artist profiles for their artists" ON Soundpub.artist_profiles;
CREATE POLICY "Labels can delete artist profiles for their artists"
    ON Soundpub.artist_profiles FOR DELETE
    TO authenticated
    USING (auth.uid() = (SELECT parent_label_id FROM Soundpub.profiles WHERE id = user_id));

-- Explicit grants for PostgREST authenticated role.
GRANT SELECT, INSERT, UPDATE ON Soundpub.artist_deletion_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON Soundpub.artist_profiles TO authenticated;
GRANT SELECT, UPDATE ON Soundpub.profiles TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
