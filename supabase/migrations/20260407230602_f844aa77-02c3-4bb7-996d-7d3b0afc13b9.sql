-- Fix: Add 'pending_paid' to releases_status_check constraint
ALTER TABLE public.releases DROP CONSTRAINT IF EXISTS releases_status_check;
ALTER TABLE public.releases ADD CONSTRAINT releases_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'rejected'::text, 'draft'::text, 'inactive'::text, 'pending_paid'::text]));