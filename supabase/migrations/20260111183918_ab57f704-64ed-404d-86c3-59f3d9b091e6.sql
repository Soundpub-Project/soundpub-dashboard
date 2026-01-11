-- Add light/dark theme logo columns to profiles for labels
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS logo_url_light text,
ADD COLUMN IF NOT EXISTS logo_url_dark text;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.logo_url_light IS 'Logo URL for light theme';
COMMENT ON COLUMN public.profiles.logo_url_dark IS 'Logo URL for dark theme';