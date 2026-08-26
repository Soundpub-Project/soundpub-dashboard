-- =============================================
-- AUTO-ASSIGN: New Users to Soundpub Label as Artists (Alternative)
-- Run this as postgres superuser or user with CREATE privilege on Soundpub schema
-- =============================================

-- First, grant necessary permissions (run as superuser)
-- GRANT ALL ON SCHEMA Soundpub TO postgres;
-- GRANT ALL ON ALL TABLES IN SCHEMA Soundpub TO postgres;

BEGIN;

-- Set search path to ensure we''re in the right schema
SET search_path TO Soundpub, public;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION Soundpub.auto_assign_new_user_to_Soundpub_label()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
DECLARE
  Soundpub_label_id uuid := ''9fd5ab85-c603-496a-95e2-1045b30847f8''::uuid;
BEGIN
  IF TG_OP = ''INSERT'' AND NEW.parent_label_id IS NULL THEN
    NEW.parent_label_id := Soundpub_label_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to auto-assign artist role
CREATE OR REPLACE FUNCTION Soundpub.auto_assign_artist_role()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = Soundpub, public
AS $$
DECLARE
  Soundpub_label_id uuid := ''9fd5ab85-c603-496a-95e2-1045b30847f8''::uuid;
BEGIN
  IF NEW.parent_label_id = Soundpub_label_id THEN
    INSERT INTO Soundpub.user_roles (user_id, role)
    VALUES (NEW.id, ''artist''::Soundpub.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_auto_assign_Soundpub_label ON Soundpub.profiles;
DROP TRIGGER IF EXISTS trigger_auto_assign_artist_role ON Soundpub.profiles;

-- Create triggers
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
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = ''Soundpub''
  AND event_object_table = ''profiles''
ORDER BY trigger_name;
