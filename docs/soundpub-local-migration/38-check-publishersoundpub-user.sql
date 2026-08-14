-- =============================================
-- CHECK: Existing publishersoundpub@gmail.com User Data
-- Query to get UUID and all related information
-- =============================================

-- Check in auth.users table
SELECT 
  'AUTH USERS' as source,
  id as user_id,
  email,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  last_sign_in_at
FROM auth.users
WHERE email = 'publishersoundpub@gmail.com';

-- Check in soundpub.profiles table
SELECT
  'PROFILES' as source,
  p.id as user_id,
  p.email,
  p.full_name,
  p.status,
  p.sso_provider,
  p.parent_label_id,
  p.created_at,
  p.updated_at,
  pl.full_name as parent_label_name
FROM soundpub.profiles p
LEFT JOIN soundpub.profiles pl ON pl.id = p.parent_label_id
WHERE p.email = 'publishersoundpub@gmail.com';

-- Check roles assigned to this user
SELECT
  'USER ROLES' as source,
  ur.user_id,
  p.email,
  ur.role::text as role,
  ur.created_at
FROM soundpub.user_roles ur
JOIN soundpub.profiles p ON p.id = ur.user_id
WHERE p.email = 'publishersoundpub@gmail.com'
ORDER BY ur.created_at;

-- Check if user has any labels assigned (if they are a label)
SELECT
  'LABELS ASSIGNED' as source,
  COUNT(*) as artist_count,
  array_agg(DISTINCT artists.email) as artist_emails
FROM soundpub.profiles label
LEFT JOIN soundpub.profiles artists ON artists.parent_label_id = label.id
WHERE label.email = 'publishersoundpub@gmail.com'
GROUP BY label.id;
