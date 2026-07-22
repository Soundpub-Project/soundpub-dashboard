
-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;

-- More restrictive: users can insert for themselves, admins for anyone
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin(auth.uid()));
