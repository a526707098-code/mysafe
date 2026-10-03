#!/usr/bin/env bash
# Deploys this directory to a server over SSH and starts it with docker compose.
#
#   scripts/deploy.sh            dry run: checks the connection and prints what it WOULD do
#   scripts/deploy.sh --yes      really deploy
#
# Configuration (environment variables, never committed):
#   VAULT_SSH_HOST        server address                       (required)
#   VAULT_SSH_USER        ssh user, must be able to run docker (required)
#   VAULT_SSH_KEY         private key contents, or
#   VAULT_SSH_KEY_FILE    path to a private key file           (one of the two)
#   VAULT_SSH_PORT        default 22
#   VAULT_REMOTE_DIR      default /opt/private-vault
#   VAULT_APP_ORIGIN      only on the FIRST deploy: where you will open the site,
#                         e.g. http://127.0.0.1:8080 (ssh tunnel) or https://vault.example.ts.net
#   VAULT_COOKIE_SECURE   first deploy only; "false" for plain http, default "true"
#
# What it never does: touch anything outside VAULT_REMOTE_DIR and this project's own containers
# (private-vault-*), overwrite an existing .env, database/data, uploads/ or backups/, or print secrets.
set -euo pipefail

cd "$(dirname "$0")/.."
GO=false
[[ "${1:-}" == "--yes" ]] && GO=true

: "${VAULT_SSH_HOST:?set VAULT_SSH_HOST}"
: "${VAULT_SSH_USER:?set VAULT_SSH_USER}"
PORT="${VAULT_SSH_PORT:-22}"
DIR="${VAULT_REMOTE_DIR:-/opt/private-vault}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
KEY="$TMP/key"
if [[ -n "${VAULT_SSH_KEY:-}" ]]; then
  printf '%s\n' "$VAULT_SSH_KEY" > "$KEY"
elif [[ -n "${VAULT_SSH_KEY_FILE:-}" ]]; then
  cp "$VAULT_SSH_KEY_FILE" "$KEY"
else
  echo "set VAULT_SSH_KEY or VAULT_SSH_KEY_FILE" >&2; exit 1
fi
chmod 600 "$KEY"

# First connection records the host key; the fingerprint is printed so it can be compared with the
# one the server shows (ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub). Later runs refuse a changed key.
KNOWN="${VAULT_KNOWN_HOSTS_FILE:-$HOME/.ssh/known_hosts_mysafe}"
mkdir -p "$(dirname "$KNOWN")"
SSH=(ssh -i "$KEY" -p "$PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15
     -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$KNOWN")
REMOTE="$VAULT_SSH_USER@$VAULT_SSH_HOST"
run() { "${SSH[@]}" "$REMOTE" "$@"; }

echo "== connecting to $REMOTE:$PORT"
run 'echo connected as "$(whoami)" on "$(hostname)"; docker --version; docker compose version' 
ssh-keygen -lf <(ssh-keyscan -p "$PORT" -t ed25519 "$VAULT_SSH_HOST" 2>/dev/null) 2>/dev/null | sed 's/^/   host key: /' || true

echo "== what is already on the server"
run "ls -d '$DIR' >/dev/null 2>&1 && echo 'directory exists: $DIR' || echo 'directory does not exist yet (first deploy)'; \
     test -f '$DIR/.env' && echo '.env present (kept as is)' || echo '.env missing (will be generated)'; \
     docker ps --format '   container: {{.Names}} ({{.Ports}})' | head -30"

if ! $GO; then
  echo
  echo "Dry run only. Nothing was changed. Re-run with --yes to deploy."
  exit 0
fi

echo "== uploading"
tar --exclude='./.env' --exclude='./database/data' --exclude='./uploads/*' --exclude='./backups/*' \
    --exclude='node_modules' --exclude='.next' --exclude='./app/*/node_modules' \
    --exclude='.git' --exclude='./docs/screenshots' -czf "$TMP/release.tgz" .
run "mkdir -p '$DIR' && cd '$DIR' && mkdir -p uploads backups database/data"
"${SSH[@]}" "$REMOTE" "cd '$DIR' && tar -xzf -" < "$TMP/release.tgz"
run "cd '$DIR' && chmod +x scripts/*.sh && test -d uploads && (sudo -n chown 1000:1000 uploads 2>/dev/null || chown 1000:1000 uploads 2>/dev/null || true)"

echo "== configuration"
if run "test -f '$DIR/.env'"; then
  echo ".env already exists on the server: left untouched"
else
  : "${VAULT_APP_ORIGIN:?first deploy: set VAULT_APP_ORIGIN (e.g. http://127.0.0.1:8080)}"
  COOKIE="${VAULT_COOKIE_SECURE:-true}"
  # The secrets are generated ON the server and never pass through this machine or the chat.
  run "cd '$DIR' && umask 077 && { grep -v -E '^(APP_ORIGIN|COOKIE_SECURE|[A-Z_]*(PASSWORD|SECRET|KEY|TOKEN|PASSPHRASE))=' .env.example | grep -v -E '^(ENCRYPTION_KEY_VERSION|ENCRYPTION_KEY_PREVIOUS)' ; \
      echo 'ENCRYPTION_KEY_VERSION=1'; echo 'ENCRYPTION_KEY_PREVIOUS='; echo 'APP_ORIGIN=$VAULT_APP_ORIGIN'; echo 'COOKIE_SECURE=$COOKIE'; \
      ./scripts/generate-secrets.sh; } > .env && chmod 600 .env && echo '.env generated (600)'"
  echo
  echo "!! BACK UP THE SERVER'S .env NOW, somewhere off the server (it holds ENCRYPTION_KEY)."
  echo "   Without it the stored data cannot be decrypted. From your computer:"
  echo "   scp -P $PORT $REMOTE:$DIR/.env ./mysafe.env.backup   (keep it in a password manager, never in git)"
fi

echo "== pre-deploy database backup (if a database already exists)"
run "cd '$DIR' && if docker ps --format '{{.Names}}' | grep -qx private-vault-db; then \
       f=backups/pre-deploy-\$(date +%Y%m%d-%H%M%S).sql.gz; \
       docker exec private-vault-db sh -c 'pg_dump -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\"' | gzip > \$f && echo saved \$f; \
     else echo 'no running database, skipped'; fi"

echo "== build and start"
run "cd '$DIR' && docker compose up -d --build"

echo "== waiting for healthy containers"
for i in $(seq 1 40); do
  s="$(run "cd '$DIR' && docker compose ps --format '{{.Name}} {{.Health}}'" || true)"
  if ! grep -qE 'starting|unhealthy' <<<"$s" && grep -q private-vault-nginx <<<"$s"; then break; fi
  sleep 5
done
run "cd '$DIR' && docker compose ps"
run "curl -fsS -o /dev/null -w 'site answers on the server: HTTP %{http_code}\n' http://127.0.0.1:\${VAULT_PORT:-8080}/login || echo 'site did not answer'"
echo
echo "Deployed. It listens on 127.0.0.1 of the server. To open it from your computer:"
echo "  ssh -L 8080:127.0.0.1:8080 $REMOTE   then browse to http://localhost:8080"
