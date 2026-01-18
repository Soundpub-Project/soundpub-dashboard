-- ========================================
-- 1. Create composer_royalties table for Copyright role
-- ========================================
CREATE TABLE IF NOT EXISTS public.composer_royalties (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    composer_id TEXT NOT NULL,
    composer_name TEXT NOT NULL,
    total_net_royalti NUMERIC(18,2) NOT NULL DEFAULT 0,
    period TEXT,
    upload_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.composer_royalties ENABLE ROW LEVEL SECURITY;

-- RLS Policies for composer_royalties
CREATE POLICY "Admins can manage all composer royalties" 
ON public.composer_royalties 
FOR ALL 
USING (is_admin(auth.uid()));

CREATE POLICY "Copyright users can view their composer royalties" 
ON public.composer_royalties 
FOR SELECT 
USING (has_role(auth.uid(), 'copyright'::app_role) AND composer_id = auth.uid()::text);

-- Trigger for updated_at
CREATE TRIGGER update_composer_royalties_timestamp
    BEFORE UPDATE ON public.composer_royalties
    FOR EACH ROW
    EXECUTE FUNCTION public.update_timestamp();

-- ========================================
-- 2. Add columns to profiles table for White Label features
-- ========================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_set BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_upgraded_at TIMESTAMP WITH TIME ZONE;

-- ========================================
-- 3. Create function to check if user is whitelabel
-- ========================================
CREATE OR REPLACE FUNCTION public.is_whitelabel(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'whitelabel'
  )
$$;

-- ========================================
-- 4. Update handle_new_user function for whitelabel artists
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, password_set)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data ->> 'password_set')::boolean, true)
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- ========================================
-- 5. Add RLS for whitelabel to manage their artists
-- ========================================
CREATE POLICY "Whitelabels can view their artists" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND parent_label_id = auth.uid());

CREATE POLICY "Whitelabels can update their artists" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND parent_label_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'whitelabel'::app_role) AND (parent_label_id = auth.uid() OR parent_label_id IS NULL));

-- ========================================
-- 6. Add RLS for whitelabel on releases and tracks
-- ========================================
CREATE POLICY "Whitelabels can manage their releases" 
ON public.releases 
FOR ALL 
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid());

CREATE POLICY "Whitelabels can manage tracks for their releases" 
ON public.tracks 
FOR ALL 
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()))
WITH CHECK (has_role(auth.uid(), 'whitelabel'::app_role) AND release_id IN (SELECT id FROM releases WHERE label_id = auth.uid()));

-- ========================================
-- 7. Add RLS for whitelabel on artists table
-- ========================================
CREATE POLICY "Whitelabels can manage their own artists" 
ON public.artists 
FOR ALL 
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'whitelabel'::app_role) AND label_id = auth.uid());

-- ========================================
-- 8. Add GCS and GA settings to app_settings
-- ========================================
INSERT INTO public.app_settings (key, value)
VALUES 
  ('gcs_bucket_name', NULL),
  ('gcs_project_id', NULL),
  ('ga4_measurement_id', NULL),
  ('storage_provider', 'supabase')
ON CONFLICT (key) DO NOTHING;

-- ========================================
-- 9. Add RLS for whitelabel to view royalties
-- ========================================
CREATE POLICY "Whitelabels can view royalties for their artists" 
ON public.royalties 
FOR SELECT 
USING (has_role(auth.uid(), 'whitelabel'::app_role) AND label_name = get_user_full_name(auth.uid()));