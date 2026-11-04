-- Snapshot catalog identifiers and label ownership so later catalog changes never
-- rewrite the financial meaning of an accepted royalty row.
ALTER TABLE soundpub.royalty_import_entries
  ADD COLUMN source_isrc text,
  ADD COLUMN source_upc text;

ALTER TABLE soundpub.royalty_import_entries DISABLE TRIGGER royalty_entries_immutable;
UPDATE soundpub.royalty_import_entries entry
SET source_isrc=substring(upper(replace(btrim(track.isrc),'-','')) FROM '^[A-Z0-9]{12}$'),
    source_upc=substring(release.upc FROM '^[0-9]{12,13}$'),
    label_owner_user_id=release.label_id
FROM soundpub.tracks track
JOIN soundpub.releases release ON release.id=track.release_id
WHERE entry.track_id=track.id AND entry.release_id=release.id;
ALTER TABLE soundpub.royalty_import_entries ENABLE TRIGGER royalty_entries_immutable;

ALTER TABLE soundpub.royalty_import_entries
  ADD CONSTRAINT royalty_entry_source_isrc_shape
    CHECK (source_isrc IS NULL OR source_isrc ~ '^[A-Z0-9]{12}$'),
  ADD CONSTRAINT royalty_entry_source_upc_shape
    CHECK (source_upc IS NULL OR source_upc ~ '^[0-9]{12,13}$');
CREATE INDEX royalty_import_entries_source_isrc_history
  ON soundpub.royalty_import_entries(source_isrc,artist_id,label_owner_user_id)
  WHERE source_isrc IS NOT NULL;

CREATE FUNCTION soundpub.royalty_label_owner_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE expected_label uuid;
BEGIN
  SELECT release.label_id INTO expected_label FROM soundpub.releases release
  WHERE release.id=NEW.release_id FOR SHARE;
  IF expected_label IS NULL OR NEW.label_owner_user_id IS DISTINCT FROM expected_label THEN
    RAISE EXCEPTION 'ROYALTY_LABEL_OWNER_MAPPING_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.royalty_label_owner_guard() FROM PUBLIC,soundpub_app;
CREATE TRIGGER royalty_label_owner_guard BEFORE INSERT ON soundpub.royalty_import_entries
  FOR EACH ROW EXECUTE FUNCTION soundpub.royalty_label_owner_guard();
