
-- 1) email_send_log: tighten SELECT to use auth.users.email (authoritative), not profiles.email (user-editable surface)
DROP POLICY IF EXISTS "Users can view their own email logs" ON public.email_send_log;
CREATE POLICY "Users can view their own email logs"
ON public.email_send_log
FOR SELECT
TO authenticated
USING (
  recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- 2) release_payments: explicitly deny non-admin UPDATE
CREATE POLICY "Only admins can update payments"
ON public.release_payments
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- 3) Remove artist_name fallback matching on releases, tracks, royalties

-- releases: artists policies
DROP POLICY IF EXISTS "Artists can view their releases" ON public.releases;
CREATE POLICY "Artists can view their releases"
ON public.releases
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role)
  AND artist_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Artists can update their own draft or pending releases" ON public.releases;
CREATE POLICY "Artists can update their own draft or pending releases"
ON public.releases
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role)
  AND artist_user_id = auth.uid()
  AND status = ANY (ARRAY['pending'::text, 'draft'::text])
)
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role)
  AND artist_user_id = auth.uid()
  AND status = ANY (ARRAY['pending'::text, 'draft'::text])
);

-- tracks: artists policies
DROP POLICY IF EXISTS "Artists can delete tracks for their draft or pending releases" ON public.tracks;
CREATE POLICY "Artists can delete tracks for their draft or pending releases"
ON public.tracks
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE artist_user_id = auth.uid()
      AND status = ANY (ARRAY['pending'::text, 'draft'::text])
  )
);

DROP POLICY IF EXISTS "Artists can insert tracks for their releases" ON public.tracks;
CREATE POLICY "Artists can insert tracks for their releases"
ON public.tracks
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE artist_user_id = auth.uid()
      AND label_id = get_user_parent_label_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Artists can update tracks for their draft or pending releases" ON public.tracks;
CREATE POLICY "Artists can update tracks for their draft or pending releases"
ON public.tracks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE artist_user_id = auth.uid()
      AND status = ANY (ARRAY['pending'::text, 'draft'::text])
  )
)
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE artist_user_id = auth.uid()
      AND status = ANY (ARRAY['pending'::text, 'draft'::text])
  )
);

DROP POLICY IF EXISTS "Artists can view their tracks" ON public.tracks;
CREATE POLICY "Artists can view their tracks"
ON public.tracks
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role)
  AND (
    artist_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.releases
      WHERE releases.id = tracks.release_id
        AND releases.artist_user_id = auth.uid()
    )
  )
);

-- royalties: artists policy
DROP POLICY IF EXISTS "Artists can view their royalties" ON public.royalties;
CREATE POLICY "Artists can view their royalties"
ON public.royalties
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role)
  AND artist_user_id = auth.uid()
);
