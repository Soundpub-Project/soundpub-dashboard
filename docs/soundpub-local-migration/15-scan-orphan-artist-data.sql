-- =============================================
-- Soundpub ORPHAN DATA SCAN AND OPTIONAL FIX
-- Use this to find profile/release/track references that point to missing users
-- or profiles without a valid artist role.
-- =============================================

-- 1) Profiles without auth.users row.
SELECT
  'profiles_without_auth_user' AS issue,
  p.id,
  p.email,
  p.full_name,
  p.parent_label_id,
  p.status,
  p.created_at
FROM Soundpub.profiles p
LEFT JOIN auth.users au ON au.id = p.id
WHERE au.id IS NULL
ORDER BY p.created_at DESC;

-- 2) Profiles under a label/whitelabel that are not valid artist accounts.
SELECT
  'child_profile_not_valid_artist' AS issue,
  p.id,
  p.email,
  p.full_name,
  p.parent_label_id,
  parent.full_name AS parent_label_name,
  au.id IS NOT NULL AS has_auth_user,
  array_remove(array_agg(ur.role::text), NULL) AS roles
FROM Soundpub.profiles p
JOIN Soundpub.profiles parent ON parent.id = p.parent_label_id
LEFT JOIN auth.users au ON au.id = p.id
LEFT JOIN Soundpub.user_roles ur ON ur.user_id = p.id
WHERE NOT EXISTS (
  SELECT 1 FROM Soundpub.user_roles artist_role
  WHERE artist_role.user_id = p.id
    AND artist_role.role = 'artist'::Soundpub.app_role
)
OR au.id IS NULL
GROUP BY p.id, p.email, p.full_name, p.parent_label_id, parent.full_name, au.id
ORDER BY parent.full_name, p.full_name;

-- 3) Releases whose artist_user_id is missing, invalid, or not an artist.
SELECT
  'release_artist_user_invalid' AS issue,
  r.id AS release_id,
  r.title,
  r.artist_name,
  r.artist_user_id,
  r.label_id,
  label.full_name AS label_name,
  au.id IS NOT NULL AS has_auth_user,
  array_remove(array_agg(ur.role::text), NULL) AS roles
FROM Soundpub.releases r
LEFT JOIN Soundpub.profiles label ON label.id = r.label_id
LEFT JOIN auth.users au ON au.id = r.artist_user_id
LEFT JOIN Soundpub.user_roles ur ON ur.user_id = r.artist_user_id
WHERE r.artist_user_id IS NOT NULL
  AND (
    au.id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM Soundpub.user_roles artist_role
      WHERE artist_role.user_id = r.artist_user_id
        AND artist_role.role = 'artist'::Soundpub.app_role
    )
  )
GROUP BY r.id, r.title, r.artist_name, r.artist_user_id, r.label_id, label.full_name, au.id
ORDER BY label.full_name, r.artist_name, r.title;

-- 4) Tracks whose artist_user_id is missing, invalid, or not an artist.
SELECT
  'track_artist_user_invalid' AS issue,
  t.id AS track_id,
  t.title,
  t.artist_name,
  t.artist_user_id,
  t.release_id,
  r.title AS release_title,
  au.id IS NOT NULL AS has_auth_user,
  array_remove(array_agg(ur.role::text), NULL) AS roles
FROM Soundpub.tracks t
LEFT JOIN Soundpub.releases r ON r.id = t.release_id
LEFT JOIN auth.users au ON au.id = t.artist_user_id
LEFT JOIN Soundpub.user_roles ur ON ur.user_id = t.artist_user_id
WHERE t.artist_user_id IS NOT NULL
  AND (
    au.id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM Soundpub.user_roles artist_role
      WHERE artist_role.user_id = t.artist_user_id
        AND artist_role.role = 'artist'::Soundpub.app_role
    )
  )
GROUP BY t.id, t.title, t.artist_name, t.artist_user_id, t.release_id, r.title, au.id
ORDER BY r.title, t.artist_name, t.title;

-- 5) Releases with artist name but no linked artist_user_id.
SELECT
  'release_artist_unlinked' AS issue,
  r.id AS release_id,
  r.title,
  r.artist_name,
  r.artist_user_id,
  r.label_id,
  label.full_name AS label_name
FROM Soundpub.releases r
LEFT JOIN Soundpub.profiles label ON label.id = r.label_id
WHERE r.artist_user_id IS NULL
  AND NULLIF(TRIM(r.artist_name), '') IS NOT NULL
ORDER BY label.full_name, r.artist_name, r.title;

-- =============================================
-- OPTIONAL FIXES
-- Review scan results above first. Run only the blocks you want.
-- =============================================

-- A) Hide invalid child profiles from label/whitelabel artist lists by marking inactive.
-- UPDATE Soundpub.profiles p
-- SET status = 'inactive', updated_at = now()
-- WHERE p.parent_label_id IS NOT NULL
--   AND (
--     NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p.id)
--     OR NOT EXISTS (
--       SELECT 1 FROM Soundpub.user_roles ur
--       WHERE ur.user_id = p.id AND ur.role = 'artist'::Soundpub.app_role
--     )
--   );

-- B) Remove invalid artist_user_id links from releases; keeps artist_name text.
-- UPDATE Soundpub.releases r
-- SET artist_user_id = NULL
-- WHERE r.artist_user_id IS NOT NULL
--   AND (
--     NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = r.artist_user_id)
--     OR NOT EXISTS (
--       SELECT 1 FROM Soundpub.user_roles ur
--       WHERE ur.user_id = r.artist_user_id AND ur.role = 'artist'::Soundpub.app_role
--     )
--   );

-- C) Remove invalid artist_user_id links from tracks; keeps artist_name text.
-- UPDATE Soundpub.tracks t
-- SET artist_user_id = NULL
-- WHERE t.artist_user_id IS NOT NULL
--   AND (
--     NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = t.artist_user_id)
--     OR NOT EXISTS (
--       SELECT 1 FROM Soundpub.user_roles ur
--       WHERE ur.user_id = t.artist_user_id AND ur.role = 'artist'::Soundpub.app_role
--     )
--   );
