
-- 1. RLS policies for artists to INSERT/UPDATE releases
CREATE POLICY "Artists can insert their releases"
ON public.releases
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role)
  AND label_id = get_user_parent_label_id(auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "Artists can update their pending releases"
ON public.releases
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role)
  AND (artist_user_id = auth.uid() OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid())))
  AND status = 'pending'
)
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role)
  AND (artist_user_id = auth.uid() OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid())))
  AND status = 'pending'
);

-- 2. RLS policies for artists to INSERT/UPDATE tracks
CREATE POLICY "Artists can insert tracks for their releases"
ON public.tracks
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role)
  AND release_id IN (
    SELECT id FROM releases
    WHERE (artist_user_id = auth.uid() OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid())))
    AND label_id = get_user_parent_label_id(auth.uid())
  )
);

CREATE POLICY "Artists can update tracks for their pending releases"
ON public.tracks
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'artist'::app_role)
  AND release_id IN (
    SELECT id FROM releases
    WHERE (artist_user_id = auth.uid() OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid())))
    AND status = 'pending'
  )
)
WITH CHECK (
  has_role(auth.uid(), 'artist'::app_role)
  AND release_id IN (
    SELECT id FROM releases
    WHERE (artist_user_id = auth.uid() OR (artist_user_id IS NULL AND artist_name = get_user_full_name(auth.uid())))
    AND status = 'pending'
  )
);
