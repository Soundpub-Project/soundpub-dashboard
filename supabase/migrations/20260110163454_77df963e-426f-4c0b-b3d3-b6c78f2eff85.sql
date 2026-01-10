-- Allow Labels to update their artists' profiles
CREATE POLICY "Labels can update their artists"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'label'::app_role) AND (parent_label_id = auth.uid()))
WITH CHECK (has_role(auth.uid(), 'label'::app_role) AND (parent_label_id = auth.uid()));