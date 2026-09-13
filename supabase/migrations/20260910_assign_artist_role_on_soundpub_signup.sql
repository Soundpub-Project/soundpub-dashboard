SET ROLE supabase_admin;

CREATE OR REPLACE FUNCTION Soundpub.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO Soundpub, public, auth
AS $$
DECLARE
  v_full_name text;
  v_sso_provider text;
  v_source_app text;
  v_soundpub_label_id uuid;
BEGIN
  v_source_app := COALESCE(
    NEW.raw_user_meta_data->>'source_app',
    NEW.raw_user_meta_data->>'app',
    NEW.raw_app_meta_data->>'source_app',
    NEW.raw_app_meta_data->>'app'
  );

  IF v_source_app = 'utero_academy' THEN
    RETURN NEW;
  END IF;

  SELECT p.id
  INTO v_soundpub_label_id
  FROM Soundpub.profiles p
  JOIN Soundpub.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'label'::Soundpub.app_role
    AND lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) IN (
      'soundpub',
      'soundpub music',
      'soundpub music ecosystem'
    )
  ORDER BY CASE lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g'))
    WHEN 'soundpub music' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_soundpub_label_id IS NULL THEN
    RAISE EXCEPTION 'Soundpub MUSIC label profile not found';
  END IF;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_sso_provider := CASE
    WHEN NEW.raw_app_meta_data->>'provider' = 'google' THEN 'google'
    WHEN NEW.raw_user_meta_data->>'iss' LIKE '%keycloak%' THEN 'iccn'
    WHEN NEW.raw_user_meta_data->>'iss' LIKE '%iccn%' THEN 'iccn'
    ELSE NULL
  END;

  INSERT INTO Soundpub.profiles (
    id, email, full_name, parent_label_id, sso_provider, password_set,
    status, artist_profile_completed, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_full_name, v_soundpub_label_id, v_sso_provider,
    CASE WHEN v_sso_provider IS NULL THEN true ELSE false END,
    'active', false, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(Soundpub.profiles.full_name, EXCLUDED.full_name),
    parent_label_id = COALESCE(Soundpub.profiles.parent_label_id, EXCLUDED.parent_label_id),
    sso_provider = COALESCE(Soundpub.profiles.sso_provider, EXCLUDED.sso_provider),
    updated_at = now();

  DELETE FROM Soundpub.user_roles WHERE user_id = NEW.id;
  INSERT INTO Soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'artist'::Soundpub.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION Soundpub.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION Soundpub.handle_new_user() TO supabase_auth_admin, service_role;
GRANT USAGE ON SCHEMA Soundpub TO supabase_auth_admin;

RESET ROLE;
SET ROLE supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_soundpub ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION Soundpub.handle_new_user();

RESET ROLE;

WITH soundpub_label AS (
  SELECT p.id
  FROM Soundpub.profiles p
  JOIN Soundpub.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'label'::Soundpub.app_role
    AND lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) IN (
      'soundpub',
      'soundpub music',
      'soundpub music ecosystem'
    )
  ORDER BY CASE lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g'))
    WHEN 'soundpub music' THEN 1
    ELSE 2
  END
  LIMIT 1
)
INSERT INTO Soundpub.profiles (
  id, email, full_name, parent_label_id, status, password_set,
  artist_profile_completed, created_at, updated_at
)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  sl.id,
  'active',
  true,
  false,
  now(),
  now()
FROM auth.users au
CROSS JOIN soundpub_label sl
LEFT JOIN Soundpub.profiles existing_profile ON existing_profile.id = au.id
WHERE COALESCE(au.raw_user_meta_data->>'source_app', au.raw_user_meta_data->>'app') IS DISTINCT FROM 'utero_academy'
  AND existing_profile.id IS NULL
ON CONFLICT (id) DO UPDATE SET
  parent_label_id = COALESCE(Soundpub.profiles.parent_label_id, EXCLUDED.parent_label_id),
  updated_at = now();

DELETE FROM Soundpub.user_roles ur
USING Soundpub.profiles p
WHERE ur.user_id = p.id
  AND p.parent_label_id = Soundpub.get_soundpub_label_id();

INSERT INTO Soundpub.user_roles (user_id, role)
SELECT p.id, 'artist'::Soundpub.app_role
FROM Soundpub.profiles p
WHERE p.parent_label_id = Soundpub.get_soundpub_label_id()
ON CONFLICT (user_id, role) DO NOTHING;
