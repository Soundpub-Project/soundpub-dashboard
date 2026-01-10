-- Drop the existing check constraint and recreate with 'processing' status included
ALTER TABLE public.royalty_uploads DROP CONSTRAINT IF EXISTS royalty_uploads_status_check;

ALTER TABLE public.royalty_uploads ADD CONSTRAINT royalty_uploads_status_check 
CHECK (status IN ('pending', 'processing', 'success', 'partial', 'failed'));