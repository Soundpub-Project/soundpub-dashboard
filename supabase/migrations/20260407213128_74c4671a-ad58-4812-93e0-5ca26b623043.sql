
-- Create release_payments table
CREATE TABLE public.release_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR',
  track_count INTEGER NOT NULL DEFAULT 1,
  price_per_track NUMERIC(18,2) NOT NULL DEFAULT 50000,
  xendit_invoice_id TEXT,
  xendit_invoice_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for lookups
CREATE INDEX idx_release_payments_release_id ON public.release_payments(release_id);
CREATE INDEX idx_release_payments_user_id ON public.release_payments(user_id);
CREATE INDEX idx_release_payments_status ON public.release_payments(status);
CREATE INDEX idx_release_payments_xendit_invoice_id ON public.release_payments(xendit_invoice_id);

-- Enable RLS
ALTER TABLE public.release_payments ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own payments
CREATE POLICY "Users can view their own payments"
ON public.release_payments FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- RLS: Users can insert their own payments
CREATE POLICY "Users can insert their own payments"
ON public.release_payments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- RLS: Admins can manage all payments
CREATE POLICY "Admins can manage all payments"
ON public.release_payments FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

-- RLS: Service role can update payments (for webhook)
CREATE POLICY "Service role can update payments"
ON public.release_payments FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Timestamp trigger
CREATE TRIGGER update_release_payments_timestamp
  BEFORE UPDATE ON public.release_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- Add pricing config to app_settings
INSERT INTO public.app_settings (key, value) VALUES ('release_price_per_track', '50000')
ON CONFLICT (key) DO NOTHING;
