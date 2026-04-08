
-- Insert default ICCN settings
INSERT INTO public.app_settings (key, value)
VALUES 
  ('iccn_service_desc', NULL),
  ('iccn_service_photos', '[]')
ON CONFLICT (key) DO NOTHING;

-- Create public bucket for ICCN gallery photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('iccn-gallery', 'iccn-gallery', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "ICCN gallery photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'iccn-gallery');

-- Admin upload
CREATE POLICY "Admins can upload ICCN gallery photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'iccn-gallery' AND public.is_admin(auth.uid()));

-- Admin update
CREATE POLICY "Admins can update ICCN gallery photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'iccn-gallery' AND public.is_admin(auth.uid()));

-- Admin delete
CREATE POLICY "Admins can delete ICCN gallery photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'iccn-gallery' AND public.is_admin(auth.uid()));
