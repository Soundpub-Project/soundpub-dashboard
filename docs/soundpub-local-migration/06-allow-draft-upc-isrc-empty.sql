-- =============================================
-- SOUNDPUB PATCH: ALLOW DRAFT/PENDING WITHOUT UPC/ISRC
-- Run this before importing draft/pending releases and tracks.
-- =============================================

ALTER TABLE soundpub.releases
  ALTER COLUMN upc DROP NOT NULL;

ALTER TABLE soundpub.tracks
  ALTER COLUMN isrc DROP NOT NULL;

NOTIFY pgrst, 'reload schema';