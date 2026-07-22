-- =============================================
-- SOUNDPUB FIX AUTH SIGNUP TRIGGER FK-SAFE
-- Run this before pnpm import:csv if Auth Admin createUser returns:
--   insert or update on table "profiles" violates foreign key constraint
--   "profiles_parent_label_id_fkey"
-- This does not reset or delete data.
-- =============================================

BEGIN;

ALTER TYPE soundpub.app_role ADD VALUE IF NOT EXISTS 'copyright';
ALTER TYPE soundpub.app_role ADD VALUE IF NOT EXISTS 'whitelabel';

CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = soundpub, public
AS $$
DECLARE
  soundpub_label_id uuid := '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid;
  resolved_parent_label_id uuid;
  provider text;
BEGIN
  provider := NEW.raw_app_meta_data ->> 'provider';

  SELECT p.id INTO resolved_parent_label_id
  FROM soundpub.profiles p
  WHERE p.id = soundpub_label_id;

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
    resolved_parent_label_id,
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

COMMIT;

-- Verification
SELECT
  proname,
  prosecdef AS security_definer
FROM pg_proc
WHERE pronamespace = 'soundpub'::regnamespace
  AND proname = 'handle_new_user';
