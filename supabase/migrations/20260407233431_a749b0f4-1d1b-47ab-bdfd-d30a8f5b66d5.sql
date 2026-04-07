
-- Add DELETE policy for notifications (admins can delete)
CREATE POLICY "Admins can delete notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- Add 'min_payout_amount' to app_settings if not exists
INSERT INTO public.app_settings (key, value) VALUES ('min_payout_amount', '50000')
ON CONFLICT (key) DO NOTHING;

-- Update releases_status_check to include 'refunded' related statuses
ALTER TABLE public.releases DROP CONSTRAINT IF EXISTS releases_status_check;
ALTER TABLE public.releases ADD CONSTRAINT releases_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'rejected'::text, 'draft'::text, 'inactive'::text, 'pending_paid'::text]));

-- Allow admins to delete release_payments
CREATE POLICY "Admins can delete payments"
ON public.release_payments
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));
