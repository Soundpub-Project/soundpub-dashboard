\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';
SELECT set_config('soundpub.migration_signup_label_id', '00000000-0000-4000-8000-000000000001', true);
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000099');
INSERT INTO soundpub.profiles(id, email, full_name, parent_label_id)
VALUES ('00000000-0000-4000-8000-000000000001', 'fixture@example.invalid',
  'Private tenant fixture', '00000000-0000-4000-8000-000000000001');
CREATE SCHEMA storage;
CREATE TABLE storage.objects (bucket_id text NOT NULL, name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT ON storage.objects TO authenticated;
CREATE POLICY "SoundPub authenticated read private buckets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = ANY (ARRAY['release-covers'::text, 'track-audio'::text, 'track-video'::text]));
INSERT INTO storage.objects VALUES
  ('track-audio', '00000000-0000-4000-8000-000000000001/private.wav'),
  ('other-app-private', '00000000-0000-4000-8000-000000000002/private.pdf');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000099', true);
SET LOCAL ROLE authenticated;
DO $check$
DECLARE visible_count integer;
BEGIN
  IF soundpub.get_user_full_name('00000000-0000-4000-8000-000000000001')
    IS DISTINCT FROM 'Private tenant fixture' THEN
    RAISE EXCEPTION 'Expected baseline cross-application SQL disclosure changed';
  END IF;
  SELECT count(*) INTO visible_count FROM storage.objects WHERE bucket_id = 'track-audio';
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'Expected baseline isolation vulnerability changed; review live policy parity';
  END IF;
  SELECT count(*) INTO visible_count FROM storage.objects WHERE bucket_id = 'other-app-private';
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'Unexpected unrelated bucket exposure in reduced policy fixture';
  END IF;
END;
$check$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $check$
BEGIN
  IF soundpub.get_user_full_name('00000000-0000-4000-8000-000000000001')
    IS DISTINCT FROM 'Private tenant fixture' THEN
    RAISE EXCEPTION 'Expected baseline anonymous metadata disclosure changed';
  END IF;
END;
$check$;
ROLLBACK;
