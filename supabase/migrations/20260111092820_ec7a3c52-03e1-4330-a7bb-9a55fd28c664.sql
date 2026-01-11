-- Drop existing policy that prevents labels from removing artists
DROP POLICY IF EXISTS "Labels can update their artists" ON public.profiles;

-- Create new policy that allows labels to update their artists
-- The USING clause checks the OLD row (before update)
-- The WITH CHECK clause should allow setting parent_label_id to NULL (removing from label)
CREATE POLICY "Labels can update their artists"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'label'::app_role) 
  AND parent_label_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'label'::app_role) 
  AND (parent_label_id = auth.uid() OR parent_label_id IS NULL)
);