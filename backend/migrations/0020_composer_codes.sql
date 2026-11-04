CREATE UNIQUE INDEX profiles_composer_code_unique_idx
  ON soundpub.profiles (upper(btrim(composer_code)))
  WHERE composer_code IS NOT NULL;

GRANT UPDATE (composer_code, updated_at) ON soundpub.profiles TO soundpub_app;