-- =============================================
-- REPAIR ARTIST ROLES FOR LABEL / WHITELABEL ARTISTS
-- Run this if artist dropdown in release form is still empty
-- =============================================

BEGIN;

-- Ensure every child profile under a label/whitelabel has role artist.
UPDATE soundpub.user_roles ur
SET role = 'artist'::soundpub.app_role
FROM soundpub.profiles p
WHERE ur.user_id = p.id
  AND p.parent_label_id IS NOT NULL
  AND COALESCE(ur.role::text, '') <> 'artist';

-- Insert missing artist role rows for child profiles.
INSERT INTO soundpub.user_roles (user_id, role)
SELECT p.id, 'artist'::soundpub.app_role
FROM soundpub.profiles p
LEFT JOIN soundpub.user_roles ur ON ur.user_id = p.id
WHERE p.parent_label_id IS NOT NULL
  AND ur.user_id IS NULL;

-- Activate child profiles except explicitly suspended/deleted.
UPDATE soundpub.profiles
SET status = 'active', updated_at = now()
WHERE parent_label_id IS NOT NULL
  AND COALESCE(status, '') NOT IN ('active', 'suspended', 'deleted');

COMMIT;

SELECT p.id, p.full_name, p.email, p.parent_label_id, p.status, ur.role
FROM soundpub.profiles p
LEFT JOIN soundpub.user_roles ur ON ur.user_id = p.id
WHERE p.parent_label_id IS NOT NULL
ORDER BY p.full_name;
