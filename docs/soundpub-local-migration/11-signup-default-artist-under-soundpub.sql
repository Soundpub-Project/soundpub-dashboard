-- =============================================
-- SOUNDPUB SIGNUP DEFAULT ARTIST ROLE PATCH
-- Run this after schema/import when manual signup should create artists under Soundpub.
-- This does not reset data.
-- =============================================

BEGIN;

-- Ensure the role enum supports the roles used by the app/import.
ALTER TYPE soundpub.app_role ADD VALUE IF NOT EXISTS 'copyright';
ALTER TYPE soundpub.app_role ADD VALUE IF NOT EXISTS 'whitelabel';

-- New self-registered users become artists under Soundpub Music Ecosystem.
-- Local mapped ID for original Lovable profile 74c1b87a-2c9b-45c8-a9af-5cdb3d88f419.
CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub, public
AS $$
DECLARE
  soundpub_label_id uuid := '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid;
  provider text;
BEGIN
  provider := NEW.raw_app_meta_data ->> 'provider';

  INSERT INTO soundpub.profiles (
    id,
    email,
    full_name,
    parent_label_id,
    status,
    password_set,
    sso_provider,
    artist_profile_completed
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    soundpub_label_id,
    'active',
    CASE WHEN provider = 'google' THEN false ELSE COALESCE((NEW.raw_user_meta_data ->> 'password_set')::boolean, true) END,
    CASE WHEN provider = 'google' THEN 'google' ELSE NULL END,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, soundpub.profiles.full_name),
    parent_label_id = COALESCE(soundpub.profiles.parent_label_id, EXCLUDED.parent_label_id),
    updated_at = now();

  DELETE FROM soundpub.user_roles WHERE user_id = NEW.id;

  INSERT INTO soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'artist'::soundpub.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION soundpub.handle_new_user();

-- Optional fix for already self-registered users that still have role user and no label.
UPDATE soundpub.profiles p
SET parent_label_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid,
    updated_at = now()
WHERE p.parent_label_id IS NULL
  AND EXISTS (
    SELECT 1 FROM soundpub.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'user'::soundpub.app_role
  );

DELETE FROM soundpub.user_roles ur
WHERE ur.role = 'user'::soundpub.app_role
  AND EXISTS (
    SELECT 1 FROM soundpub.profiles p
    WHERE p.id = ur.user_id
      AND p.parent_label_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid
  );

INSERT INTO soundpub.user_roles (user_id, role)
SELECT p.id, 'artist'::soundpub.app_role
FROM soundpub.profiles p
WHERE p.parent_label_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM soundpub.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'artist'::soundpub.app_role
  );

COMMIT;

-- Verification
SELECT
  p.id,
  p.email,
  p.full_name,
  p.parent_label_id,
  array_agg(ur.role::text ORDER BY ur.role::text) AS roles
FROM soundpub.profiles p
LEFT JOIN soundpub.user_roles ur ON ur.user_id = p.id
WHERE p.parent_label_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid
GROUP BY p.id, p.email, p.full_name, p.parent_label_id
ORDER BY p.created_at DESC
LIMIT 20;
