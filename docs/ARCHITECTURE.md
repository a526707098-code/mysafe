# Architecture

## Goals, in priority order

1. Security 2. Data integrity 3. Reliable backup/restore 4. Ease of migration 5. UX 6. Visual polish

## Containers

```
                 host (VPS today, Proxmox VM/LXC later)
  ┌──────────────────────────────────────────────────────────────────┐
  │  private_vault_edge (bridge)                                     │
  │    private-vault-nginx  :8080 ── published on ${VAULT_BIND}      │
  │          │  (only container with a published port)               │
  │  ────────┼────────────── private_vault_network (internal: true) ─│
  │          ├── /         → private-vault-app  :3000  Next.js UI    │
  │          └── /api/*    → private-vault-api  :4000  Fastify API   │
  │                                   │                              │
  │                          private-vault-db  :5432  PostgreSQL 17  │
  └──────────────────────────────────────────────────────────────────┘
  State on disk (all inside /opt/private-vault):
    database/data   PostgreSQL cluster (dedicated to this project)
    uploads/        encrypted attachment blobs, random names
    backups/        encrypted backup archives
    .env            secrets (never in git, never in the DB)
```

* `private_vault_network` is `internal: true`: db, api and app have no route to the internet
  and cannot publish ports. Nginx is the only bridge.
* PostgreSQL has no `ports:` entry at all. The application role `private_vault_user` is not a
  superuser, owns only `private_vault`, and `PUBLIC` has no `CONNECT` on any other database
  (`database/init/01-app-role.sh`). Verified: connecting to `postgres` as the app role fails with
  "User does not have CONNECT privilege".
* All app containers run as non-root, `read_only: true`, `cap_drop: [ALL]`,
  `no-new-privileges`.

## Frontend (`app/frontend`)

Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind 4, Hebrew/RTL, dark only.

```
src/
  app/(auth)/        login, login/verify (TOTP), setup (first launch)
  app/(vault)/       dashboard, passwords, network, records, cards, documents,
                     favorites, activity, settings   ← all behind VaultShell
  components/ui/     primitives (button, input, dialog, confirm, tabs, toast…)
  components/vault/  product components (sidebar, mobile nav, global search,
                     SecretField / useSecret, password generator, icon tiles…)
  lib/api.ts         THE boundary to the backend (mock today, fetch() later)
  lib/vault-store.ts in-memory cache of NON-secret metadata, wiped on lock
  lib/session.tsx    stage (locked / awaiting-totp / unlocked) + idle auto-lock
  proxy.ts           per-request nonce CSP (no 'unsafe-inline' in production)
```

Rules the UI follows, so integration does not change behaviour:

* List/detail objects never contain decrypted secrets. A secret is fetched only through
  `api.revealSecret` / `api.copySecret`, which map to audited endpoints.
* A revealed value lives only in the `useSecret` hook's local state; it is dropped after
  `revealSeconds` (default 10), on unmount, and when the tab is hidden.
* Copy writes to the clipboard and schedules a best-effort clear after 30 s.
* Lock (button, idle timer) clears the store, the clipboard and routes to `/login`.
* No third-party requests: fonts are self-hosted, site avatars are letters (no favicon fetch
  that would leak the site list).

## Backend (`app/backend`)

Fastify 5 + TypeScript strict + Zod + `pg`.

```
src/config/env.ts          Zod-validated config; refuses to start on missing/placeholder secrets
src/crypto/encryption.ts   EncryptionService — the only place data is encrypted
src/crypto/key-provider.ts KeyProvider interface (env today, secret manager later)
src/db/migrate.ts          forward-only SQL migrations, checksummed, advisory-locked
migrations/0001_initial.sql
src/server.ts              boot: env → keys → migrations → listen; internal /api/health
```

Planned module layout as features land (repository → service → route):

```
src/modules/auth        login, TOTP, recovery codes, sessions, rate limiting
src/modules/items       shared CRUD, favorites, tags, trash, search
src/modules/passwords | network | records | cards | files
src/modules/audit       append-only writer (never receives plaintext)
src/modules/backup      status API; the work itself is scripts/backup.sh
```

### API surface (target)

