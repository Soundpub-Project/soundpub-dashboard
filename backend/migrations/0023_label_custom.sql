-- Wave 1: private backend schema; authorization remains in backend services.
ALTER TABLE soundpub.roles DROP CONSTRAINT roles_name_check;
ALTER TABLE soundpub.roles ADD CONSTRAINT roles_name_check
  CHECK (name IN ('superadmin', 'admin', 'label', 'label_custom', 'copyright', 'whitelabel', 'artist', 'user'));
INSERT INTO soundpub.roles(name) VALUES ('label_custom');

CREATE TABLE soundpub.label_custom_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES soundpub.profiles(id) ON DELETE RESTRICT,
  unit_code text NOT NULL UNIQUE CHECK (length(btrim(unit_code)) BETWEEN 1 AND 100),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT label_custom_units_backend_owner_fkey
    FOREIGN KEY (owner_user_id) REFERENCES soundpub.backend_users(id) ON DELETE RESTRICT,
  CONSTRAINT label_custom_units_id_owner_key UNIQUE (id, owner_user_id)
);

ALTER TABLE soundpub.artists
  ALTER COLUMN artist_user_id DROP NOT NULL,
  ADD COLUMN label_custom_unit_id uuid REFERENCES soundpub.label_custom_units(id) ON DELETE RESTRICT,
  ADD COLUMN management_mode text NOT NULL DEFAULT 'LOGIN_ACCOUNT',
  ADD COLUMN contact_email text CHECK (
    contact_email IS NULL OR (length(btrim(contact_email)) BETWEEN 3 AND 320 AND position('@' in contact_email) > 1)
  ),
  ADD COLUMN contact_phone text CHECK (
    contact_phone IS NULL OR length(btrim(contact_phone)) BETWEEN 1 AND 50
  ),
  ADD CONSTRAINT artists_management_identity_check CHECK (
    (management_mode = 'LOGIN_ACCOUNT' AND artist_user_id IS NOT NULL AND label_custom_unit_id IS NULL)
    OR
    (management_mode = 'LABEL_CUSTOM_MANAGED' AND artist_user_id IS NULL AND label_custom_unit_id IS NOT NULL
      AND contact_email IS NOT NULL AND contact_phone IS NOT NULL)
  ),
  ADD CONSTRAINT artists_unit_owner_fkey
    FOREIGN KEY (label_custom_unit_id, label_id)
    REFERENCES soundpub.label_custom_units(id, owner_user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT artists_id_user_key UNIQUE (id, artist_user_id),
  ADD CONSTRAINT artists_id_management_mode_key UNIQUE (id, management_mode);

CREATE INDEX artists_label_custom_unit_id_id_idx ON soundpub.artists(label_custom_unit_id, id);

-- Existing standalone login profiles may have no roster row. Never invent an
-- artist or infer identity from names, email addresses, or current label alone.
ALTER TABLE soundpub.artist_profiles
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN artist_id uuid UNIQUE REFERENCES soundpub.artists(id) ON DELETE RESTRICT,
  ADD COLUMN management_mode text GENERATED ALWAYS AS (
    CASE WHEN user_id IS NULL THEN 'LABEL_CUSTOM_MANAGED' ELSE 'LOGIN_ACCOUNT' END
  ) STORED;

UPDATE soundpub.artist_profiles AS ap
SET artist_id = a.id
FROM soundpub.artists AS a
WHERE ap.user_id = a.artist_user_id AND ap.artist_id IS NULL;

-- Both FKs are necessary: the user FK alone skips NULL custom identities;
-- the derived mode FK rejects a NULL-user profile linked to a login artist.
ALTER TABLE soundpub.artist_profiles
  ADD CONSTRAINT artist_profiles_identity_check CHECK (user_id IS NOT NULL OR artist_id IS NOT NULL),
  ADD CONSTRAINT artist_profiles_artist_user_fkey
    FOREIGN KEY (artist_id, user_id) REFERENCES soundpub.artists(id, artist_user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT artist_profiles_artist_mode_fkey
    FOREIGN KEY (artist_id, management_mode) REFERENCES soundpub.artists(id, management_mode) ON DELETE RESTRICT;

ALTER TABLE soundpub.releases
  ADD COLUMN artist_id uuid REFERENCES soundpub.artists(id) ON DELETE RESTRICT;
ALTER TABLE soundpub.tracks
  ADD COLUMN artist_id uuid REFERENCES soundpub.artists(id) ON DELETE RESTRICT;

-- DDL locks last until the migration runner's transaction ends. Suspend only
-- these metadata guards during backfill to preserve version and updated_at.
ALTER TABLE soundpub.releases DISABLE TRIGGER releases_guard;
UPDATE soundpub.releases AS r
SET artist_id = a.id
FROM soundpub.artists AS a
WHERE r.artist_user_id = a.artist_user_id AND r.artist_id IS NULL;
ALTER TABLE soundpub.releases ENABLE TRIGGER releases_guard;

ALTER TABLE soundpub.tracks DISABLE TRIGGER tracks_guard;
UPDATE soundpub.tracks AS t
SET artist_id = a.id
FROM soundpub.artists AS a
WHERE t.artist_user_id = a.artist_user_id AND t.artist_id IS NULL;
ALTER TABLE soundpub.tracks ENABLE TRIGGER tracks_guard;

CREATE INDEX releases_artist_id_created_idx ON soundpub.releases(artist_id, created_at DESC, id);
CREATE INDEX tracks_artist_id_idx ON soundpub.tracks(artist_id);

REVOKE ALL ON soundpub.label_custom_units FROM PUBLIC, soundpub_app;
GRANT SELECT ON soundpub.label_custom_units TO soundpub_app;
GRANT INSERT (id, owner_user_id, unit_code, name, status) ON soundpub.label_custom_units TO soundpub_app;
GRANT UPDATE (name, status, updated_at) ON soundpub.label_custom_units TO soundpub_app;
GRANT INSERT (id, label_id, name, verified_at, label_custom_unit_id, management_mode, contact_email, contact_phone)
  ON soundpub.artists TO soundpub_app;
GRANT UPDATE (name, contact_email, contact_phone, verified_at, updated_at) ON soundpub.artists TO soundpub_app;
GRANT INSERT (artist_id, user_id, artist_name) ON soundpub.artist_profiles TO soundpub_app;
GRANT UPDATE (artist_name, updated_at) ON soundpub.artist_profiles TO soundpub_app;
-- Historical catalog identity is insert-only for runtime, like artist_user_id.
GRANT INSERT (artist_id) ON soundpub.releases, soundpub.tracks TO soundpub_app;
