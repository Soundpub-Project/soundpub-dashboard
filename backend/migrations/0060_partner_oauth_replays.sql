CREATE TABLE soundpub.partner_oauth_replays (
  state_sha256 text PRIMARY KEY CHECK (state_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > created_at)
);

CREATE INDEX partner_oauth_replays_expiry_idx ON soundpub.partner_oauth_replays(expires_at);

REVOKE ALL ON soundpub.partner_oauth_replays FROM PUBLIC, soundpub_app;

CREATE FUNCTION soundpub.claim_partner_oauth_state(p_state_sha256 text, p_expires_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, soundpub
AS $$
DECLARE
  claimed_count integer;
  claim_time timestamptz := clock_timestamp();
BEGIN
  IF p_state_sha256 !~ '^[0-9a-f]{64}$' OR p_expires_at <= claim_time THEN
    RETURN false;
  END IF;
  DELETE FROM soundpub.partner_oauth_replays
  WHERE state_sha256=p_state_sha256 AND expires_at <= claim_time;
  INSERT INTO soundpub.partner_oauth_replays(state_sha256,expires_at,created_at)
  VALUES (p_state_sha256,p_expires_at,claim_time)
  ON CONFLICT (state_sha256) DO NOTHING;
  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count = 1;
END;
$$;

CREATE FUNCTION soundpub.cleanup_partner_oauth_replays()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, soundpub
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM soundpub.partner_oauth_replays WHERE expires_at <= clock_timestamp();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION soundpub.claim_partner_oauth_state(text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION soundpub.cleanup_partner_oauth_replays() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soundpub.claim_partner_oauth_state(text,timestamptz) TO soundpub_app;
GRANT EXECUTE ON FUNCTION soundpub.cleanup_partner_oauth_replays() TO soundpub_app;
