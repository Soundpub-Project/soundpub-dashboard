#!/bin/sh
set -eu
for value in "${MIGRATION_DATABASE_PASSWORD:-}" "${APP_DATABASE_PASSWORD:-}"; do
  case "$value" in
    ''|*[!A-Za-z0-9]*) echo "Database passwords must be 24+ alphanumeric characters" >&2; exit 1 ;;
  esac
  [ "${#value}" -ge 24 ] || { echo "Database password too short" >&2; exit 1; }
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE soundpub_owner LOGIN PASSWORD '${MIGRATION_DATABASE_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE soundpub_app LOGIN PASSWORD '${APP_DATABASE_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
ALTER DATABASE ${POSTGRES_DB} OWNER TO soundpub_owner;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO soundpub_app;
REVOKE CONNECT ON DATABASE ${POSTGRES_DB} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO soundpub_owner, soundpub_app;
SQL
createdb --username "$POSTGRES_USER" --owner soundpub_owner soundpub_test
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname soundpub_test <<SQL
REVOKE CONNECT ON DATABASE soundpub_test FROM PUBLIC;
GRANT CONNECT ON DATABASE soundpub_test TO soundpub_owner;
SQL
