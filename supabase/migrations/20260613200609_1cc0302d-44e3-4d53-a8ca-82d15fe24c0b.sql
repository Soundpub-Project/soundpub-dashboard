
-- 1. Tighten storage INSERT policies to require path ownership

-- release-covers: drop broad role-only insert policies, add ownership-based ones
DROP POLICY IF EXISTS "Labels can upload release covers" ON storage.objects;
DROP POLICY IF EXISTS "Labels can update their release covers" ON storage.objects;
DROP POLICY IF EXISTS "Artists can upload release covers" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can upload release covers" ON storage.objects;

CREATE POLICY "Users can upload release covers to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'release-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_role(auth.uid(), 'label')
      OR public.has_role(auth.uid(), 'artist')
      OR public.has_role(auth.uid(), 'whitelabel')
      OR public.is_admin(auth.uid())
    )
  );

CREATE POLICY "Users can update release covers in own folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'release-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- track-audio
DROP POLICY IF EXISTS "Labels can upload track audio" ON storage.objects;
DROP POLICY IF EXISTS "Artists can upload track audio" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can upload track audio" ON storage.objects;

CREATE POLICY "Users can upload track audio to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'track-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_role(auth.uid(), 'label')
      OR public.has_role(auth.uid(), 'artist')
      OR public.has_role(auth.uid(), 'whitelabel')
      OR public.is_admin(auth.uid())
    )
  );

-- track-video
DROP POLICY IF EXISTS "Labels can upload track video" ON storage.objects;
DROP POLICY IF EXISTS "Artists can upload track video" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can upload track video" ON storage.objects;

CREATE POLICY "Users can upload track video to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'track-video'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      public.has_role(auth.uid(), 'label')
      OR public.has_role(auth.uid(), 'artist')
      OR public.has_role(auth.uid(), 'whitelabel')
      OR public.is_admin(auth.uid())
    )
  );


-- 2. Tighten profiles label/whitelabel UPDATE: enforce privileged fields unchanged via WITH CHECK

CREATE OR REPLACE FUNCTION public.label_profile_update_safe(
  _id uuid,
  _balance numeric,
  _label_revenue numeric,
  _artist_revenue numeric,
  _subscription_status text,
  _parent_label_id uuid,
  _composer_code text,
  _status text,
  _email text,
  _sso_provider text,
  _sso_user_id text,
  _sso_user_type text,
  _password_set boolean
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _id
      AND p.balance IS NOT DISTINCT FROM _balance
      AND p.label_revenue IS NOT DISTINCT FROM _label_revenue
      AND p.artist_revenue IS NOT DISTINCT FROM _artist_revenue
      AND p.subscription_status IS NOT DISTINCT FROM _subscription_status
      AND p.parent_label_id IS NOT DISTINCT FROM _parent_label_id
      AND p.composer_code IS NOT DISTINCT FROM _composer_code
      AND p.status IS NOT DISTINCT FROM _status
      AND p.email IS NOT DISTINCT FROM _email
      AND p.sso_provider IS NOT DISTINCT FROM _sso_provider
      AND p.sso_user_id IS NOT DISTINCT FROM _sso_user_id
      AND p.sso_user_type IS NOT DISTINCT FROM _sso_user_type
      AND p.password_set IS NOT DISTINCT FROM _password_set
  )
$$;

REVOKE EXECUTE ON FUNCTION public.label_profile_update_safe(uuid,numeric,numeric,numeric,text,uuid,text,text,text,text,text,text,boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.label_profile_update_safe(uuid,numeric,numeric,numeric,text,uuid,text,text,text,text,text,text,boolean) TO authenticated;

DROP POLICY IF EXISTS "Labels can update their artists" ON public.profiles;
DROP POLICY IF EXISTS "Whitelabels can update their artists" ON public.profiles;

CREATE POLICY "Labels can update their artists (safe fields)"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'label')
    AND parent_label_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'label')
    AND parent_label_id = auth.uid()
    AND public.label_profile_update_safe(
      id, balance, label_revenue, artist_revenue,
      subscription_status, parent_label_id, composer_code,
      status, email, sso_provider, sso_user_id, sso_user_type, password_set
    )
  );

CREATE POLICY "Whitelabels can update their artists (safe fields)"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'whitelabel')
    AND parent_label_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'whitelabel')
    AND parent_label_id = auth.uid()
    AND public.label_profile_update_safe(
      id, balance, label_revenue, artist_revenue,
      subscription_status, parent_label_id, composer_code,
      status, email, sso_provider, sso_user_id, sso_user_type, password_set
    )
  );


-- 3. payout_requests: explicit restrictive UPDATE policy preventing non-admin users
-- (RLS already denies by default since no permissive UPDATE policy exists for users,
-- but adding a restrictive policy is defense-in-depth.)
CREATE POLICY "Only admins can update payouts"
  ON public.payout_requests AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
