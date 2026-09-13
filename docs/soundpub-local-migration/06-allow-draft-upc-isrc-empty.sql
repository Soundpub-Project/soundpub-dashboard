-- =============================================
-- Soundpub PATCH: ALLOW DRAFT/PENDING WITHOUT UPC/ISRC
-- Run this before importing draft/pending releases and tracks.
-- =============================================

ALTER TABLE Soundpub.releases
  ALTER COLUMN upc DROP NOT NULL;

ALTER TABLE Soundpub.tracks
  ALTER COLUMN isrc DROP NOT NULL;

NOTIFY pgrst, 'reload schema';