# Backups (design — implemented in phase 6)

Per the build plan, backup/restore is implemented last, once the data model is final.
This is the agreed design so nothing earlier contradicts it.

* `scripts/backup.sh [daily|weekly|monthly|manual]`
  1. `pg_dump -Fc` of `private_vault` from inside the db container
  2. tar of `uploads/` (already encrypted per file)
  3. disaster-recovery config: compose file, nginx config, migration list — **not** `.env`
     (it is backed up separately and offline, see SECURITY.md)
  4. each part encrypted with `age` (passphrase `BACKUP_PASSPHRASE`) or `openssl enc
     -aes-256-gcm -pbkdf2` as a fallback, plus a SHA-256 manifest
  5. written to `/opt/private-vault/backups/<kind>/YYYY-MM-DD_HHMM/`
  6. retention: 7 daily, 4 weekly, 6 monthly
  7. records `backup_runs` + `BACKUP_*` audit events
* `scripts/restore.sh <dir>` verifies the manifest, takes a safety backup of the current
  state, restores db + uploads, and runs migrations.
* Optional `scripts/backup-remote.sh` hook: rsync/SSH to a NAS or server, or `rclone` to
  S3-compatible storage. Archives are encrypted before they leave the host.
* Scheduling: a host cron/systemd timer calling `backup.sh` (no extra container needed).
