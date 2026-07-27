-- Add 'processing' status and rejection_reason field to releases table
-- This migration adds support for the new workflow:
-- pending_paid -> processing -> active (with UPC/ISRC input)
-- processing -> rejected (with rejection reason)

-- Step 1: Add rejection_reason column
ALTER TABLE soundpub.releases 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Step 2: Update status constraint to include 'processing'
ALTER TABLE soundpub.releases DROP CONSTRAINT IF EXISTS releases_status_check;
ALTER TABLE soundpub.releases ADD CONSTRAINT releases_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'rejected'::text, 'draft'::text, 'inactive'::text, 'pending_paid'::text, 'processing'::text]));

-- Step 3: Add comment for documentation
COMMENT ON COLUMN soundpub.releases.rejection_reason IS 'Reason for rejection when status is rejected';
