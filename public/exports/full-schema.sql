-- =====================================================
-- SOUNDPUB DATABASE SCHEMA - FULL EXPORT
-- For migration to external Supabase project
-- Generated: 2026-01-13
-- =====================================================

-- =====================================================
-- STEP 1: CREATE ENUM TYPES
-- =====================================================
CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'label', 'artist', 'user');

-- =====================================================
-- STEP 2: CREATE TABLES
-- =====================================================

-- 2.1 Profiles Table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  logo_url_light TEXT,
  logo_url_dark TEXT,
  parent_label_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

-- 2.2 User Roles Table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2.3 Artists Table (Legacy - optional, can be removed if using profiles.parent_label_id)
CREATE TABLE public.artists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  label_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2.4 Releases Table
CREATE TABLE public.releases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  label_id UUID NOT NULL,
  upc TEXT,
  release_date DATE,
  cover_url TEXT,
  genre TEXT,
  release_type TEXT DEFAULT 'single',
  status TEXT NOT NULL DEFAULT 'pending',
  archived_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2.5 Tracks Table
CREATE TABLE public.tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  isrc TEXT,
  genre TEXT,
  composer TEXT,
  lyricist TEXT,
  lyrics TEXT,
  explicit_lyrics BOOLEAN DEFAULT false,
  artists JSONB DEFAULT '[]'::jsonb,
  contributors JSONB DEFAULT '[]'::jsonb,
  audio_url TEXT,
  video_url TEXT,
  clip_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2.6 Royalty Uploads Table
CREATE TABLE public.royalty_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  status TEXT NOT NULL,
  total_records INTEGER NOT NULL DEFAULT 0,
  inserted_records INTEGER NOT NULL DEFAULT 0,
  summary JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2.7 Royalties Table
CREATE TABLE public.royalties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID NOT NULL REFERENCES public.royalty_uploads(id) ON DELETE CASCADE,
  isrc TEXT NOT NULL,
  upc TEXT NOT NULL,
  title TEXT,
  artist TEXT,
  artist_name TEXT NOT NULL,
  label_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  country TEXT NOT NULL,
  period TEXT NOT NULL,
  unit_penjualan INTEGER NOT NULL DEFAULT 0,
  pendapatan_label_artis NUMERIC(18,2) NOT NULL DEFAULT 0,
  pendapatan_bersih_soundpub NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2.8 Payout Requests Table
CREATE TABLE public.payout_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT amount_positive CHECK (amount > 0)
);

