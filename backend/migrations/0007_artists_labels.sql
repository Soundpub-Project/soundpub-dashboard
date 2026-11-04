ALTER TABLE soundpub.profiles
  ADD CONSTRAINT profiles_id_parent_label_key UNIQUE (id, parent_label_id);

CREATE TABLE soundpub.artist_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  artist_name text NOT NULL CHECK (length(btrim(artist_name)) BETWEEN 1 AND 200),
  artist_type text NOT NULL DEFAULT 'solo' CHECK (length(btrim(artist_type)) BETWEEN 1 AND 100),
  bio text CHECK (length(bio) <= 10000),
  genre text CHECK (length(genre) <= 100),
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(social_links) = 'object'),
  profile_image_url text CHECK (length(profile_image_url) <= 2048),
  legal_name text CHECK (length(legal_name) <= 200),
  country text CHECK (length(country) <= 100),
  city text CHECK (length(city) <= 100),
  language text CHECK (length(language) <= 100),
  gender text CHECK (length(gender) <= 100),
  date_of_birth date,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verified = (verified_at IS NOT NULL))
);

CREATE TABLE soundpub.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  artist_user_id uuid NOT NULL UNIQUE REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  verified_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (artist_user_id <> label_id),
  CONSTRAINT artists_current_parent_fkey
    FOREIGN KEY (artist_user_id, label_id)
    REFERENCES soundpub.profiles(id, parent_label_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX artists_label_id_id_idx ON soundpub.artists(label_id, id);

CREATE TABLE soundpub.artist_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  label_id uuid NOT NULL REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (artist_id <> label_id)
);
CREATE UNIQUE INDEX artist_deletion_requests_pending_artist_idx
  ON soundpub.artist_deletion_requests(artist_id) WHERE status = 'pending';
CREATE INDEX artist_deletion_requests_label_id_id_idx
  ON soundpub.artist_deletion_requests(label_id, id);

GRANT INSERT (id, status) ON soundpub.backend_users TO soundpub_app;
GRANT INSERT (id, full_name, phone, address, parent_label_id) ON soundpub.profiles TO soundpub_app;
GRANT UPDATE (full_name, phone, address, parent_label_id, artist_profile_completed, updated_at)
  ON soundpub.profiles TO soundpub_app;

GRANT SELECT ON soundpub.artist_profiles TO soundpub_app;
GRANT INSERT (user_id, artist_name) ON soundpub.artist_profiles TO soundpub_app;
GRANT UPDATE (artist_name, artist_type, bio, genre, social_links, profile_image_url, legal_name,
  country, city, language, gender, date_of_birth, updated_at) ON soundpub.artist_profiles TO soundpub_app;

GRANT SELECT, DELETE ON soundpub.artists TO soundpub_app;
GRANT INSERT (label_id, artist_user_id, name, verified_at) ON soundpub.artists TO soundpub_app;
GRANT UPDATE (label_id, name, updated_at) ON soundpub.artists TO soundpub_app;

GRANT SELECT ON soundpub.artist_deletion_requests TO soundpub_app;
GRANT INSERT (artist_id, label_id, reason) ON soundpub.artist_deletion_requests TO soundpub_app;
GRANT UPDATE (status, updated_at) ON soundpub.artist_deletion_requests TO soundpub_app;