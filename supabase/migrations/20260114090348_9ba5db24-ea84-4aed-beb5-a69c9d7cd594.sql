-- Add duration column to tracks table (in seconds)
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS duration integer;