#!/bin/sh
# Runs once, when the data directory is first initialised.
# Creates the application role with access to the private_vault database
# ONLY: not a superuser, cannot create databases/roles, and PUBLIC loses
# CONNECT on every other database in this instance.
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname postgres \
  -v app_db="$VAULT_DB_NAME" -v app_user="$VAULT_DB_USER" -v app_pass="$VAULT_DB_PASSWORD" <<'SQL'
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_pass';
CREATE DATABASE :"app_db" OWNER :"app_user" ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE :"app_db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"app_db" TO :"app_user";
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
SQL

# Extensions need superuser; the migration's CREATE EXTENSION IF NOT EXISTS is then a no-op.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$VAULT_DB_NAME" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$VAULT_DB_NAME" -v app_user="$VAULT_DB_USER" <<'SQL'
ALTER SCHEMA public OWNER TO :"app_user";
SQL
