# Moving the vault (another server, Proxmox VM or LXC)

Everything the vault needs is inside the project directory:

| What | Where |
|---|---|
| Code + compose + nginx config | `/opt/private-vault/` |
| Secrets (incl. encryption keys) | `/opt/private-vault/.env` |
| Database (users, 2FA, items, audit history) | `database/data/` (or a `pg_dump` backup) |
| Encrypted attachments | `uploads/` |
| Encrypted backups | `backups/` |

Account, TOTP configuration and audit history are rows in the database, so they move with it.
Attachments are useless without the same `ENCRYPTION_KEY`, so `.env` must travel too.

## Preferred: via backup (works across PostgreSQL versions)

```bash
# old host
cd /opt/private-vault && ./scripts/backup.sh manual          # phase 6
# copy the newest archive + .env to the new host, then on the new host:
git clone <repo> /opt/private-vault && cd /opt/private-vault
cp /path/to/.env .env
./scripts/restore.sh backups/<archive>                         # phase 6
docker compose up -d
```

## Quick: cold copy (same PostgreSQL major version)

```bash
# old host
cd /opt/private-vault && docker compose down
sudo tar --numeric-owner -czpf /tmp/private-vault.tgz -C /opt private-vault
# new host
sudo tar --numeric-owner -xzpf private-vault.tgz -C /opt
cd /opt/private-vault && docker compose up -d
```

Never copy `database/data` while the stack is running.

## Proxmox VM

Any Debian 12/13 or Ubuntu 24.04 VM: install Docker Engine + compose plugin, then follow
either method above. 2 vCPU / 2 GB RAM / 20 GB disk is plenty.

## Proxmox LXC

Use an unprivileged Debian container with **nesting** enabled (Options → Features →
`nesting=1`, and `keyctl=1` if Docker complains). Install Docker inside, then restore as
above. With the cold-copy method, keep `--numeric-owner`; unprivileged LXC maps uids
(+100000) and the PostgreSQL data dir must stay owned by uid 70 *inside* the container.
If in doubt, use the backup/restore method, which has no uid concerns.

## After moving

* Update `APP_ORIGIN` if the hostname changed.
* Check `docker compose ps` (all healthy) and log in (password + TOTP).
* Verify a document preview opens (proves `ENCRYPTION_KEY` matches).
