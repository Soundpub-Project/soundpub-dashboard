-- Additive, forward-only. Unresolved history stays NULL; no names/email inference.
-- Existing 0023 mapping uses unique artist_user_id. Do not rewrite conflicting history.
CREATE INDEX releases_label_artist_status_created_idx
  ON soundpub.releases(label_id, artist_id, status, created_at DESC, id);

CREATE FUNCTION soundpub.canonical_release_track_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  catalog soundpub.artists%ROWTYPE;
  parent soundpub.releases%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.artist_id IS DISTINCT FROM OLD.artist_id THEN
      RAISE EXCEPTION 'canonical artist identity is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'tracks' THEN
    SELECT * INTO parent FROM soundpub.releases WHERE id=NEW.release_id FOR SHARE;
    IF NOT FOUND OR parent.artist_id IS NULL THEN
      RAISE EXCEPTION 'parent canonical identity unresolved' USING ERRCODE = '23514';
    END IF;
    IF (NEW.artist_id IS NOT NULL AND NEW.artist_id IS DISTINCT FROM parent.artist_id)
      OR (NEW.artist_user_id IS NOT NULL AND NEW.artist_user_id IS DISTINCT FROM parent.artist_user_id) THEN
      RAISE EXCEPTION 'track identity must match release' USING ERRCODE = '23514';
    END IF;
    NEW.artist_id := parent.artist_id;
    NEW.artist_user_id := parent.artist_user_id;
  END IF;
  IF NEW.artist_id IS NULL AND NEW.artist_user_id IS NOT NULL THEN
    SELECT id INTO NEW.artist_id FROM soundpub.artists WHERE artist_user_id=NEW.artist_user_id;
  END IF;
  IF NEW.artist_id IS NULL THEN
    RAISE EXCEPTION 'canonical artist identity required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO catalog FROM soundpub.artists WHERE id=NEW.artist_id FOR SHARE;
  IF NOT FOUND OR NEW.artist_user_id IS DISTINCT FROM catalog.artist_user_id THEN
    RAISE EXCEPTION 'canonical artist user mismatch' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'releases' THEN
    IF catalog.management_mode='LABEL_CUSTOM_MANAGED' THEN
      IF NEW.label_id IS DISTINCT FROM catalog.label_id THEN
        RAISE EXCEPTION 'custom release owner mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.canonical_release_track_guard() FROM PUBLIC, soundpub_app;
-- Alphabetical trigger ordering: canonical identity is set before existing guards.
CREATE TRIGGER releases_canonical_guard BEFORE INSERT OR UPDATE ON soundpub.releases
  FOR EACH ROW EXECUTE FUNCTION soundpub.canonical_release_track_guard();
CREATE TRIGGER tracks_canonical_guard BEFORE INSERT OR UPDATE ON soundpub.tracks
  FOR EACH ROW EXECUTE FUNCTION soundpub.canonical_release_track_guard();
