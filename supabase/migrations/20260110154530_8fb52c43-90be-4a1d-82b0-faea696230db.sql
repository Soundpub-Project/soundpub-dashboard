-- Add new columns to tracks table for multiple artists and contributors
ALTER TABLE public.tracks 
ADD COLUMN IF NOT EXISTS artists jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS explicit_lyrics boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS contributors jsonb DEFAULT '[]'::jsonb;

-- Make isrc optional (nullable) since admin will input later
ALTER TABLE public.tracks ALTER COLUMN isrc DROP NOT NULL;

-- Make UPC optional in releases table
ALTER TABLE public.releases ALTER COLUMN upc DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tracks.artists IS 'Array of artists with name and type (main/featured)';
COMMENT ON COLUMN public.tracks.explicit_lyrics IS 'Whether track contains explicit lyrics';
COMMENT ON COLUMN public.tracks.contributors IS 'Array of additional contributors with name, type, and role';

-- Create artists table for label to manage their artists
CREATE TABLE IF NOT EXISTS public.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on artists table
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

-- RLS policies for artists
CREATE POLICY "Admins can manage all artists"
ON public.artists FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Labels can manage their own artists"
ON public.artists FOR ALL
TO authenticated
USING (label_id = auth.uid())
WITH CHECK (label_id = auth.uid());

CREATE POLICY "Users can view artists"
ON public.artists FOR SELECT
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_artists_updated_at
BEFORE UPDATE ON public.artists
FOR EACH ROW
EXECUTE FUNCTION public.update_timestamp();