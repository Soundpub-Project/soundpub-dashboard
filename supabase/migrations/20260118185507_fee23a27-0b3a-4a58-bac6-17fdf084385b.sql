-- Allow artists to view their parent label's profile
CREATE POLICY "Artists can view their parent label profile"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'artist'::app_role) 
  AND id = (
    SELECT parent_label_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Also allow users to see profiles of labels that own their releases
CREATE POLICY "Users can view label profiles for their releases"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.label_id = profiles.id
    AND (
      -- Admin can see all
      is_admin(auth.uid())
      -- Label/Whitelabel can see their own
      OR r.label_id = auth.uid()
      -- Artist can see labels of their releases
      OR (has_role(auth.uid(), 'artist'::app_role) AND r.artist_name = get_user_full_name(auth.uid()))
    )
  )
);