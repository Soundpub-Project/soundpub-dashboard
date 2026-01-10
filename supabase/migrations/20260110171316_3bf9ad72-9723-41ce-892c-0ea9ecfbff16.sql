-- Create storage bucket for audio files (full audio WAV/FLAC 120s+)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('track-audio', 'track-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for video files (music videos MP4 120s+)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('track-video', 'track-video', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for audio clips (preview 30-60s)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio-clips', 'audio-clips', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for track-audio bucket
CREATE POLICY "Admins can manage all audio files"
ON storage.objects FOR ALL
USING (bucket_id = 'track-audio' AND is_admin(auth.uid()))
WITH CHECK (bucket_id = 'track-audio' AND is_admin(auth.uid()));

CREATE POLICY "Labels can upload audio for their releases"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'track-audio' 
  AND has_role(auth.uid(), 'label'::app_role)
);

CREATE POLICY "Labels can view audio for their releases"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'track-audio' 
  AND (
    is_admin(auth.uid()) 
    OR has_role(auth.uid(), 'label'::app_role)
  )
);

CREATE POLICY "Labels can delete their own audio files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'track-audio' 
  AND has_role(auth.uid(), 'label'::app_role)
);

-- RLS policies for track-video bucket
CREATE POLICY "Admins can manage all video files"
ON storage.objects FOR ALL
USING (bucket_id = 'track-video' AND is_admin(auth.uid()))
WITH CHECK (bucket_id = 'track-video' AND is_admin(auth.uid()));

CREATE POLICY "Labels can upload video for their releases"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'track-video' 
  AND has_role(auth.uid(), 'label'::app_role)
);

CREATE POLICY "Labels can view video for their releases"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'track-video' 
  AND (
    is_admin(auth.uid()) 
    OR has_role(auth.uid(), 'label'::app_role)
  )
);

CREATE POLICY "Labels can delete their own video files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'track-video' 
  AND has_role(auth.uid(), 'label'::app_role)
);

-- RLS policies for audio-clips bucket (public for playback)
CREATE POLICY "Admins can manage all audio clips"
ON storage.objects FOR ALL
USING (bucket_id = 'audio-clips' AND is_admin(auth.uid()))
WITH CHECK (bucket_id = 'audio-clips' AND is_admin(auth.uid()));

CREATE POLICY "Labels can upload audio clips"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'audio-clips' 
  AND has_role(auth.uid(), 'label'::app_role)
);

CREATE POLICY "Anyone can view audio clips"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-clips');

CREATE POLICY "Labels can delete their own audio clips"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'audio-clips' 
  AND has_role(auth.uid(), 'label'::app_role)
);

-- Add columns to tracks table for media files
ALTER TABLE public.tracks
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS clip_url text;

-- Add archived status support to releases
ALTER TABLE public.releases 
ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;