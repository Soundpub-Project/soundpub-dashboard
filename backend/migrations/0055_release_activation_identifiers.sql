ALTER TABLE soundpub.releases
  ADD CONSTRAINT releases_upc_format CHECK (upc IS NULL OR upc ~ '^[0-9]{8,14}$');
ALTER TABLE soundpub.tracks
  ADD CONSTRAINT tracks_isrc_format CHECK (isrc IS NULL OR isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$');

CREATE UNIQUE INDEX releases_upc_unique ON soundpub.releases(upc) WHERE upc IS NOT NULL;
CREATE UNIQUE INDEX tracks_isrc_unique ON soundpub.tracks(isrc) WHERE isrc IS NOT NULL;
