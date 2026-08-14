-- =============================================
-- MIGRATE: Update Artists from Old Label to SOUNDPUB MUSIC
-- Changes all artists using 'Soundpub Music Ecosystem' label
-- to use the correct 'SOUNDPUB MUSIC' label
-- =============================================

BEGIN;

-- Step 1: Find and update all artists using the old label ID
-- Old label: '423ecca4-2cd0-429d-b9f8-f9a8e8135289' (Soundpub Music Ecosystem)
-- New label: '9fd5ab85-c603-496a-95e2-1045b30847f8' (SOUNDPUB MUSIC)

UPDATE soundpub.profiles
SET 
  parent_label_id = '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid,
  updated_at = now()
WHERE parent_label_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid
  AND EXISTS (
    SELECT 1 FROM soundpub.user_roles ur
    WHERE ur.user_id = profiles.id 
    AND ur.role = 'artist'::soundpub.app_role
  );

-- Step 2: Delete the old label profile if it exists (optional, uncomment if needed)
-- DELETE FROM soundpub.user_roles 
-- WHERE user_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid;

-- DELETE FROM soundpub.profiles 
-- WHERE id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid;

COMMIT;

-- Verification: Check artists now under SOUNDPUB MUSIC label
SELECT
  'After Migration' as status,
  COUNT(*) as total_artists,
  pl.full_name as label_name
FROM soundpub.profiles p
JOIN soundpub.profiles pl ON pl.id = p.parent_label_id
JOIN soundpub.user_roles ur ON ur.user_id = p.id
WHERE p.parent_label_id = '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid
  AND ur.role = 'artist'::soundpub.app_role
GROUP BY pl.full_name;

-- Check if any artists still use the old label (should be 0)
SELECT
  'Still Using Old Label' as status,
  COUNT(*) as count
FROM soundpub.profiles
WHERE parent_label_id = '423ecca4-2cd0-429d-b9f8-f9a8e8135289'::uuid;

-- List all artists under SOUNDPUB MUSIC (first 20)
SELECT
  p.id,
  p.email,
  p.full_name,
  p.sso_provider,
  p.created_at,
  array_agg(ur.role::text) as roles
FROM soundpub.profiles p
LEFT JOIN soundpub.user_roles ur ON ur.user_id = p.id
WHERE p.parent_label_id = '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid
GROUP BY p.id, p.email, p.full_name, p.sso_provider, p.created_at
ORDER BY p.created_at DESC
LIMIT 20;
