-- Password-reset tokens are now stored as a SHA-256 hex digest instead of the
-- raw token (see supabase/functions/send-password-reset). Any token already in
-- the table is plaintext and would no longer match the digest lookup, so it is
-- cleared: the affected users simply request a new link. Tokens are valid for
-- 24h, so the blast radius is one day of outstanding requests.

UPDATE soundpub.profiles
SET password_reset_token = NULL,
    password_reset_token_expires_at = NULL
WHERE password_reset_token IS NOT NULL;

COMMENT ON COLUMN soundpub.profiles.password_reset_token IS
  'SHA-256 hex digest of the reset token. The raw token exists only in the email link.';
