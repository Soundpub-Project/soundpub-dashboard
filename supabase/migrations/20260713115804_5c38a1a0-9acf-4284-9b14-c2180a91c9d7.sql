
-- app_settings: restrict public read to logo/favicon keys only
DROP POLICY IF EXISTS "Anyone can view app settings" ON public.app_settings;

CREATE POLICY "Anon can view branding settings"
ON public.app_settings
FOR SELECT
TO anon
USING (key IN ('dashboard_logo', 'dashboard_logo_light', 'dashboard_logo_dark', 'favicon'));

CREATE POLICY "Authenticated can view app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

-- email_send_log: add explicit user-scoped read so recipients can see their own log entries
CREATE POLICY "Users can view their own email logs"
ON public.email_send_log
FOR SELECT
TO authenticated
USING (recipient_email = (SELECT email FROM public.profiles WHERE id = auth.uid()));
