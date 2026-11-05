FROM postgres:17-alpine
COPY infra/postgres/001-create-app-user.sh /docker-entrypoint-initdb.d/001-create-app-user.sh
COPY infra/postgres/provision-runtime-roles.sh /usr/local/bin/provision-runtime-roles
RUN chmod 0555 /docker-entrypoint-initdb.d/001-create-app-user.sh /usr/local/bin/provision-runtime-roles
