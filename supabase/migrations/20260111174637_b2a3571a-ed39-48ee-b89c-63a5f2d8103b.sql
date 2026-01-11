-- Create app_settings table for global settings (logo, GA4, etc)
CREATE TABLE public.app_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text UNIQUE NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only superadmins can manage global settings
CREATE POLICY "Superadmins can manage app settings"
ON public.app_settings
FOR ALL
USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Everyone can view public settings (like logo, GA4 ID)
CREATE POLICY "Anyone can view app settings"
ON public.app_settings
FOR SELECT
USING (true);

-- Add logo_url column to profiles for label logos
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS logo_url text;

-- Insert default settings
INSERT INTO public.app_settings (key, value) VALUES
('dashboard_logo', null),
('ga4_enabled', 'false'),
('gcs_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_timestamp();