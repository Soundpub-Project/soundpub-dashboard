-- BACKEND_ONLY_RLS_OPTIONAL: private schema, no browser grants; locked service authority.
CREATE TABLE soundpub.media_objects (
  id uuid PRIMARY KEY,
  provider text NOT NULL DEFAULT 's3-dev' CHECK (provider = 's3-dev'),
  bucket text NOT NULL,
  object_key text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES soundpub.backend_users(id),
  category text NOT NULL CHECK (category IN ('USER_AVATAR','LABEL_LOGO','RELEASE_COVER','TRACK_AUDIO','COPYRIGHT_DOCUMENT','TAKEDOWN_DOCUMENT','OTHER')),
  resource_type text NOT NULL CHECK (resource_type IN ('user','label','release','track')),
  resource_id uuid NOT NULL,
  profile_id uuid REFERENCES soundpub.profiles(id) ON DELETE SET NULL,
  release_id uuid REFERENCES soundpub.releases(id) ON DELETE SET NULL,
  track_id uuid REFERENCES soundpub.tracks(id) ON DELETE SET NULL,
  variant text NOT NULL DEFAULT 'default' CHECK (variant IN ('default','light','dark')),
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility = 'PRIVATE'),
  mime_type text NOT NULL,
  size bigint NOT NULL CHECK (size > 0 AND size <= 524288000),
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','FAILED','REPLACED','DELETED')),
  expires_at timestamptz NOT NULL,
  cleanup_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((resource_type='user' AND category='USER_AVATAR') OR (resource_type='label' AND category='LABEL_LOGO')
    OR (resource_type='release' AND category='RELEASE_COVER') OR (resource_type='track' AND category='TRACK_AUDIO')),
  CHECK ((profile_id IS NULL OR profile_id=resource_id) AND (release_id IS NULL OR release_id=resource_id)
    AND (track_id IS NULL OR track_id=resource_id))
);
CREATE UNIQUE INDEX media_active_binding ON soundpub.media_objects(category,resource_type,resource_id,variant) WHERE status='ACTIVE';
CREATE INDEX media_cleanup ON soundpub.media_objects(status,cleanup_after);
ALTER TABLE soundpub.profiles ADD COLUMN avatar_media_id uuid REFERENCES soundpub.media_objects(id),
  ADD COLUMN logo_media_id uuid REFERENCES soundpub.media_objects(id),
  ADD COLUMN logo_light_media_id uuid REFERENCES soundpub.media_objects(id),
  ADD COLUMN logo_dark_media_id uuid REFERENCES soundpub.media_objects(id);
ALTER TABLE soundpub.releases ADD COLUMN cover_media_id uuid REFERENCES soundpub.media_objects(id);
ALTER TABLE soundpub.tracks ADD COLUMN audio_media_id uuid REFERENCES soundpub.media_objects(id);
GRANT SELECT, INSERT, UPDATE ON soundpub.media_objects TO soundpub_app;
GRANT UPDATE (avatar_media_id,logo_media_id,logo_light_media_id,logo_dark_media_id) ON soundpub.profiles TO soundpub_app;
GRANT UPDATE (cover_media_id) ON soundpub.releases TO soundpub_app;
GRANT UPDATE (audio_media_id) ON soundpub.tracks TO soundpub_app;
REVOKE ALL ON soundpub.media_objects FROM PUBLIC;
