-- =============================================
-- SOUNDPUB PATCH: RELEASE DRAFT/PENDING/PAYMENT/INACTIVE SUPPORT
-- Run after 06-allow-draft-upc-isrc-empty.sql.
-- =============================================

ALTER TABLE soundpub.releases
  ALTER COLUMN upc DROP NOT NULL;

ALTER TABLE soundpub.tracks
  ALTER COLUMN isrc DROP NOT NULL;

ALTER TABLE soundpub.releases DROP CONSTRAINT IF EXISTS releases_status_check;
ALTER TABLE soundpub.releases
  ADD CONSTRAINT releases_status_check
  CHECK (status IN ('pending', 'pending_paid', 'active', 'rejected', 'draft', 'inactive'));

NOTIFY pgrst, 'reload schema';