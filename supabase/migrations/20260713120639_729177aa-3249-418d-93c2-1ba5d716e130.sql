
-- Drop broad ALL policies on releases for label and whitelabel roles
DROP POLICY IF EXISTS "Labels can manage their releases" ON public.releases;
DROP POLICY IF EXISTS "Whitelabels can manage their releases" ON public.releases;

-- Labels: split into per-command policies with a restricted UPDATE
CREATE POLICY "Labels can view their releases"
ON public.releases
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'label'::app_role) AND label_id = auth.uid());

CREATE POLICY "Labels can insert their releases"
ON public.releases
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'label'::app_role) AND label_id = auth.uid());

CREATE POLICY "Labels can delete their releases"
ON public.releases
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'label'::app_role) AND label_id = auth.uid());

CREATE POLICY "Labels can update draft/pending releases"
ON public.releases
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'label'::app_role) AND label_id = auth.uid())
WITH CHECK (
  has_role(auth.uid(), 'label'::app_role)
  AND label_id = auth.uid()
  AND status = ANY (ARRAY['pending'::text, 'draft'::text])
);

-- Whitelabels: same split
CREATE POLICY "Whitelabels can view their releases"
ON public.releases
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid());

CREATE POLICY "Whitelabels can insert their releases"
ON public.releases
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid());

CREATE POLICY "Whitelabels can delete their releases"
ON public.releases
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid());

CREATE POLICY "Whitelabels can update draft/pending releases"
ON public.releases
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid())
WITH CHECK (
  has_role(auth.uid(), 'whitelabel'::app_role)
  AND label_id = auth.uid()
  AND status = ANY (ARRAY['pending'::text, 'draft'::text])
);