-- 2.9 App Settings Table
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2.10 Audit Logs Table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =====================================================
-- STEP 3: CREATE INDEXES
-- =====================================================
CREATE INDEX idx_profiles_parent_label ON public.profiles(parent_label_id);
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
CREATE INDEX idx_releases_label_id ON public.releases(label_id);
CREATE INDEX idx_releases_artist_name ON public.releases(artist_name);
CREATE INDEX idx_releases_status ON public.releases(status);
CREATE INDEX idx_tracks_release_id ON public.tracks(release_id);
CREATE INDEX idx_tracks_isrc ON public.tracks(isrc);
CREATE INDEX idx_royalties_upload_id ON public.royalties(upload_id);
CREATE INDEX idx_royalties_isrc ON public.royalties(isrc);
CREATE INDEX idx_royalties_label_name ON public.royalties(label_name);
CREATE INDEX idx_royalties_artist_name ON public.royalties(artist_name);
CREATE INDEX idx_royalties_period ON public.royalties(period);
CREATE INDEX idx_payout_requests_user_id ON public.payout_requests(user_id);
CREATE INDEX idx_payout_requests_status ON public.payout_requests(status);
CREATE INDEX idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_target_id ON public.audit_logs(target_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- =====================================================
-- STEP 4: CREATE SECURITY DEFINER FUNCTIONS
-- =====================================================

-- 4.1 Check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4.2 Check if user is admin (superadmin or admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin', 'admin')
  )
$$;

-- 4.3 Get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 4.4 Get user full name
CREATE OR REPLACE FUNCTION public.get_user_full_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT full_name FROM public.profiles
  WHERE id = _user_id
$$;

-- 4.5 Update timestamp function
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 4.6 Handle new user signup (auto-create profile and role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- 4.7 Payout balance update trigger function
CREATE OR REPLACE FUNCTION public.update_balance_on_payout_status_change()
RETURNS TRIGGER AS $$
DECLARE
  current_balance DECIMAL(18,2);
  caller_is_admin BOOLEAN;
BEGIN
    -- Check if the caller is an admin
    caller_is_admin := public.is_admin(auth.uid());
    
    -- Handle transition TO 'paid' status
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        -- CRITICAL: Only admins can mark payouts as paid
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can mark payouts as paid';
        END IF;
        
        -- Validate amount is positive
        IF NEW.amount <= 0 THEN
            RAISE EXCEPTION 'Payout amount must be positive';
        END IF;
        
        -- Check current balance with row-level locking to prevent race conditions
        SELECT balance INTO current_balance
        FROM public.profiles
        WHERE id = NEW.user_id
        FOR UPDATE;
        
        -- Validate sufficient balance
        IF current_balance IS NULL THEN
            RAISE EXCEPTION 'User profile not found';
        END IF;
        
        IF current_balance < NEW.amount THEN
            RAISE EXCEPTION 'Insufficient balance: user has %, requested %', 
              current_balance, NEW.amount;
        END IF;
        
        -- Update balance atomically
        UPDATE public.profiles
        SET balance = balance - NEW.amount
        WHERE id = NEW.user_id AND balance >= NEW.amount;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Failed to update balance - concurrent modification or insufficient funds';
        END IF;
        
        -- Set processed_by and processed_at
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
        
    -- Handle payout reversions (FROM 'paid' to another status)
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        -- Only admins can revert paid payouts
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can revert paid payouts';
        END IF;
        
        -- Refund the balance
        UPDATE public.profiles
        SET balance = balance + NEW.amount
        WHERE id = NEW.user_id;
        
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
        
    -- Handle approval/rejection (status changes to 'approved' or 'rejected')
    ELSIF NEW.status IN ('approved', 'rejected') AND 
          (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'rejected', 'paid')) THEN
        -- Only admins can approve/reject
        IF NOT caller_is_admin THEN
            RAISE EXCEPTION 'Only administrators can approve or reject payouts';
        END IF;
        
        NEW.processed_by := auth.uid();
        NEW.processed_at := NOW();
    END IF;

    -- Update timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- STEP 5: CREATE TRIGGERS
-- =====================================================

-- 5.1 Auto-create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5.2 Update timestamps
CREATE TRIGGER update_profiles_timestamp
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_releases_timestamp
  BEFORE UPDATE ON public.releases
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_tracks_timestamp
  BEFORE UPDATE ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_royalty_uploads_timestamp
  BEFORE UPDATE ON public.royalty_uploads
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_app_settings_timestamp
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- 5.3 Payout balance management
CREATE TRIGGER on_payout_status_change
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_balance_on_payout_status_change();

-- =====================================================
-- STEP 6: ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 7: CREATE RLS POLICIES
-- =====================================================

-- 7.1 PROFILES POLICIES
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Labels can view their artists" ON public.profiles
  FOR SELECT USING (has_role(auth.uid(), 'label') AND parent_label_id = auth.uid());

CREATE POLICY "Labels can update their artists" ON public.profiles
  FOR UPDATE 
  USING (has_role(auth.uid(), 'label') AND parent_label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'label') AND (parent_label_id = auth.uid() OR parent_label_id IS NULL));

-- 7.2 USER_ROLES POLICIES
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (is_admin(auth.uid()));

-- 7.3 ARTISTS POLICIES
CREATE POLICY "Users can view artists" ON public.artists
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage all artists" ON public.artists
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Labels can manage their own artists" ON public.artists
  FOR ALL 
  USING (label_id = auth.uid())
  WITH CHECK (label_id = auth.uid());

-- 7.4 RELEASES POLICIES
CREATE POLICY "Admins can manage all releases" ON public.releases
  FOR ALL 
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Labels can manage their releases" ON public.releases
  FOR ALL 
  USING (has_role(auth.uid(), 'label') AND label_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'label') AND label_id = auth.uid());

CREATE POLICY "Artists can view their releases" ON public.releases
  FOR SELECT 
  USING (has_role(auth.uid(), 'artist') AND artist_name = get_user_full_name(auth.uid()));

-- 7.5 TRACKS POLICIES
CREATE POLICY "Admins can manage all tracks" ON public.tracks
  FOR ALL 
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Labels can manage tracks for their releases" ON public.tracks
  FOR ALL 
  USING (has_role(auth.uid(), 'label') AND release_id IN (
    SELECT id FROM releases WHERE label_id = auth.uid()
  ))
  WITH CHECK (has_role(auth.uid(), 'label') AND release_id IN (
    SELECT id FROM releases WHERE label_id = auth.uid()
  ));

