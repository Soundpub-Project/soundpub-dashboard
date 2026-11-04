BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER FUNCTION soundpub.cleanup_expired_tokens() SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION soundpub.cleanup_rate_limits() SET search_path = pg_catalog, pg_temp;

REVOKE EXECUTE ON FUNCTION soundpub.cleanup_expired_tokens() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION soundpub.cleanup_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION soundpub.cleanup_expired_tokens() TO service_role;
GRANT EXECUTE ON FUNCTION soundpub.cleanup_rate_limits() TO service_role;

COMMIT;
