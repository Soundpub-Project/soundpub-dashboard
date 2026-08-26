-- =============================================
-- FINAL SOLUTION: Direct Trigger Creation
-- Connect to database using supabase_admin or postgres user
-- 
-- Connection string example:
-- psql postgresql://supabase_admin:your_password@localhost:5432/postgres
-- 
-- Or in Supabase Studio/SQL Editor: manually switch connection to supabase_admin
-- =============================================

BEGIN;

CREATE OR REPLACE FUNCTION Soundpub.auto_assign_new_user_to_Soundpub_label()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
DECLARE
  Soundpub_label_id uuid := '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_label_id IS NULL THEN
    NEW.parent_label_id := Soundpub_label_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION Soundpub.auto_assign_artist_role()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
DECLARE
  Soundpub_label_id uuid := '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid;
BEGIN
  IF NEW.parent_label_id = Soundpub_label_id THEN
    INSERT INTO Soundpub.user_roles (user_id, role)
    VALUES (NEW.id, 'artist'::Soundpub.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_assign_Soundpub_label ON Soundpub.profiles;
DROP TRIGGER IF EXISTS trigger_auto_assign_artist_role ON Soundpub.profiles;

CREATE TRIGGER trigger_auto_assign_Soundpub_label
  BEFORE INSERT ON Soundpub.profiles
  FOR EACH ROW
  EXECUTE FUNCTION Soundpub.auto_assign_new_user_to_Soundpub_label();

CREATE TRIGGER trigger_auto_assign_artist_role
  AFTER INSERT ON Soundpub.profiles
  FOR EACH ROW
  EXECUTE FUNCTION Soundpub.auto_assign_artist_role();

COMMIT;

-- Verification
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'Soundpub'
  AND event_object_table = 'profiles'
  AND trigger_name IN ('trigger_auto_assign_Soundpub_label', 'trigger_auto_assign_artist_role')
ORDER BY trigger_name;

-- Check current user (should be supabase_admin or postgres)
SELECT current_user;
