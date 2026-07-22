-- Fix artists table RLS policy (PUBLIC_DATA_EXPOSURE)
-- Drop overly permissive policy
DROP POLICY IF EXISTS "Users can view artists" ON public.artists;

-- Create restrictive policy: only admins, owner labels, and the artists themselves can view
CREATE POLICY "Admins, labels and associated artists can view artists"
ON public.artists FOR SELECT
TO authenticated
USING (
  -- Admins can view all
  public.is_admin(auth.uid())
  -- Labels can view their own artists
  OR label_id = auth.uid()
  -- Artists can view their own record (matching by parent_label_id relationship)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.parent_label_id = artists.label_id
    AND public.has_role(auth.uid(), 'artist'::app_role)
  )
);

-- Fix release-covers bucket: make private and require authentication (STORAGE_EXPOSURE)
-- Update bucket to private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'release-covers';

-- Drop the overly permissive public view policy
DROP POLICY IF EXISTS "Anyone can view release covers" ON storage.objects;

-- Create policy requiring authentication to view covers
CREATE POLICY "Authenticated users can view release covers"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'release-covers');
