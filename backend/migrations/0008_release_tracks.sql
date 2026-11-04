-- Private backend schema: actor authorization belongs to transaction-locked services.
CREATE TABLE soundpub.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  artist_user_id uuid REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  artist_name text NOT NULL CHECK (length(btrim(artist_name)) BETWEEN 1 AND 200),
  release_type text NOT NULL DEFAULT 'single' CHECK (release_type IN ('single', 'ep', 'album', 'compilation')),
  genre text CHECK (length(genre) <= 200),
  release_date date,
  upc text CHECK (length(upc) <= 20),
  cover_url text CHECK (length(cover_url) <= 2048),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft', 'pending', 'pending_paid', 'processing', 'active', 'rejected', 'revision_submitted', 'inactive')),
  rejection_reason text CHECK (length(rejection_reason) <= 10000),
  distribution_service text NOT NULL DEFAULT 'standard' CHECK (distribution_service IN ('standard', 'custom_label')),
  custom_label_name text CHECK (length(custom_label_name) <= 200),
  custom_record_name text CHECK (length(custom_record_name) <= 200),
  price_per_track_snapshot numeric(20,2) CHECK (price_per_track_snapshot >= 0),
  total_payment_snapshot numeric(20,2) CHECK (total_payment_snapshot >= 0),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (distribution_service <> 'custom_label' OR coalesce(length(btrim(custom_label_name)), 0) > 0)
);
CREATE INDEX releases_label_created_idx ON soundpub.releases(label_id, created_at DESC, id);
CREATE INDEX releases_artist_created_idx ON soundpub.releases(artist_user_id, created_at DESC, id);
CREATE INDEX releases_creator_idx ON soundpub.releases(created_by);
CREATE INDEX releases_status_created_idx ON soundpub.releases(status, created_at DESC, id);

CREATE TABLE soundpub.tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES soundpub.releases(id) ON DELETE RESTRICT,
  artist_user_id uuid REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  artist_name text NOT NULL CHECK (length(btrim(artist_name)) BETWEEN 1 AND 200),
  artists jsonb CHECK (jsonb_typeof(artists) = 'array'),
  contributors jsonb CHECK (jsonb_typeof(contributors) = 'array'),
  composer text CHECK (length(composer) <= 2000),
  lyricist text CHECK (length(lyricist) <= 2000),
  genre text CHECK (length(genre) <= 200),
  lyrics text CHECK (length(lyrics) <= 100000),
  explicit_lyrics boolean NOT NULL DEFAULT false,
  isrc text CHECK (length(isrc) <= 20),
  duration numeric CHECK (duration >= 0 AND duration < 'Infinity'::numeric),
  audio_url text CHECK (length(audio_url) <= 2048),
  clip_url text CHECK (length(clip_url) <= 2048),
  video_url text CHECK (length(video_url) <= 2048),
  position integer NOT NULL CHECK (position > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracks_release_position_key UNIQUE (release_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX tracks_artist_idx ON soundpub.tracks(artist_user_id);

CREATE FUNCTION soundpub.release_track_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
  ELSE
    IF TG_TABLE_NAME = 'releases' THEN
      IF ROW(NEW.id, NEW.label_id, NEW.artist_user_id, NEW.created_by, NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id, OLD.label_id, OLD.artist_user_id, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION 'release historical ownership is immutable' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF ROW(NEW.id, NEW.release_id, NEW.artist_user_id, NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id, OLD.release_id, OLD.artist_user_id, OLD.created_at) THEN
        RAISE EXCEPTION 'track historical ownership is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION soundpub.release_track_guard() FROM PUBLIC, soundpub_app;
CREATE TRIGGER releases_guard BEFORE INSERT OR UPDATE ON soundpub.releases
  FOR EACH ROW EXECUTE FUNCTION soundpub.release_track_guard();
CREATE TRIGGER tracks_guard BEFORE INSERT OR UPDATE ON soundpub.tracks
  FOR EACH ROW EXECUTE FUNCTION soundpub.release_track_guard();

REVOKE ALL ON soundpub.releases, soundpub.tracks FROM PUBLIC, soundpub_app;
GRANT SELECT ON soundpub.releases, soundpub.tracks TO soundpub_app;
GRANT INSERT (id, label_id, artist_user_id, created_by, title, artist_name, release_type, genre,
  release_date, upc, cover_url, status, distribution_service, custom_label_name, custom_record_name)
  ON soundpub.releases TO soundpub_app;
GRANT UPDATE (title, artist_name, release_type, genre, release_date, upc, cover_url, status,
  rejection_reason, distribution_service, custom_label_name, custom_record_name,
  price_per_track_snapshot, total_payment_snapshot, archived_at, updated_at)
  ON soundpub.releases TO soundpub_app;
GRANT INSERT (id, release_id, artist_user_id, title, artist_name, artists, contributors, composer,
  lyricist, genre, lyrics, explicit_lyrics, isrc, duration, audio_url, clip_url, video_url, position)
  ON soundpub.tracks TO soundpub_app;
GRANT UPDATE (title, artist_name, artists, contributors, composer, lyricist, genre, lyrics,
  explicit_lyrics, isrc, duration, audio_url, clip_url, video_url, position, updated_at)
  ON soundpub.tracks TO soundpub_app;
GRANT DELETE ON soundpub.tracks TO soundpub_app;
