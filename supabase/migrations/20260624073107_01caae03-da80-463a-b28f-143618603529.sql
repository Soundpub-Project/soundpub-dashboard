
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notif_payout boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_release boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_payment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_notif_announcement boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  status text NOT NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_send_log TO authenticated;
GRANT ALL ON public.email_send_log TO service_role;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email send log"
ON public.email_send_log FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at
  ON public.email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_template
  ON public.email_send_log (template_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_idem
  ON public.email_send_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Storage policies: add 'artist' role to track-audio, audio-clips, release-covers
DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update track-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from track-audio" ON storage.objects;

CREATE POLICY "Roles can upload to track-audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'track-audio'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);
CREATE POLICY "Roles can update track-audio"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'track-audio'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);
CREATE POLICY "Roles can delete track-audio"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'track-audio'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update audio-clips" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from audio-clips" ON storage.objects;

CREATE POLICY "Roles can upload to audio-clips"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audio-clips'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);
CREATE POLICY "Roles can update audio-clips"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'audio-clips'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);
CREATE POLICY "Roles can delete audio-clips"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'audio-clips'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated users with proper roles can upload to release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can update release-covers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users with proper roles can delete from release-covers" ON storage.objects;

CREATE POLICY "Roles can upload to release-covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'release-covers'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);
CREATE POLICY "Roles can update release-covers"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'release-covers'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);
CREATE POLICY "Roles can delete release-covers"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'release-covers'
  AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'label'::public.app_role)
    OR public.has_role(auth.uid(), 'whitelabel'::public.app_role)
    OR public.has_role(auth.uid(), 'artist'::public.app_role)
  )
);
