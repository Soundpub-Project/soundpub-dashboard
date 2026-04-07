
-- Add SSO-related columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sso_provider text DEFAULT null;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS artist_profile_completed boolean DEFAULT false;

-- Create artist_profiles table for detailed artist/band info
CREATE TABLE public.artist_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_name text NOT NULL,
  artist_type text NOT NULL DEFAULT 'solo',
  bio text,
  genre text,
  social_links jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.artist_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view own artist profile
CREATE POLICY "Users can view own artist profile"
  ON public.artist_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update own artist profile
CREATE POLICY "Users can update own artist profile"
  ON public.artist_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert own artist profile
CREATE POLICY "Users can insert own artist profile"
  ON public.artist_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins can manage all artist profiles
CREATE POLICY "Admins can manage all artist profiles"
  ON public.artist_profiles FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Labels can view their artist profiles
CREATE POLICY "Labels can view their artist profiles"
  ON public.artist_profiles FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM profiles WHERE parent_label_id = auth.uid()
    )
  );

-- Add timestamp trigger
CREATE TRIGGER update_artist_profiles_timestamp
  BEFORE UPDATE ON public.artist_profiles
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
