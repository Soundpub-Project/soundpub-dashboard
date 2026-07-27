-- =============================================
-- FIX: Auto Role Assignment for Manual Signup
-- FIXED VERSION - Handles existing Soundpub Music label
-- Created: 2026-07-27 (Updated)
-- =============================================

-- STEP 1: Ensure Soundpub Music label exists (skip if exists)
DO $$
DECLARE
  soundpub_label_id UUID;
  soundpub_label_exists BOOLEAN;
BEGIN
  -- Check if Soundpub Music label already exists
  SELECT id, TRUE INTO soundpub_label_id, soundpub_label_exists
  FROM soundpub.profiles
  WHERE email = 'label@soundpub.id' OR full_name = 'Soundpub Music'
  LIMIT 1;

  -- Only create if not exists
  IF NOT soundpub_label_exists THEN
    RAISE NOTICE 'Creating Soundpub Music label...';
    
    -- Generate new UUID for the label
    soundpub_label_id := gen_random_uuid();
    
    -- First create auth user for the label
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      soundpub_label_id,
      'authenticated',
      'authenticated',
      'label@soundpub.id',
      crypt('soundpub-label-2024', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Soundpub Music"}',
      NOW(),
      NOW(),
      '',
      ''
    )
    ON CONFLICT (id) DO NOTHING;  -- Skip if auth user already exists

    -- Create profile for Soundpub Music label
    INSERT INTO soundpub.profiles (
      id,
      email,
      full_name,
      status,
      parent_label_id
    ) VALUES (
      soundpub_label_id,
      'label@soundpub.id',
      'Soundpub Music',
      'active',
      NULL  -- Top-level label
    )
    ON CONFLICT (id) DO NOTHING;  -- Skip if profile already exists

    -- Assign 'label' role
    INSERT INTO soundpub.user_roles (user_id, role)
    VALUES (soundpub_label_id, 'label'::soundpub.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;  -- Skip if role already exists

    RAISE NOTICE 'Created Soundpub Music label with ID: %', soundpub_label_id;
  ELSE
    RAISE NOTICE 'Soundpub Music label already exists with ID: %', soundpub_label_id;
  END IF;
END $$;

-- STEP 2: Create or replace the handle_new_user function with artist logic
CREATE OR REPLACE FUNCTION soundpub.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  soundpub_label_id UUID;
  new_artist_id UUID;
BEGIN
  -- Get Soundpub Music label ID
  SELECT id INTO soundpub_label_id
  FROM soundpub.profiles
  WHERE email = 'label@soundpub.id' OR full_name = 'Soundpub Music'
  LIMIT 1;

  -- If label doesn't exist, log error but continue
  IF soundpub_label_id IS NULL THEN
    RAISE WARNING 'Soundpub Music label not found! User will be created without parent_label_id.';
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
    soundpub_label_id,  -- Assign to Soundpub Music
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
      soundpub_label_id,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
      'active'
    )
    RETURNING id INTO new_artist_id;

    RAISE NOTICE 'Created new artist: user_id=%, artist_id=%, label_id=%', NEW.id, new_artist_id, soundpub_label_id;
  ELSE
    RAISE WARNING 'Skipped artist entry creation - no label found';
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
  'Trigger function that creates profile, assigns artist role, and creates artist entry for new users. Updated 2026-07-27 to fix auto role assignment. Fixed to handle existing Soundpub Music label.';

-- =============================================
-- VERIFICATION QUERIES
-- =============================================
-- Run these to verify:

-- 1. Check Soundpub Music label exists
SELECT id, email, full_name, parent_label_id, status
FROM soundpub.profiles
WHERE email = 'label@soundpub.id' OR full_name = 'Soundpub Music';

-- 2. Check label role
SELECT ur.user_id, ur.role, p.email, p.full_name
FROM soundpub.user_roles ur
JOIN soundpub.profiles p ON p.id = ur.user_id
WHERE p.email = 'label@soundpub.id' OR p.full_name = 'Soundpub Music';

-- 3. Check trigger function updated
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'handle_new_user';
