#!/bin/sh
set -eu

[ "${POSTGRES_HOST:-}" = 'postgres' ] || { echo "Development postgres service required" >&2; exit 1; }
[ "${POSTGRES_DB:-}" = 'soundpub_dev' ] || { echo "Development database required" >&2; exit 1; }
[ "${POSTGRES_USER:-}" = 'postgres' ] || { echo "Development bootstrap user required" >&2; exit 1; }

for value in "${RECONCILIATION_DATABASE_PASSWORD:-}" "${AUDIT_DATABASE_PASSWORD:-}" "${POSTGRES_PASSWORD:-}"; do
  case "$value" in
    ''|*[!A-Za-z0-9]*) echo "Database passwords must be 24+ alphanumeric characters" >&2; exit 1 ;;
  esac
  [ "${#value}" -ge 24 ] || { echo "Database password too short" >&2; exit 1; }
done

export PGPASSWORD="$POSTGRES_PASSWORD"
psql -v ON_ERROR_STOP=1 --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='soundpub_reconciler') THEN
    CREATE ROLE soundpub_reconciler LOGIN PASSWORD '${RECONCILIATION_DATABASE_PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    ALTER ROLE soundpub_reconciler WITH LOGIN PASSWORD '${RECONCILIATION_DATABASE_PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='soundpub_auditor') THEN
    CREATE ROLE soundpub_auditor LOGIN PASSWORD '${AUDIT_DATABASE_PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    ALTER ROLE soundpub_auditor WITH LOGIN PASSWORD '${AUDIT_DATABASE_PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
\$\$;
REVOKE soundpub_app FROM soundpub_reconciler;
GRANT CONNECT ON DATABASE soundpub_dev TO soundpub_reconciler,soundpub_auditor;
SQL
