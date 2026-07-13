
-- #1 tracks: split label/whitelabel ALL policy so mutations require release status draft/pending
DROP POLICY IF EXISTS "Labels can manage tracks for their releases" ON public.tracks;
DROP POLICY IF EXISTS "Whitelabels can manage tracks for their releases" ON public.tracks;

CREATE POLICY "Labels can view tracks for their releases"
ON public.tracks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'label'::app_role)
  AND release_id IN (SELECT id FROM public.releases WHERE label_id = auth.uid())
);

CREATE POLICY "Labels can insert tracks for their draft/pending releases"
ON public.tracks FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'label'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE label_id = auth.uid() AND status IN ('draft','pending')
  )
);

CREATE POLICY "Labels can update tracks for their draft/pending releases"
ON public.tracks FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'label'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE label_id = auth.uid() AND status IN ('draft','pending')
  )
)
WITH CHECK (
  has_role(auth.uid(), 'label'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE label_id = auth.uid() AND status IN ('draft','pending')
  )
);

CREATE POLICY "Labels can delete tracks for their draft/pending releases"
ON public.tracks FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'label'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE label_id = auth.uid() AND status IN ('draft','pending')
  )
);

CREATE POLICY "Whitelabels can view tracks for their releases"
ON public.tracks FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'whitelabel'::app_role)
  AND release_id IN (SELECT id FROM public.releases WHERE label_id = auth.uid())
);

CREATE POLICY "Whitelabels can insert tracks for their draft/pending releases"
ON public.tracks FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'whitelabel'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE label_id = auth.uid() AND status IN ('draft','pending')
  )
);

CREATE POLICY "Whitelabels can update tracks for their draft/pending releases"
ON public.tracks FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'whitelabel'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE label_id = auth.uid() AND status IN ('draft','pending')
  )
)
WITH CHECK (
  has_role(auth.uid(), 'whitelabel'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE label_id = auth.uid() AND status IN ('draft','pending')
  )
);

CREATE POLICY "Whitelabels can delete tracks for their draft/pending releases"
ON public.tracks FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'whitelabel'::app_role)
  AND release_id IN (
    SELECT id FROM public.releases
    WHERE label_id = auth.uid() AND status IN ('draft','pending')
  )
);

-- #2 releases: lock label/whitelabel DELETE to draft/pending only
DROP POLICY IF EXISTS "Labels can delete their releases" ON public.releases;
DROP POLICY IF EXISTS "Whitelabels can delete their releases" ON public.releases;

CREATE POLICY "Labels can delete their draft/pending releases"
ON public.releases FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'label'::app_role)
  AND label_id = auth.uid()
  AND status IN ('draft','pending')
);

CREATE POLICY "Whitelabels can delete their draft/pending releases"
ON public.releases FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'whitelabel'::app_role)
  AND label_id = auth.uid()
  AND status IN ('draft','pending')
);

-- #3 app_settings: restrict authenticated SELECT to a whitelist of safe key prefixes
DROP POLICY IF EXISTS "Authenticated can view app settings" ON public.app_settings;

CREATE POLICY "Authenticated can view safe app settings"
ON public.app_settings FOR SELECT TO authenticated
USING (
  key LIKE 'pricing_%'
  OR key LIKE 'branding_%'
  OR key LIKE 'dashboard_%'
  OR key IN ('favicon','dashboard_logo','dashboard_logo_light','dashboard_logo_dark')
);
