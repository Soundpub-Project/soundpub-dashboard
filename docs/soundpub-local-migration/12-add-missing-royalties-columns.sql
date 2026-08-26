-- =============================================
-- Soundpub ROYALTIES SCHEMA ALIGNMENT PATCH
-- Add missing columns that exist in CSV but not in schema.
-- =============================================

BEGIN;

-- Add net_revenue column if it doesn't exist
-- This is the key column used by frontend for royalty calculations
ALTER TABLE Soundpub.royalties
ADD COLUMN IF NOT EXISTS net_revenue DECIMAL(18, 2) DEFAULT 0;

-- Add other potentially missing columns from CSV
ALTER TABLE Soundpub.royalties
ADD COLUMN IF NOT EXISTS artist_user_id UUID REFERENCES Soundpub.profiles(id) ON DELETE SET NULL;

ALTER TABLE Soundpub.royalties
ADD COLUMN IF NOT EXISTS label_user_id UUID REFERENCES Soundpub.profiles(id) ON DELETE SET NULL;

-- Create index for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_Soundpub_royalties_net_revenue 
ON Soundpub.royalties(net_revenue);

CREATE INDEX IF NOT EXISTS idx_Soundpub_royalties_artist_user_id 
ON Soundpub.royalties(artist_user_id);

CREATE INDEX IF NOT EXISTS idx_Soundpub_royalties_label_user_id 
ON Soundpub.royalties(label_user_id);

COMMIT;

-- Verification: show royalties table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'Soundpub' AND table_name = 'royalties'
ORDER BY ordinal_position;
