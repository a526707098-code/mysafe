#!/usr/bin/env bash
# Prints fresh random values for every secret in .env.example.
# Usage: ./scripts/generate-secrets.sh   (paste the output into .env)
set -euo pipefail
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

hex() { openssl rand -hex 32; }
key() { openssl rand -base64 32; }
pw()  { openssl rand -base64 36 | tr -d '/+=' | cut -c1-40; }

cat <<OUT
POSTGRES_ADMIN_PASSWORD=$(pw)
POSTGRES_PASSWORD=$(pw)
APP_SECRET=$(hex)
SESSION_SECRET=$(hex)
ENCRYPTION_KEY=$(key)
TOTP_ENCRYPTION_KEY=$(key)
BACKUP_PASSPHRASE=$(pw)
OUT
