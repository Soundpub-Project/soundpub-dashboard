-- =============================================
-- FIX: Ensure Soundpub Music Ecosystem Label Profile Exists
-- This fixes Google OAuth sign-ups not getting assigned to Soundpub label
-- Uses existing publishersoundpub@gmail.com account
-- =============================================

BEGIN;

-- Step 1: Ensure the existing Soundpub label has correct data
-- UUID: 9fd5ab85-c603-496a-95e2-1045b30847f8 (publishersoundpub@gmail.com)
UPDATE soundpub.profiles
SET 
  full_name = 'SOUNDPUB MUSIC',
  status = 'active',
  updated_at = now()
WHERE id = '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid;

-- Step 2: Ensure the Soundpub label has the 'label' role
INSERT INTO soundpub.user_roles (user_id, role)
VALUES ('9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid, 'label'::soundpub.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- Step 3: Fix existing artists who registered via Google but don't have a parent_label_id
-- Assign them to the existing Soundpub label
UPDATE soundpub.profiles p
SET 
  parent_label_id = '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid,
  updated_at = now()
WHERE p.parent_label_id IS NULL
  AND p.sso_provider = 'google'
  AND EXISTS (
    SELECT 1 FROM soundpub.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'artist'::soundpub.app_role
  );

COMMIT;

-- Verification: Check artists under Soundpub label
SELECT
  p.id,
  p.email,
  p.full_name,
  p.sso_provider,
  p.parent_label_id,
  pl.full_name as parent_label_name,
  array_agg(ur.role::text ORDER BY ur.role::text) AS roles
FROM soundpub.profiles p
LEFT JOIN soundpub.user_roles ur ON ur.user_id = p.id
LEFT JOIN soundpub.profiles pl ON pl.id = p.parent_label_id
WHERE p.parent_label_id = '9fd5ab85-c603-496a-95e2-1045b30847f8'::uuid
GROUP BY p.id, p.email, p.full_name, p.sso_provider, p.parent_label_id, pl.full_name
ORDER BY p.created_at DESC
LIMIT 20;
