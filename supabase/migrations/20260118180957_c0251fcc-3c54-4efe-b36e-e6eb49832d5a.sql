-- Add composer_code column for copyright users
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS composer_code TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_composer_code ON public.profiles(composer_code);

-- Comment explaining usage
COMMENT ON COLUMN public.profiles.composer_code IS 'Kode composer untuk matching royalty hak cipta (contoh: UTR0001)';