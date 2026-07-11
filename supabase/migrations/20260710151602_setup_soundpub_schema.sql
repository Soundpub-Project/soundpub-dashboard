-- =============================================
-- SOUNDPUB SCHEMA SETUP AND MIGRATION
-- Migrate from public schema to soundpub schema
-- =============================================

-- 1. CREATE SCHEMA
CREATE SCHEMA IF NOT EXISTS soundpub;

-- 2. MIGRATE ENUM TYPES TO SOUNDPUB SCHEMA
CREATE TYPE soundpub.app_role AS ENUM ('superadmin', 'admin', 'label', 'artist', 'user');

-- 3. MIGRATE TABLES TO SOUNDPUB SCHEMA
-- Create user_roles table
CREATE TABLE soundpub.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role soundpub.app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, role)
);

-- Create profiles table
CREATE TABLE soundpub.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    parent_label_id UUID REFERENCES soundpub.profiles(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    balance DECIMAL(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create releases table
CREATE TABLE soundpub.releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upc TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    label_id UUID NOT NULL REFERENCES soundpub.profiles(id),
    release_date DATE,
    cover_url TEXT,
    genre TEXT,
    release_type TEXT DEFAULT 'single' CHECK (release_type IN ('single', 'album', 'ep')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'draft', 'inactive')),
    created_by UUID REFERENCES soundpub.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tracks table
CREATE TABLE soundpub.tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES soundpub.releases(id) ON DELETE CASCADE,
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

-- Create royalty_uploads table
CREATE TABLE soundpub.royalty_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES soundpub.profiles(id),
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

-- Create royalties table
CREATE TABLE soundpub.royalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES soundpub.royalty_uploads(id),
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

-- Create payout_requests table
CREATE TABLE soundpub.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES soundpub.profiles(id),
    amount DECIMAL(18, 2) NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    processed_by UUID REFERENCES soundpub.profiles(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ENABLE ROW LEVEL SECURITY
ALTER TABLE soundpub.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.royalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE soundpub.royalty_uploads ENABLE ROW LEVEL SECURITY;

-- 5. CREATE HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION soundpub.has_role(user_id UUID, role soundpub.app_role)
RETURNS BOOLEAN AS $ $
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM soundpub.user_roles
    WHERE user_roles.user_id = $1 AND user_roles.role = $2
  );
END;`r
$ $ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE OR REPLACE FUNCTION soundpub.is_admin(user_id UUID)
RETURNS BOOLEAN AS $ $
BEGIN
  RETURN soundpub.has_role($1, 'superadmin'::soundpub.app_role) 
      OR soundpub.has_role($1, 'admin'::soundpub.app_role);
END;`r
$ $ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;

CREATE OR REPLACE FUNCTION soundpub.get_user_full_name(user_id UUID)
RETURNS TEXT AS $ $
BEGIN
  RETURN (SELECT full_name FROM soundpub.profiles WHERE id = $1);
END;`r
$ $ LANGUAGE plpgsql SECURITY DEFINER SET search_path = soundpub;
