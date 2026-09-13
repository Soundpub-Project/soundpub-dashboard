-- =============================================
-- Soundpub PATCH: ALIGN EXISTING SCHEMA TO CSV EXPORT
-- Run this if schema Soundpub already exists and import shows missing columns.
-- =============================================

ALTER TABLE Soundpub.profiles
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_url_light TEXT,
  ADD COLUMN IF NOT EXISTS logo_url_dark TEXT,
  ADD COLUMN IF NOT EXISTS label_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS artist_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_set BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_upgraded_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS composer_code TEXT;

ALTER TABLE Soundpub.releases
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS artist_user_id UUID REFERENCES Soundpub.profiles(id);

ALTER TABLE Soundpub.tracks
  ADD COLUMN IF NOT EXISTS artists JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS explicit_lyrics BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS contributors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS clip_url TEXT,
  ADD COLUMN IF NOT EXISTS duration INTEGER,
  ADD COLUMN IF NOT EXISTS artist_user_id UUID REFERENCES Soundpub.profiles(id);

ALTER TABLE Soundpub.royalty_uploads DROP CONSTRAINT IF EXISTS royalty_uploads_status_check;
ALTER TABLE Soundpub.royalty_uploads
  ADD CONSTRAINT royalty_uploads_status_check
  CHECK (status IN ('pending', 'processing', 'success', 'partial', 'failed'));

GRANT USAGE ON SCHEMA Soundpub TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA Soundpub TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA Soundpub TO postgres, service_role;

NOTIFY pgrst, 'reload schema';