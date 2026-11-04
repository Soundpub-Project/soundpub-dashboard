\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $check$
DECLARE routine regprocedure;
BEGIN
  FOREACH routine IN ARRAY ARRAY['soundpub.cleanup_expired_tokens()'::regprocedure,
    'soundpub.cleanup_rate_limits()'::regprocedure] LOOP
    IF has_function_privilege('anon', routine, 'EXECUTE')
      OR has_function_privilege('authenticated', routine, 'EXECUTE')
      OR NOT has_function_privilege('service_role', routine, 'EXECUTE') THEN
      RAISE EXCEPTION 'Maintenance EXECUTE boundary failed: %', routine;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_proc WHERE oid = routine
      AND 'search_path=pg_catalog, pg_temp' = ANY(proconfig)) THEN
      RAISE EXCEPTION 'Maintenance search_path failed: %', routine;
    END IF;
  END LOOP;
END;
$check$;
SET LOCAL ROLE anon;
DO $check$
BEGIN
  BEGIN
    PERFORM soundpub.cleanup_expired_tokens();
    RAISE EXCEPTION 'Anonymous cleanup allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$check$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $check$
BEGIN
  BEGIN
    PERFORM soundpub.cleanup_rate_limits();
    RAISE EXCEPTION 'Authenticated cleanup allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$check$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT soundpub.cleanup_expired_tokens();
SELECT soundpub.cleanup_rate_limits();
ROLLBACK;
