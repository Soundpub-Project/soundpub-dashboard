SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE p.proname = 'check_rate_limit'
ORDER BY n.nspname;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name ILIKE '%rate%limit%'
ORDER BY table_schema, table_name;

SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE column_name IN ('attempt_count', 'window_start', 'blocked_until', 'action_type')
ORDER BY table_schema, table_name, column_name;
