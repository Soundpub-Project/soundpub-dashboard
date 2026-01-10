-- Drop existing policies for releases
DROP POLICY IF EXISTS "Admins can manage all releases" ON public.releases;
DROP POLICY IF EXISTS "Labels can manage their releases" ON public.releases;
DROP POLICY IF EXISTS "Artists can view their releases" ON public.releases;

-- Recreate policies with proper permissions
-- Admin can do everything
CREATE POLICY "Admins can manage all releases" 
ON public.releases 
FOR ALL 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Labels can manage their own releases
CREATE POLICY "Labels can manage their releases" 
ON public.releases 
FOR ALL 
USING (has_role(auth.uid(), 'label'::app_role) AND label_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'label'::app_role) AND label_id = auth.uid());

-- Artists can view releases where they are the artist
CREATE POLICY "Artists can view their releases" 
ON public.releases 
FOR SELECT 
USING (has_role(auth.uid(), 'artist'::app_role) AND artist_name = get_user_full_name(auth.uid()));

-- Also update tracks policies to ensure admin can manage
DROP POLICY IF EXISTS "Admins can manage all tracks" ON public.tracks;
DROP POLICY IF EXISTS "Labels can manage tracks for their releases" ON public.tracks;
DROP POLICY IF EXISTS "Artists can view their tracks" ON public.tracks;

CREATE POLICY "Admins can manage all tracks" 
ON public.tracks 
FOR ALL 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Labels can manage tracks for their releases" 
ON public.tracks 
FOR ALL 
USING (has_role(auth.uid(), 'label'::app_role) AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()))
WITH CHECK (has_role(auth.uid(), 'label'::app_role) AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()));

CREATE POLICY "Artists can view their tracks" 
ON public.tracks 
FOR SELECT 
USING (has_role(auth.uid(), 'artist'::app_role) AND artist_name = get_user_full_name(auth.uid()));