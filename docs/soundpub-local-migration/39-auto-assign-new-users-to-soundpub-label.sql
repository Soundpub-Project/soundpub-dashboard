-- =============================================
-- GRANT PERMISSIONS & AUTO-ASSIGN: New Users to Soundpub Label
-- Run this as superuser (postgres) to grant permissions first
-- =============================================

-- Step 1: Grant necessary permissions
GRANT USAGE ON SCHEMA soundpub TO postgres, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA soundpub TO postgres, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA soundpub TO postgres, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA soundpub TO postgres, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT ALL ON TABLES TO postgres, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT ALL ON SEQUENCES TO postgres, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA soundpub GRANT ALL ON FUNCTIONS TO postgres, authenticated, service_role;

-- Step 2: Create trigger functions
BEGIN;

CREATE OR REPLACE FUNCTION soundpub.auto_assign_new_user_to_soundpub_label()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = soundpub, public
AS $$
DECLARE
  soundpub_label_id uuid := '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_label_id IS NULL THEN
    NEW.parent_label_id := soundpub_label_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION soundpub.auto_assign_artist_role()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = soundpub, public
AS $$
DECLARE
  soundpub_label_id uuid := '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid;
BEGIN
  IF NEW.parent_label_id = soundpub_label_id THEN
    INSERT INTO soundpub.user_roles (user_id, role)
    VALUES (NEW.id, 'artist'::soundpub.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_assign_soundpub_label ON soundpub.profiles;
DROP TRIGGER IF EXISTS trigger_auto_assign_artist_role ON soundpub.profiles;

CREATE TRIGGER trigger_auto_assign_soundpub_label
  BEFORE INSERT ON soundpub.profiles
  FOR EACH ROW
  EXECUTE FUNCTION soundpub.auto_assign_new_user_to_soundpub_label();

CREATE TRIGGER trigger_auto_assign_artist_role
  AFTER INSERT ON soundpub.profiles
  FOR EACH ROW
  EXECUTE FUNCTION soundpub.auto_assign_artist_role();

COMMIT;

-- Verification
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'soundpub'
  AND event_object_table = 'profiles'
  AND trigger_name IN ('trigger_auto_assign_soundpub_label', 'trigger_auto_assign_artist_role')
ORDER BY trigger_name;
