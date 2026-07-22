-- =============================================
-- NOTIFICATIONS TABLE MIGRATION
-- Create notifications table in public schema
-- Purpose: Store user notifications and announcements
-- =============================================

-- 1. CREATE NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'announcement')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    is_global BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 3. CREATE RLS POLICIES
CREATE POLICY "Users can view own and global notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_global = true);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can manage all notifications"
ON public.notifications FOR ALL
TO authenticated
USING (
    CASE 
        WHEN auth.uid() IN (SELECT user_id FROM soundpub.user_roles WHERE role = 'admin' OR role = 'superadmin')
        THEN true
        ELSE false
    END
);

-- 4. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_is_global ON public.notifications(is_global);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- 5. CREATE TRIGGER FOR AUTOMATIC TIMESTAMPS
CREATE OR REPLACE FUNCTION public.update_notifications_timestamp()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.created_at = COALESCE(NEW.created_at, now());
    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

CREATE TRIGGER update_notifications_timestamp
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.update_notifications_timestamp();

-- =============================================
-- SUMMARY
-- =============================================
-- Table: public.notifications
-- Columns: 11
-- Indexes: 5
-- RLS Policies: 4
-- Triggers: 1
