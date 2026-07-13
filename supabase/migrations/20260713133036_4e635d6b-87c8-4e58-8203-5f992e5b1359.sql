
-- Allow label/whitelabel/artist to edit releases that are already active
DROP POLICY IF EXISTS "Labels can update draft/pending releases" ON public.releases;
DROP POLICY IF EXISTS "Whitelabels can update draft/pending releases" ON public.releases;
DROP POLICY IF EXISTS "Artists can update their own draft or pending releases" ON public.releases;

CREATE POLICY "Labels can update their releases (except paid-gate)"
ON public.releases FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'label'::app_role) AND label_id = auth.uid()
       AND status = ANY (ARRAY['pending','draft','active']))
WITH CHECK (has_role(auth.uid(), 'label'::app_role) AND label_id = auth.uid()
       AND status = ANY (ARRAY['pending','draft','active']));

CREATE POLICY "Whitelabels can update their releases (except paid-gate)"
ON public.releases FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid()
       AND status = ANY (ARRAY['pending','draft','active']))
WITH CHECK (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid()
       AND status = ANY (ARRAY['pending','draft','active']));

CREATE POLICY "Artists can update their releases (except paid-gate)"
ON public.releases FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'artist'::app_role) AND artist_user_id = auth.uid()
       AND status = ANY (ARRAY['pending','draft','active']))
WITH CHECK (has_role(auth.uid(), 'artist'::app_role) AND artist_user_id = auth.uid()
       AND status = ANY (ARRAY['pending','draft','active']));

-- Mirror on tracks so users can edit tracks of active releases too
DROP POLICY IF EXISTS "Labels can delete tracks for their draft/pending releases" ON public.tracks;
DROP POLICY IF EXISTS "Artists can delete tracks for their draft or pending releases" ON public.tracks;

CREATE POLICY "Labels can delete tracks for editable releases"
ON public.tracks FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'label'::app_role) AND release_id IN (
  SELECT id FROM public.releases
  WHERE label_id = auth.uid() AND status = ANY (ARRAY['draft','pending','active'])
));

CREATE POLICY "Artists can delete tracks for their editable releases"
ON public.tracks FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'artist'::app_role) AND release_id IN (
  SELECT id FROM public.releases
  WHERE artist_user_id = auth.uid() AND status = ANY (ARRAY['draft','pending','active'])
));
