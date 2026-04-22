ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS sso_user_id TEXT,
  ADD COLUMN IF NOT EXISTS sso_user_type TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_sso_user_id ON public.profiles(sso_user_id);