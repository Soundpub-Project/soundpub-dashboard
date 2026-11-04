ALTER TABLE soundpub.royalty_import_entries
  ADD COLUMN platform text NOT NULL DEFAULT 'UNKNOWN'
  CHECK (length(btrim(platform)) BETWEEN 1 AND 100);

CREATE INDEX royalty_import_entries_pic_reporting
  ON soundpub.royalty_import_entries(financial_owner_user_id,period,artist_id,release_id,track_id,platform);
