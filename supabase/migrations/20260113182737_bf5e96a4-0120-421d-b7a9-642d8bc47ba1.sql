-- Add revenue tracking columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS label_revenue numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS artist_revenue numeric NOT NULL DEFAULT 0;

-- Add comments
COMMENT ON COLUMN public.profiles.label_revenue IS 'Revenue earned by the label (30% of artist earnings for whitelabel, or 30% for Soundpub Music)';
COMMENT ON COLUMN public.profiles.artist_revenue IS 'Revenue earned by artists under this label';