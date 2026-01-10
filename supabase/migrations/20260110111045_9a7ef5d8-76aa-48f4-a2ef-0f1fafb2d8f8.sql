-- Create storage bucket for release covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('release-covers', 'release-covers', true);

-- Create policies for release covers bucket
CREATE POLICY "Anyone can view release covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'release-covers');

CREATE POLICY "Admins and labels can upload release covers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'release-covers' 
  AND (
    is_admin(auth.uid()) 
    OR has_role(auth.uid(), 'label'::app_role)
  )
);

CREATE POLICY "Admins and labels can update release covers"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'release-covers' 
  AND (
    is_admin(auth.uid()) 
    OR has_role(auth.uid(), 'label'::app_role)
  )
);

CREATE POLICY "Admins and labels can delete release covers"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'release-covers' 
  AND (
    is_admin(auth.uid()) 
    OR has_role(auth.uid(), 'label'::app_role)
  )
);