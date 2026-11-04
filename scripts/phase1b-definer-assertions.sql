\set ON_ERROR_STOP on
\if :{?enforce_security}
\else
\set enforce_security true
\endif

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH function_definitions AS (
  SELECT routine.oid,
    CASE
      WHEN routine.proname IN ('auto_assign_artist_role', 'auto_assign_new_user_to_soundpub_label')
        THEN regexp_replace(pg_get_functiondef(routine.oid),
          '''[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}''::uuid',
          'current_setting(''soundpub.migration_signup_label_id'')::uuid', 'g')
      WHEN routine.proname IN ('get_royalty_artist_breakdown', 'get_royalty_track_breakdown')
        THEN regexp_replace(pg_get_functiondef(routine.oid),
          '''[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}''::uuid',
          'current_setting(''soundpub.migration_reporting_label_id'')::uuid', 'g')
      ELSE pg_get_functiondef(routine.oid)
    END AS definition
  FROM pg_proc routine
  WHERE routine.pronamespace = 'soundpub'::regnamespace
), objects AS (
  SELECT 'schema' AS kind, namespace.nspname::text AS identity,
    jsonb_build_array(namespace.nspname, pg_get_userbyid(namespace.nspowner)) AS definition
  FROM pg_namespace namespace WHERE namespace.nspname = 'soundpub'
  UNION ALL
  SELECT 'relation', relation.relname,
    jsonb_build_array(relation.relname, relation.relkind, pg_get_userbyid(relation.relowner),
      relation.relpersistence, relation.relrowsecurity, relation.relforcerowsecurity,
      relation.relreplident, relation.reloptions, relation.relispartition,
      pg_get_expr(relation.relpartbound, relation.oid))
  FROM pg_class relation WHERE relation.relnamespace = 'soundpub'::regnamespace
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT 'column', relation.relname || '.' || attribute.attname,
    jsonb_build_array(relation.relname, attribute.attnum, attribute.attname,
      format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull,
      attribute.attidentity, attribute.attgenerated, attribute.attstorage,
      attribute.attcollation::regcollation::text,
      pg_get_expr(column_default.adbin, column_default.adrelid))
  FROM pg_attribute attribute JOIN pg_class relation ON relation.oid = attribute.attrelid
  LEFT JOIN pg_attrdef column_default ON column_default.adrelid = attribute.attrelid
    AND column_default.adnum = attribute.attnum
  WHERE relation.relnamespace = 'soundpub'::regnamespace AND attribute.attnum > 0
    AND NOT attribute.attisdropped AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
  UNION ALL
  SELECT 'constraint', constraint_record.conrelid::regclass::text || '.' || constraint_record.conname,
    jsonb_build_array(pg_get_constraintdef(constraint_record.oid), constraint_record.convalidated,
      constraint_record.condeferrable, constraint_record.condeferred)
  FROM pg_constraint constraint_record WHERE constraint_record.connamespace = 'soundpub'::regnamespace
  UNION ALL
  SELECT 'index', index_relation.relname,
    jsonb_build_array(pg_get_indexdef(index_record.indexrelid), index_record.indisvalid,
      index_record.indisready, index_record.indisreplident, index_relation.reloptions)
  FROM pg_index index_record JOIN pg_class index_relation ON index_relation.oid = index_record.indexrelid
  WHERE index_relation.relnamespace = 'soundpub'::regnamespace
  UNION ALL
  SELECT 'function', routine.proname || '(' || pg_get_function_identity_arguments(routine.oid) || ')',
    jsonb_build_array(pg_get_userbyid(routine.proowner), replace(function_definitions.definition, chr(13), ''))
  FROM pg_proc routine JOIN function_definitions ON function_definitions.oid = routine.oid
  UNION ALL
  SELECT 'enum', enum_type.typname,
    jsonb_build_array(pg_get_userbyid(enum_type.typowner),
      (SELECT jsonb_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder)
       FROM pg_enum enum_value WHERE enum_value.enumtypid = enum_type.oid))
  FROM pg_type enum_type WHERE enum_type.typnamespace = 'soundpub'::regnamespace AND enum_type.typtype = 'e'
  UNION ALL
  SELECT 'policy', policy.polrelid::regclass::text || '.' || policy.polname,
    jsonb_build_array(policy.polcmd, policy.polpermissive,
      (SELECT jsonb_agg(role_name ORDER BY role_name COLLATE "C") FROM
        (SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END AS role_name
         FROM unnest(policy.polroles) role_oid) roles),
      pg_get_expr(policy.polqual, policy.polrelid), pg_get_expr(policy.polwithcheck, policy.polrelid))
  FROM pg_policy policy JOIN pg_class relation ON relation.oid = policy.polrelid
  WHERE relation.relnamespace = 'soundpub'::regnamespace
  UNION ALL
  SELECT 'trigger', trigger_record.tgrelid::regclass::text || '.' || trigger_record.tgname,
    jsonb_build_array(pg_get_triggerdef(trigger_record.oid), trigger_record.tgenabled)
  FROM pg_trigger trigger_record JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
  WHERE relation.relnamespace = 'soundpub'::regnamespace AND NOT trigger_record.tgisinternal
), acl_sources AS (
  SELECT 'schema_acl' AS kind, namespace.nspname::text AS identity,
    coalesce(namespace.nspacl, acldefault('n', namespace.nspowner)) AS acl
  FROM pg_namespace namespace WHERE namespace.nspname = 'soundpub'
  UNION ALL
  SELECT 'relation_acl', relation.relname, coalesce(relation.relacl, acldefault('r', relation.relowner))
  FROM pg_class relation WHERE relation.relnamespace = 'soundpub'::regnamespace
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
  UNION ALL
  SELECT 'function_acl', routine.proname || '(' || pg_get_function_identity_arguments(routine.oid) || ')',
    coalesce(routine.proacl, acldefault('f', routine.proowner))
  FROM pg_proc routine WHERE routine.pronamespace = 'soundpub'::regnamespace
  UNION ALL
  SELECT 'type_acl', enum_type.typname, coalesce(enum_type.typacl, acldefault('T', enum_type.typowner))
  FROM pg_type enum_type WHERE enum_type.typnamespace = 'soundpub'::regnamespace AND enum_type.typtype = 'e'
  UNION ALL
  SELECT 'column_acl', relation.relname || '.' || attribute.attname, attribute.attacl
  FROM pg_attribute attribute JOIN pg_class relation ON relation.oid = attribute.attrelid
  WHERE relation.relnamespace = 'soundpub'::regnamespace AND attribute.attacl IS NOT NULL
  UNION ALL
  SELECT 'default_acl', pg_get_userbyid(default_acl.defaclrole) || ':' || default_acl.defaclobjtype::text,
    default_acl.defaclacl
  FROM pg_default_acl default_acl WHERE default_acl.defaclnamespace = 'soundpub'::regnamespace
    OR default_acl.defaclnamespace = 0
), records AS (
  SELECT kind, identity, definition FROM objects
  UNION ALL
  SELECT source.kind, source.identity,
    coalesce((SELECT jsonb_agg(jsonb_build_array(
      pg_get_userbyid(entry.grantor), CASE WHEN entry.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(entry.grantee) END,
      entry.privilege_type, entry.is_grantable) ORDER BY
      pg_get_userbyid(entry.grantor) COLLATE "C",
      (CASE WHEN entry.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(entry.grantee) END) COLLATE "C",
      entry.privilege_type COLLATE "C", entry.is_grantable)
      FROM aclexplode(source.acl) entry), '[]'::jsonb)
  FROM acl_sources source
)
SELECT 'phase1b_soundpub_catalog_v1' AS fingerprint_version, count(*) AS records,
  encode(sha256(convert_to(string_agg(jsonb_build_array(kind, identity, definition)::text,
    E'\n' ORDER BY kind COLLATE "C", identity COLLATE "C"), 'UTF8')), 'hex') AS sha256
