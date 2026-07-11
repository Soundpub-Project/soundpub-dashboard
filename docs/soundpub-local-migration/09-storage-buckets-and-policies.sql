-- =============================================
-- SOUNDPUB STORAGE BUCKETS AND POLICIES PATCH
-- Run after 01-reset/04-runtime when upload/download storage gets 400/403.
-- This only touches Storage buckets/policies used by SoundPub.
-- =============================================

-- Buckets used by the frontend.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]),
  ('label-logos', 'label-logos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']::text[]),
  ('iccn-gallery', 'iccn-gallery', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]),
  ('release-covers', 'release-covers', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]),
  ('track-audio', 'track-audio', false, 2147483648, ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/flac','audio/aac','audio/mp4','audio/ogg']::text[]),
  ('track-video', 'track-video', false, 2147483648, ARRAY['video/mp4','video/quicktime','video/webm']::text[]),
  ('audio-clips', 'audio-clips', true, 52428800, ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Remove only local SoundPub storage patch policies so this file can be re-run.
DROP POLICY IF EXISTS "SoundPub public read public buckets" ON storage.objects;
DROP POLICY IF EXISTS "SoundPub authenticated read private buckets" ON storage.objects;
DROP POLICY IF EXISTS "SoundPub authenticated upload buckets" ON storage.objects;
DROP POLICY IF EXISTS "SoundPub authenticated update buckets" ON storage.objects;
DROP POLICY IF EXISTS "SoundPub authenticated delete buckets" ON storage.objects;
DROP POLICY IF EXISTS "SoundPub service role manage buckets" ON storage.objects;

-- Public buckets can be viewed without login.
CREATE POLICY "SoundPub public read public buckets"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'audio-clips'));

-- Private buckets can be viewed by logged-in users. The app also creates signed URLs for these.
CREATE POLICY "SoundPub authenticated read private buckets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id IN ('release-covers', 'track-audio', 'track-video'));

-- During local migration/debug, allow logged-in users to upload to SoundPub buckets.
CREATE POLICY "SoundPub authenticated upload buckets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips'));

CREATE POLICY "SoundPub authenticated update buckets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips'))
WITH CHECK (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips'));

CREATE POLICY "SoundPub authenticated delete buckets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips'));

-- Service role/import tools may need full access.
CREATE POLICY "SoundPub service role manage buckets"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips'))
WITH CHECK (bucket_id IN ('avatars', 'label-logos', 'iccn-gallery', 'release-covers', 'track-audio', 'track-video', 'audio-clips'));