CREATE POLICY "Artists can view their tracks" ON public.tracks
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist') AND (
      artist_name = get_user_full_name(auth.uid()) OR
      artists @> jsonb_build_array(jsonb_build_object('name', get_user_full_name(auth.uid()))) OR
      EXISTS (
        SELECT 1 FROM releases
        WHERE releases.id = tracks.release_id 
        AND releases.artist_name = get_user_full_name(auth.uid())
      )
    )
  );

-- 7.6 ROYALTY_UPLOADS POLICIES
CREATE POLICY "Admins can manage all uploads" ON public.royalty_uploads
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can view their own uploads" ON public.royalty_uploads
  FOR SELECT USING (user_id = auth.uid());

-- 7.7 ROYALTIES POLICIES
CREATE POLICY "Admins can manage all royalties" ON public.royalties
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Labels can view royalties for their artists" ON public.royalties
  FOR SELECT 
  USING (has_role(auth.uid(), 'label') AND label_name = get_user_full_name(auth.uid()));

CREATE POLICY "Artists can view their royalties" ON public.royalties
  FOR SELECT 
  USING (
    has_role(auth.uid(), 'artist') AND (
      artist_name = get_user_full_name(auth.uid()) OR 
      artist = get_user_full_name(auth.uid())
    )
  );

-- 7.8 PAYOUT_REQUESTS POLICIES
CREATE POLICY "Admins can manage all payouts" ON public.payout_requests
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can create pending payouts" ON public.payout_requests
  FOR INSERT 
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND amount > 0);

CREATE POLICY "Users can view their own payouts" ON public.payout_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can cancel pending payouts" ON public.payout_requests
  FOR DELETE USING (user_id = auth.uid() AND status = 'pending');

-- 7.9 APP_SETTINGS POLICIES
CREATE POLICY "Anyone can view app settings" ON public.app_settings
  FOR SELECT USING (true);

CREATE POLICY "Superadmins can manage app settings" ON public.app_settings
  FOR ALL USING (has_role(auth.uid(), 'superadmin'));

-- 7.10 AUDIT_LOGS POLICIES
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Service role can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- =====================================================
-- STEP 8: CREATE STORAGE BUCKETS
-- =====================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('release-covers', 'release-covers', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('track-audio', 'track-audio', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('track-video', 'track-video', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-clips', 'audio-clips', true);

-- 8.1 Storage Policies for release-covers (public bucket)
CREATE POLICY "Anyone can view release covers" ON storage.objects
  FOR SELECT USING (bucket_id = 'release-covers');

CREATE POLICY "Authenticated users can upload release covers" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'release-covers' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own release covers" ON storage.objects
  FOR UPDATE USING (bucket_id = 'release-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own release covers" ON storage.objects
  FOR DELETE USING (bucket_id = 'release-covers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 8.2 Storage Policies for track-audio (private bucket)
CREATE POLICY "Authenticated users can view track audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'track-audio' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload track audio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'track-audio' AND auth.role() = 'authenticated');

CREATE POLICY "Admins can manage track audio" ON storage.objects
  FOR ALL USING (bucket_id = 'track-audio' AND public.is_admin(auth.uid()));

-- 8.3 Storage Policies for audio-clips (public bucket)
CREATE POLICY "Anyone can view audio clips" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio-clips');

CREATE POLICY "Authenticated users can upload audio clips" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'audio-clips' AND auth.role() = 'authenticated');

-- =====================================================
-- STEP 9: INSERT DEFAULT APP SETTINGS
-- =====================================================
INSERT INTO public.app_settings (key, value) VALUES
  ('ga4_enabled', 'false'),
  ('gcs_enabled', 'false'),
  ('dashboard_logo', NULL),
  ('dashboard_logo_light', NULL),
  ('dashboard_logo_dark', NULL),
  ('favicon', NULL)
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- MIGRATION COMPLETE!
-- =====================================================
-- Next steps:
-- 1. Run this script in your new Supabase project SQL Editor
-- 2. Create users via Supabase Auth (email/password)
-- 3. Import data from CSV files exported from the Export Data page
-- 4. Update storage URLs in releases/tracks tables if needed
-- 5. Configure Edge Functions and Secrets
-- =====================================================