| Method & path | Purpose | Audit |
|---|---|---|
| `POST /api/auth/setup` | first-launch account (only while no user exists) | |
| `POST /api/auth/login` | username + password → session in `pending_totp` | LOGIN_FAILED |
| `POST /api/auth/totp` · `/recovery` | second factor → session `active` | LOGIN_SUCCESS / LOGIN_FAILED |
| `POST /api/auth/logout` · `/lock` | revoke current session | LOGOUT |
| `GET/DELETE /api/sessions[/:id]` | list / revoke | SESSION_REVOKED |
| `GET/POST/PUT/DELETE /api/items/:kind[/:id]` | CRUD, metadata only in responses | RECORD_* |
| `POST /api/secrets/:kind/:id/reveal?purpose=view\|copy` | decrypt one value | PASSWORD_VIEWED / PASSWORD_COPIED / CARD_REVEALED |
| `POST /api/files` · `GET /api/files/:id` | upload / stream decrypted (inline, no-store) | FILE_UPLOADED / FILE_VIEWED |
| `GET /api/search?q=` | metadata search | — (query never logged) |
| `GET /api/trash` · `POST …/restore` · `DELETE …` | trash | RECORD_RESTORED / RECORD_PURGED |
| `GET /api/backups` · `POST /api/backups/run` | status, trigger | BACKUP_* |
| `POST /api/export` · `/api/import` | encrypted `.vault` package | EXPORT_CREATED / IMPORT_COMPLETED |

Every state-changing request requires: valid `active` session cookie, matching `Origin`
(`APP_ORIGIN`), `Content-Type: application/json` (or multipart for files) and an
`X-CSRF-Token` matching the session's CSRF hash.

## Data model

See `app/backend/migrations/0001_initial.sql`. Highlights:

* `items` is the shared base (title, category, favorite, encrypted notes, timestamps,
  `deleted_at` for Trash); `password_items`, `network_items`, `record_fields`, `card_items`
  and `files` hold section details.
* `*_enc` columns are `encrypted_value` (BYTEA envelope, see below). Plaintext columns are
  limited to metadata that must be searchable: titles, usernames, URLs, IPs, hostnames,
  MACs, tags, non-sensitive custom fields.
* `record_fields` enforces with a CHECK that a sensitive field has only `value_enc` and a
  normal field has only `value`.
* `audit_log` is append-only (trigger rejects UPDATE/DELETE) and stores item id + title at
  event time, never values.

## Encryption

`EncryptionService` (AES-256-GCM, random 96-bit IV, 128-bit tag). Envelope stored in one
column so the pieces can never get out of sync:

| offset | size | field |
|---|---|---|
| 0 | 1 | format version (1) |
| 1 | 2 | key version (uint16 BE) |
| 3 | 12 | IV |
| 15 | 16 | auth tag |
| 31 | n | ciphertext |

The AAD is `table.column:rowId`, so a ciphertext copied to another row/column fails
authentication. Key rotation: set the new key as `ENCRYPTION_KEY`, the old one as
`ENCRYPTION_KEY_PREVIOUS`, bump `ENCRYPTION_KEY_VERSION`; a job re-encrypts rows where
`needsRotation()` is true, after which the previous key is removed.

TOTP secrets use a separate key (`TOTP_ENCRYPTION_KEY`). Login passwords and recovery codes
are Argon2id hashes, never encrypted.

Files: each upload is validated (MIME, extension, magic bytes, size), images are re-encoded
to strip metadata/polyglots, then encrypted with the same service (AAD `files.blob:<id>`)
and written as `uploads/<random-id>.bin`. The original filename is encrypted metadata.
There is no static route to `uploads/`; files are only streamed by `GET /api/files/:id`.

## Search

Runs on plaintext metadata only (titles, usernames, URLs, device names, IPs, hostnames,
categories, tags, non-sensitive fields). Encrypted notes and secrets are not searchable by
design: a searchable index of them would be a second copy of the secret. Queries are never
logged (nginx logs `$uri` without the query string; the API logger redacts bodies).

## Development phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, structure, Docker, schema, encryption + env core, **UI prototype on mock data** | this PR |
| 2 | Auth: setup, Argon2id, TOTP + QR, recovery codes, sessions, CSRF, rate limiting, lockout | next |
| 3 | Items API per section, wiring `lib/api.ts` to it, audit writer | |
| 4 | Encrypted file storage + authenticated preview | |
| 5 | Trash purge job, export/import `.vault`, key rotation job | |
| 6 | `scripts/backup.sh` / `restore.sh`, retention 7/4/6, backup dashboard API | |
| 7 | Tests (unit + API + Playwright), security review, fix-all | |
