-- =============================================
-- Soundpub MANAGED ARTIST SUPPORT FOR LABELS
-- Purpose:
--   - Mark label-created artists as managed-only dummy auth accounts.
--   - Keep existing auth/profile/role FK flow stable.
--   - Prepare whitelabel users to be treated as labels for now.
-- =============================================

ALTER TYPE Soundpub.app_role ADD VALUE IF NOT EXISTS 'copyright';
ALTER TYPE Soundpub.app_role ADD VALUE IF NOT EXISTS 'whitelabel';

BEGIN;

ALTER TABLE Soundpub.profiles
  ADD COLUMN IF NOT EXISTS is_managed_artist boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auth_user_status text NOT NULL DEFAULT 'linked';

ALTER TABLE Soundpub.profiles
  DROP CONSTRAINT IF EXISTS profiles_auth_user_status_check;

ALTER TABLE Soundpub.profiles
  ADD CONSTRAINT profiles_auth_user_status_check
  CHECK (auth_user_status IN ('linked', 'managed_only', 'missing_auth', 'invited'));

CREATE OR REPLACE FUNCTION Soundpub.is_managed_artist_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(_email, '')) LIKE '%@managed.Soundpub.local'
$$;

CREATE OR REPLACE FUNCTION Soundpub.generate_managed_artist_email(_artist_name text DEFAULT 'artist')
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  slug text;
BEGIN
  slug := lower(regexp_replace(coalesce(_artist_name, 'artist'), '[^a-zA-Z0-9]+', '-', 'g'));
  slug := trim(both '-' from slug);
  IF slug IS NULL OR slug = '' THEN
    slug := 'artist';
  END IF;

  RETURN slug || '-' || replace(gen_random_uuid()::text, '-', '') || '@managed.Soundpub.local';
END;
$$;

CREATE OR REPLACE FUNCTION Soundpub.sync_managed_artist_markers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND Soundpub.is_managed_artist_email(NEW.email) THEN
    NEW.is_managed_artist := true;
    NEW.auth_user_status := 'managed_only';
    NEW.password_set := false;
  ELSE
    NEW.is_managed_artist := COALESCE(NEW.is_managed_artist, false);
    NEW.auth_user_status := COALESCE(NULLIF(NEW.auth_user_status, ''), 'linked');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_managed_artist_markers_on_profiles ON Soundpub.profiles;
CREATE TRIGGER sync_managed_artist_markers_on_profiles
BEFORE INSERT OR UPDATE OF email, is_managed_artist, auth_user_status, password_set
ON Soundpub.profiles
FOR EACH ROW EXECUTE FUNCTION Soundpub.sync_managed_artist_markers();

CREATE OR REPLACE FUNCTION Soundpub.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
DECLARE
  provider text;
  managed_artist boolean;
BEGIN
  provider := NEW.raw_app_meta_data ->> 'provider';
  managed_artist := COALESCE((NEW.raw_user_meta_data ->> 'managed_artist')::boolean, false)
    OR Soundpub.is_managed_artist_email(NEW.email);

  INSERT INTO Soundpub.profiles (
    id,
    email,
    full_name,
    status,
    password_set,
    sso_provider,
    artist_profile_completed,
    is_managed_artist,
    auth_user_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    'active',
    CASE WHEN managed_artist THEN false WHEN provider = 'google' THEN false ELSE COALESCE((NEW.raw_user_meta_data ->> 'password_set')::boolean, true) END,
    CASE WHEN provider = 'google' THEN 'google' ELSE NULL END,
    false,
    managed_artist,
    CASE WHEN managed_artist THEN 'managed_only' ELSE 'linked' END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, Soundpub.profiles.full_name),
    password_set = EXCLUDED.password_set,
    is_managed_artist = EXCLUDED.is_managed_artist,
    auth_user_status = EXCLUDED.auth_user_status,
    updated_at = now();

  INSERT INTO Soundpub.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN managed_artist THEN 'artist'::Soundpub.app_role ELSE 'user'::Soundpub.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION Soundpub.handle_new_user();

-- Existing dummy managed accounts are marked managed-only.
UPDATE Soundpub.profiles
SET is_managed_artist = true,
    auth_user_status = 'managed_only',
    password_set = false,
    updated_at = now()
WHERE Soundpub.is_managed_artist_email(email);

-- Existing profiles missing auth users are explicitly marked for audit.
UPDATE Soundpub.profiles p
SET auth_user_status = 'missing_auth',
    updated_at = now()
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p.id)
  AND NOT p.is_managed_artist;

-- Temporary product decision: treat existing whitelabel roles as label roles.
INSERT INTO Soundpub.user_roles (user_id, role, created_at)
SELECT user_id, 'label'::Soundpub.app_role, COALESCE(created_at, now())
FROM Soundpub.user_roles
WHERE role = 'whitelabel'::Soundpub.app_role
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM Soundpub.user_roles
WHERE role = 'whitelabel'::Soundpub.app_role;

COMMIT;

-- Verification
SELECT auth_user_status, is_managed_artist, count(*) AS total
FROM Soundpub.profiles
GROUP BY auth_user_status, is_managed_artist
ORDER BY auth_user_status, is_managed_artist;

SELECT role::text AS role, count(*) AS total
FROM Soundpub.user_roles
GROUP BY role
ORDER BY role::text;

