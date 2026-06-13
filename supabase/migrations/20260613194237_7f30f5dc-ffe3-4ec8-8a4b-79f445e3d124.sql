
-- 1) Notifications: prevent non-admins from inserting global notifications
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid())
  OR (user_id = auth.uid() AND COALESCE(is_global, false) = false)
);

-- 2) Storage: drop legacy, role-only policies on track-audio / track-video.
-- Owner+admin-scoped policies (already in place) remain the only access path.
DROP POLICY IF EXISTS "Labels can delete their own audio files" ON storage.objects;
DROP POLICY IF EXISTS "Labels can delete their own video files" ON storage.objects;
DROP POLICY IF EXISTS "Labels can view audio for their releases" ON storage.objects;
DROP POLICY IF EXISTS "Labels can view video for their releases" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can view track audio" ON storage.objects;
DROP POLICY IF EXISTS "Whitelabels can view track video" ON storage.objects;

-- 3) Revoke EXECUTE on internal trigger functions from anon/PUBLIC.
-- These are trigger functions and must never be invoked directly via the Data API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_balance_on_payout_status_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_timestamp() FROM anon, PUBLIC;