FROM records;

SELECT routine.proname, pg_get_function_identity_arguments(routine.oid) AS signature,
  pg_get_userbyid(routine.proowner) AS owner, routine.proconfig,
  coalesce(routine.proacl, acldefault('f', routine.proowner)) AS execute_acl,
  has_function_privilege('anon', routine.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', routine.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc routine WHERE routine.pronamespace = 'soundpub'::regnamespace AND routine.prosecdef
ORDER BY routine.proname;

\if :enforce_security
DO $assertions$
DECLARE failures text[] := ARRAY[]::text[];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'soundpub'::regnamespace
    AND prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(proconfig) setting WHERE setting LIKE 'search_path=%')) THEN
    failures := array_append(failures, 'definer missing fixed search_path');
  END IF;
  IF has_function_privilege('anon', 'soundpub.scan_orphan_artist_links()', 'EXECUTE') THEN
    failures := array_append(failures, 'ungated orphan scan executable by client roles');
  END IF;
  IF has_function_privilege('anon', 'soundpub.cleanup_expired_tokens()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'soundpub.cleanup_expired_tokens()', 'EXECUTE') THEN
    failures := array_append(failures, 'ungated token cleanup executable by client roles');
  END IF;
  IF has_function_privilege('anon', 'soundpub.get_user_full_name(uuid)', 'EXECUTE') THEN
    failures := array_append(failures, 'ungated profile name lookup executable by anon');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'soundpub'::regnamespace
    AND proname IN ('check_rate_limit', 'cleanup_rate_limits', 'commit_royalty_upload',
      'reverse_royalty_upload', 'rebuild_royalty_balances', 'complete_payout')
    AND (has_function_privilege('anon', oid, 'EXECUTE') OR has_function_privilege('authenticated', oid, 'EXECUTE'))) THEN
    failures := array_append(failures, 'server-only function executable by client roles');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['import_composer_royalties', 'validate_royalty_csv_row',
    'delete_royalty_upload', 'get_royalty_upload_history']) required_name
    WHERE NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'soundpub'::regnamespace
      AND proname = required_name)) THEN
    failures := array_append(failures, 'active copyright RPC contract missing');
  END IF;
  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'Phase 1B catalog gates failed: %', array_to_string(failures, '; ');
  END IF;
END;
$assertions$;
\endif
ROLLBACK;
