-- Create storage bucket for label logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('label-logos', 'label-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for label-logos bucket
CREATE POLICY "Anyone can view label logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'label-logos');

CREATE POLICY "Authenticated users can upload their own label logo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'label-logos' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update their own label logo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'label-logos' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete their own label logo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'label-logos' 
  AND auth.role() = 'authenticated'
);