
-- =============================================
-- SOUNDPUB MUSIC DISTRIBUTION PLATFORM
-- Database Schema with Secure RBAC
-- =============================================

-- 1. Create role enum type
CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'label', 'artist', 'user');

-- 2. Create user_roles table (SECURITY: roles stored separately)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, role)
);

-- 3. Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    parent_label_id UUID REFERENCES public.profiles(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    balance DECIMAL(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create releases table
CREATE TABLE public.releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upc TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    label_id UUID NOT NULL REFERENCES public.profiles(id),
    release_date DATE,
    cover_url TEXT,
    genre TEXT,
    release_type TEXT DEFAULT 'single' CHECK (release_type IN ('single', 'album', 'ep')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'draft', 'inactive')),
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create tracks table
CREATE TABLE public.tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
    isrc TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    audio_url TEXT,
    composer TEXT,
    lyricist TEXT,
    lyrics TEXT,
    genre TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create royalty_uploads table
CREATE TABLE public.royalty_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    inserted_records INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'partial', 'failed')),
    error_message TEXT,
    summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create royalties table
CREATE TABLE public.royalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES public.royalty_uploads(id),
    period TEXT NOT NULL,
    isrc TEXT NOT NULL,
    upc TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    label_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    country TEXT NOT NULL,
    sales_type TEXT NOT NULL,
    unit_penjualan INTEGER NOT NULL DEFAULT 0,
    pendapatan_kotor_dsp DECIMAL(18, 2) NOT NULL DEFAULT 0,
    pendapatan_label_artis DECIMAL(18, 2) NOT NULL DEFAULT 0,
    pendapatan_bersih_soundpub DECIMAL(18, 2) NOT NULL DEFAULT 0,
    artist_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    soundpub_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    title TEXT,
    artist TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create payout_requests table
CREATE TABLE public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    amount DECIMAL(18, 2) NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    processed_by UUID REFERENCES public.profiles(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_uploads ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTIONS (prevent infinite recursion)
-- =============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
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

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
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

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
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

-- Function to get user full_name (for artist matching)
CREATE OR REPLACE FUNCTION public.get_user_full_name(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT full_name FROM public.profiles
  WHERE id = _user_id
$$;

-- =============================================
-- RLS POLICIES FOR USER_ROLES
-- =============================================
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

-- =============================================
-- RLS POLICIES FOR PROFILES
-- =============================================
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Labels can view their artists"
ON public.profiles FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'label') 
  AND parent_label_id = auth.uid()
);

-- =============================================
-- RLS POLICIES FOR RELEASES
-- =============================================
CREATE POLICY "Admins can manage all releases"
ON public.releases FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Labels can manage their releases"
ON public.releases FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'label') 
  AND label_id = auth.uid()
);

CREATE POLICY "Artists can view their releases"
ON public.releases FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'artist')
  AND artist_name = public.get_user_full_name(auth.uid())
);

-- =============================================
-- RLS POLICIES FOR TRACKS
-- =============================================
CREATE POLICY "Admins can manage all tracks"
ON public.tracks FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Labels can manage tracks for their releases"
ON public.tracks FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'label')
  AND release_id IN (SELECT id FROM public.releases WHERE label_id = auth.uid())
);

CREATE POLICY "Artists can view their tracks"
ON public.tracks FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'artist')
  AND artist_name = public.get_user_full_name(auth.uid())
);

-- =============================================
-- RLS POLICIES FOR ROYALTIES
-- =============================================
CREATE POLICY "Admins can manage all royalties"
ON public.royalties FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Labels can view royalties for their artists"
ON public.royalties FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'label')
  AND label_name = public.get_user_full_name(auth.uid())
);

CREATE POLICY "Artists can view their royalties"
ON public.royalties FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'artist')
  AND (
    artist_name = public.get_user_full_name(auth.uid())
    OR artist = public.get_user_full_name(auth.uid())
  )
);

-- =============================================
-- RLS POLICIES FOR PAYOUT_REQUESTS
-- =============================================
CREATE POLICY "Admins can manage all payouts"
ON public.payout_requests FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can manage their own payouts"
ON public.payout_requests FOR ALL
TO authenticated
USING (user_id = auth.uid());

-- =============================================
-- RLS POLICIES FOR ROYALTY_UPLOADS
-- =============================================
CREATE POLICY "Admins can manage all uploads"
ON public.royalty_uploads FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own uploads"
ON public.royalty_uploads FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- =============================================
-- TRIGGERS FOR TIMESTAMPS
-- =============================================
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_timestamp
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_releases_timestamp
BEFORE UPDATE ON public.releases
FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_tracks_timestamp
BEFORE UPDATE ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_payout_requests_timestamp
BEFORE UPDATE ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER update_royalty_uploads_timestamp
BEFORE UPDATE ON public.royalty_uploads
FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- =============================================
-- TRIGGER FOR BALANCE UPDATE ON PAYOUT
-- =============================================
CREATE OR REPLACE FUNCTION public.update_balance_on_payout_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
        UPDATE public.profiles
        SET balance = balance - NEW.amount
        WHERE id = NEW.user_id;
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        UPDATE public.profiles
        SET balance = balance + NEW.amount
        WHERE id = NEW.user_id;
    END IF;

    IF NEW.status IN ('approved', 'rejected', 'paid') AND
       (OLD.status IS NULL OR OLD.status NOT IN ('approved', 'rejected', 'paid')) THEN
        NEW.processed_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_balance_on_payout_status_change
BEFORE UPDATE ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.update_balance_on_payout_status_change();

-- =============================================
-- TRIGGER FOR AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_profiles_parent_label ON public.profiles(parent_label_id);
CREATE INDEX idx_releases_label_id ON public.releases(label_id);
CREATE INDEX idx_releases_artist_name ON public.releases(artist_name);
CREATE INDEX idx_tracks_release_id ON public.tracks(release_id);
CREATE INDEX idx_tracks_artist_name ON public.tracks(artist_name);
CREATE INDEX idx_royalties_upload_id ON public.royalties(upload_id);
CREATE INDEX idx_royalties_artist_name ON public.royalties(artist_name);
CREATE INDEX idx_royalties_label_name ON public.royalties(label_name);
CREATE INDEX idx_payout_requests_user_id ON public.payout_requests(user_id);
CREATE INDEX idx_royalty_uploads_user_id ON public.royalty_uploads(user_id);
