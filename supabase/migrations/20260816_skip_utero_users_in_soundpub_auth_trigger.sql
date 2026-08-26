CREATE OR REPLACE FUNCTION Soundpub.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'Soundpub', 'public', 'auth'
AS $function$
DECLARE
  v_full_name TEXT;
  v_sso_provider TEXT;
  v_source_app TEXT;
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
    id,
    email,
    full_name,
    sso_provider,
    password_set,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_sso_provider,
    CASE WHEN v_sso_provider IS NULL THEN true ELSE false END,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(Soundpub.profiles.full_name, EXCLUDED.full_name),
    sso_provider = COALESCE(Soundpub.profiles.sso_provider, EXCLUDED.sso_provider),
    updated_at = NOW();

  INSERT INTO Soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'artist')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;