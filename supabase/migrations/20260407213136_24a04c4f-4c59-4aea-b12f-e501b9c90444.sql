
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can update payments" ON public.release_payments;
