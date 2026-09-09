-- Labels and whitelabels may only attach releases and tracks to artists registered under their label.
CREATE OR REPLACE FUNCTION Soundpub.enforce_registered_label_release_artist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO Soundpub, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM Soundpub.user_roles
    WHERE user_id = v_user_id AND role IN ('label', 'whitelabel')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.label_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Label may only create releases for its own account';
  END IF;

  IF NEW.artist_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM Soundpub.profiles artist
    JOIN Soundpub.user_roles artist_role
      ON artist_role.user_id = artist.id AND artist_role.role = 'artist'
    WHERE artist.id = NEW.artist_user_id
      AND artist.parent_label_id = v_user_id
      AND COALESCE(lower(artist.status), 'active') NOT IN ('suspended', 'deleted')
  ) THEN
    RAISE EXCEPTION 'Release artist must be an active artist registered under this label';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_registered_label_release_artist ON Soundpub.releases;
CREATE TRIGGER enforce_registered_label_release_artist
BEFORE INSERT OR UPDATE OF label_id, artist_user_id ON Soundpub.releases
FOR EACH ROW EXECUTE FUNCTION Soundpub.enforce_registered_label_release_artist();

CREATE OR REPLACE FUNCTION Soundpub.enforce_registered_label_track_artist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO Soundpub, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM Soundpub.user_roles
    WHERE user_id = v_user_id AND role IN ('label', 'whitelabel')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.artist_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM Soundpub.releases release
    JOIN Soundpub.profiles artist ON artist.id = NEW.artist_user_id
    JOIN Soundpub.user_roles artist_role
      ON artist_role.user_id = artist.id AND artist_role.role = 'artist'
    WHERE release.id = NEW.release_id
      AND release.label_id = v_user_id
      AND artist.parent_label_id = v_user_id
      AND COALESCE(lower(artist.status), 'active') NOT IN ('suspended', 'deleted')
  ) THEN
    RAISE EXCEPTION 'Track artist must be an active artist registered under this label';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_registered_label_track_artist ON Soundpub.tracks;
CREATE TRIGGER enforce_registered_label_track_artist
BEFORE INSERT OR UPDATE OF release_id, artist_user_id ON Soundpub.tracks
FOR EACH ROW EXECUTE FUNCTION Soundpub.enforce_registered_label_track_artist();

NOTIFY pgrst, 'reload schema';
