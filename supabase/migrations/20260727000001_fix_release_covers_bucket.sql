-- Fix release-covers bucket to be private (consistent with code)
UPDATE storage.buckets 
SET public = false 
WHERE id = 'release-covers';
