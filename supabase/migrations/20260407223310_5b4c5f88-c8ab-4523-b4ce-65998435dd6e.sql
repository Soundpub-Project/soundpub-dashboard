
-- Notifications table for in-dashboard notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_global BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications and global ones
CREATE POLICY "Users can view own and global notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_global = true);

-- Users can update (mark read) their own notifications
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR is_global = true);

-- Admins can manage all notifications
CREATE POLICY "Admins can manage all notifications"
  ON public.notifications FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Service role can insert notifications
CREATE POLICY "Service can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add pricing mode settings
INSERT INTO app_settings (key, value) VALUES ('release_pricing_mode', 'per_track') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('release_price_single', '50000') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('release_price_ep', '150000') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('release_price_album', '300000') ON CONFLICT (key) DO NOTHING;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
