
-- 1) Profiles self-update: enforce WITH CHECK via existing safe helper to block privileged-field changes at the policy layer (defense in depth alongside the trigger).
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND public.label_profile_update_safe(
      id, balance, label_revenue, artist_revenue,
      subscription_status, parent_label_id, composer_code,
      status, email, sso_provider, sso_user_id, sso_user_type, password_set
    )
  );

-- 2) Royalties: scope label/whitelabel visibility to a stable identifier (profile id) instead of mutable full_name.
ALTER TABLE public.royalties
  ADD COLUMN IF NOT EXISTS label_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_royalties_label_user_id ON public.royalties(label_user_id);

-- Backfill from existing profile full_name. In case of duplicate full_names among labels/whitelabels,
-- leave label_user_id NULL so visibility is denied (admins still see via admin policy).
WITH unique_labels AS (
  SELECT lower(trim(p.full_name)) AS name_key, MIN(p.id::text)::uuid AS only_id, COUNT(*) AS cnt
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('label','whitelabel') AND p.full_name IS NOT NULL AND trim(p.full_name) <> ''
  GROUP BY lower(trim(p.full_name))
  HAVING COUNT(*) = 1
)
UPDATE public.royalties r
SET label_user_id = ul.only_id
FROM unique_labels ul
WHERE r.label_user_id IS NULL
  AND lower(trim(r.label_name)) = ul.name_key;

DROP POLICY IF EXISTS "Labels can view royalties for their artists" ON public.royalties;
CREATE POLICY "Labels can view royalties for their artists"
  ON public.royalties
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'label'::app_role)
    AND label_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Whitelabels can view royalties for their artists" ON public.royalties;
CREATE POLICY "Whitelabels can view royalties for their artists"
  ON public.royalties
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'whitelabel'::app_role)
    AND label_user_id = auth.uid()
  );

-- 3) Storage track-audio / track-video: remove the broad role-only policies that bypass folder-path enforcement.
DROP POLICY IF EXISTS "Roles can upload to track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Roles can update track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Roles can delete track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Roles can upload to track-video" ON storage.objects;
DROP POLICY IF EXISTS "Roles can update track-video" ON storage.objects;
DROP POLICY IF EXISTS "Roles can delete track-video" ON storage.objects;
