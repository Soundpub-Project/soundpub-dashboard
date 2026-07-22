-- =============================================
-- SOUNDPUB VERIFY USER ROLES AFTER CSV RECONCILE
-- Run after 10-reconcile-user-roles-from-csv.sql
-- =============================================

-- Final role counts in database.
SELECT role::text AS role, count(*) AS total
FROM soundpub.user_roles
GROUP BY role
ORDER BY role::text;

-- Profiles that do not have any role.
SELECT p.id, p.email, p.full_name, p.created_at
FROM soundpub.profiles p
LEFT JOIN soundpub.user_roles ur ON ur.user_id = p.id
WHERE ur.user_id IS NULL
ORDER BY p.created_at NULLS LAST, p.email;

-- Role rows that point to missing auth users. This should return 0 rows.
SELECT ur.user_id, ur.role::text, ur.created_at
FROM soundpub.user_roles ur
LEFT JOIN auth.users au ON au.id = ur.user_id
WHERE au.id IS NULL
ORDER BY ur.role::text, ur.user_id;

-- Role rows that point to missing profiles. This should return 0 rows after profiles import.
SELECT ur.user_id, ur.role::text, ur.created_at
FROM soundpub.user_roles ur
LEFT JOIN soundpub.profiles p ON p.id = ur.user_id
WHERE p.id IS NULL
ORDER BY ur.role::text, ur.user_id;
