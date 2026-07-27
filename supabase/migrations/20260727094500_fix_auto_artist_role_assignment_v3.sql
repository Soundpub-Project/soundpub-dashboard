-- =============================================
-- FIX: Auto Role Assignment for Manual Signup
-- VERSION 3 - Updated for REAL Soundpub Music label data
-- Label ID: 9fd5ab85-c603-496a-95e2-1045b30847f8
-- Label Email: publishersoundpub@gmail.com
-- Label Name: SOUNDPUB MUSIC
-- Created: 2026-07-27 (v3 - Real data)
-- =============================================

-- STEP 1: Verify Soundpub Music label exists (using REAL data)
DO $$
DECLARE
  soundpub_label_id UUID;
  soundpub_label_exists BOOLEAN := FALSE;
BEGIN
  -- Check if SOUNDPUB MUSIC label exists using REAL email
  SELECT id, TRUE INTO soundpub_label_id, soundpub_label_exists
  FROM soundpub.profiles
  WHERE email = 'publishersoundpub@gmail.com' 
     OR id = '9fd5ab85-c603-496a-95e2-1045b30847f8'
     OR UPPER(full_name) = 'SOUNDPUB MUSIC'
  LIMIT 1;

  IF soundpub_label_exists THEN
    RAISE NOTICE 'SOUNDPUB MUSIC label found with ID: %', soundpub_label_id;
    RAISE NOTICE 'Email: publishersoundpub@gmail.com';
    RAISE NOTICE 'This label will be used for manual signups.';
  ELSE
    RAISE WARNING 'SOUNDPUB MUSIC label NOT FOUND!';
    RAISE WARNING 'Expected ID: 9fd5ab85-c603-496a-95e2-1045b30847f8';
    RAISE WARNING 'Expected Email: publishersoundpub@gmail.com';
    RAISE WARNING 'Please check your database!';
  END IF;
END $$;

-- STEP 2: Create or replace the handle_new_user function with REAL label data
CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  soundpub_label_id UUID;
  new_artist_id UUID;
BEGIN
  -- Get SOUNDPUB MUSIC label ID using REAL email
  SELECT id INTO soundpub_label_id
  FROM soundpub.profiles
  WHERE email = 'publishersoundpub@gmail.com'
     OR id = '9fd5ab85-c603-496a-95e2-1045b30847f8'
     OR UPPER(full_name) = 'SOUNDPUB MUSIC'
  LIMIT 1;

  -- If label doesn't exist, log error but continue
  IF soundpub_label_id IS NULL THEN
    RAISE WARNING 'SOUNDPUB MUSIC label not found! User will be created without parent_label_id.';
    RAISE WARNING 'Expected email: publishersoundpub@gmail.com';
    RAISE WARNING 'Expected ID: 9fd5ab85-c603-496a-95e2-1045b30847f8';
  ELSE
    RAISE NOTICE 'Using SOUNDPUB MUSIC label: %', soundpub_label_id;
  END IF;

  -- Create profile with artist defaults
  INSERT INTO soundpub.profiles (
    id,
    email,
    full_name,
    parent_label_id,
    status,
    password_set,
    artist_profile_completed
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    soundpub_label_id,  -- Assign to SOUNDPUB MUSIC (real label)
    'active',
    COALESCE((NEW.raw_user_meta_data ->> 'password_set')::boolean, true),
    false
  );

  -- Assign 'artist' role by default
  INSERT INTO soundpub.user_roles (user_id, role)
  VALUES (NEW.id, 'artist'::soundpub.app_role);

  -- Create artist entry (only if label exists)
  IF soundpub_label_id IS NOT NULL THEN
    INSERT INTO soundpub.artists (
      id,
      user_id,
      label_id,
      artist_name,
      status
    ) VALUES (
      gen_random_uuid(),
      NEW.id,
      soundpub_label_id,  -- SOUNDPUB MUSIC (real label)
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
      'active'
    )
    RETURNING id INTO new_artist_id;

    RAISE NOTICE 'Created new artist: user_id=%, artist_id=%, label_id=% (SOUNDPUB MUSIC)', 
                 NEW.id, new_artist_id, soundpub_label_id;
  ELSE
    RAISE WARNING 'Skipped artist entry creation - SOUNDPUB MUSIC label not found';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

-- STEP 3: Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION soundpub.handle_new_user();

-- STEP 4: Add comment
COMMENT ON FUNCTION soundpub.handle_new_user() IS 
  'Trigger function that creates profile, assigns artist role, and creates artist entry for new users. 
   Updated 2026-07-27 v3 to use REAL Soundpub Music label data:
   - ID: 9fd5ab85-c603-496a-95e2-1045b30847f8
   - Email: publishersoundpub@gmail.com
   - Name: SOUNDPUB MUSIC';

-- =============================================
-- VERIFICATION QUERIES
-- =============================================
-- Run these to verify:

-- 1. Check SOUNDPUB MUSIC label exists (using REAL data)
SELECT 
  id, 
  email, 
  full_name, 
  parent_label_id, 
  status,
  CASE 
    WHEN id = '9fd5ab85-c603-496a-95e2-1045b30847f8' THEN '✅ ID MATCH'
    ELSE '❌ ID DIFFERENT'
  END as id_check,
  CASE 
    WHEN email = 'publishersoundpub@gmail.com' THEN '✅ EMAIL MATCH'
    ELSE '❌ EMAIL DIFFERENT'
  END as email_check
FROM soundpub.profiles
WHERE email = 'publishersoundpub@gmail.com' 
   OR id = '9fd5ab85-c603-496a-95e2-1045b30847f8'
   OR UPPER(full_name) = 'SOUNDPUB MUSIC';

-- 2. Check label role
SELECT ur.user_id, ur.role, p.email, p.full_name
FROM soundpub.user_roles ur
JOIN soundpub.profiles p ON p.id = ur.user_id
WHERE p.email = 'publishersoundpub@gmail.com' 
   OR p.id = '9fd5ab85-c603-496a-95e2-1045b30847f8';

-- 3. Check trigger function source code
SELECT 
  proname as function_name,
  CASE 
    WHEN prosrc LIKE '%publishersoundpub@gmail.com%' THEN '✅ Uses correct email'
    ELSE '❌ Uses wrong email'
  END as email_check,
  CASE 
    WHEN prosrc LIKE '%9fd5ab85-c603-496a-95e2-1045b30847f8%' THEN '✅ Uses correct ID'
    ELSE '❌ Uses wrong ID'
  END as id_check
FROM pg_proc
WHERE proname = 'handle_new_user'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'soundpub');

-- 4. Test query: Show what label new users will get
SELECT 
  id as label_id,
  email as label_email,
  full_name as label_name,
  '👉 New manual signup users will be assigned to this label' as note
FROM soundpub.profiles
WHERE email = 'publishersoundpub@gmail.com' 
   OR id = '9fd5ab85-c603-496a-95e2-1045b30847f8'
LIMIT 1;
