-- Drop old restrictive policy for copyright users
DROP POLICY IF EXISTS "Copyright users can view their composer royalties" ON public.composer_royalties;

-- Create new policy that allows copyright users to view all composer royalties
-- The actual filtering by name/code is done client-side for flexibility
CREATE POLICY "Copyright users can view composer royalties"
ON public.composer_royalties
FOR SELECT
USING (
  has_role(auth.uid(), 'copyright'::app_role)
);