ALTER TABLE soundpub.auth_one_time_tokens
  ADD COLUMN request_id text,
  ADD COLUMN consumed_request_id text;

ALTER TABLE soundpub.auth_one_time_tokens
  ADD CONSTRAINT auth_one_time_tokens_bounded_ttl CHECK (
    (purpose = 'email_verification' AND expires_at <= created_at + interval '24 hours') OR
    (purpose = 'password_reset' AND expires_at <= created_at + interval '1 hour') OR
    purpose = 'email_change'
  ) NOT VALID;

CREATE INDEX backend_users_unverified_email_idx
  ON soundpub.backend_users(lower(email)) WHERE email_verified_at IS NULL;

