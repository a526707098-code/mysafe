-- PRIVATE VAULT — initial schema.
--
-- Conventions
--   * Columns ending in _enc are AES-256-GCM envelopes produced by
--     EncryptionService (format | key version | IV | tag | ciphertext). The
--     encryption keys never live in this database.
--   * Plaintext columns hold only NON-sensitive metadata that must be
--     searchable (titles, usernames, URLs, IPs, hostnames, tags).
--   * Login passwords and recovery codes are Argon2id hashes, never encrypted.
--   * deleted_at marks soft-deleted rows (Trash); a job purges them after
--     TRASH_RETENTION_DAYS, which also removes encrypted files from disk.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;

-- Envelope sanity: header alone is 31 bytes.
CREATE DOMAIN encrypted_value AS bytea CHECK (VALUE IS NULL OR octet_length(VALUE) >= 31);

-- ---------------------------------------------------------------- identity

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username         citext NOT NULL UNIQUE CHECK (char_length(username) BETWEEN 3 AND 32),
  password_hash    text NOT NULL,                       -- Argon2id PHC string
  totp_secret_enc  encrypted_value,                     -- encrypted with TOTP_ENCRYPTION_KEY
  totp_enabled_at  timestamptz,                         -- NULL until the first code verified
  failed_logins    integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recovery_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,                            -- Argon2id
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_codes_user ON recovery_codes(user_id) WHERE used_at IS NULL;

CREATE TABLE sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      bytea NOT NULL UNIQUE,                -- SHA-256 of the cookie value
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'pending_totp' after the password step, 'active' after TOTP.
  stage           text NOT NULL CHECK (stage IN ('pending_totp', 'active')),
  csrf_hash       bytea NOT NULL,
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,                 -- absolute expiry
  revoked_at      timestamptz
);
CREATE INDEX sessions_user_active ON sessions(user_id) WHERE revoked_at IS NULL;

CREATE TABLE login_attempts (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  ip          inet,
  username    citext,
  success     boolean NOT NULL,
  stage       text NOT NULL CHECK (stage IN ('password', 'totp', 'recovery'))
);
CREATE INDEX login_attempts_ip_at ON login_attempts(ip, at DESC);
CREATE INDEX login_attempts_user_at ON login_attempts(username, at DESC);

-- ---------------------------------------------------------------- taxonomy

CREATE TABLE categories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  icon         text NOT NULL DEFAULT 'folder',
  color        text,
  description  text,
  section      text NOT NULL DEFAULT 'all'
               CHECK (section IN ('all', 'passwords', 'network', 'records', 'cards', 'documents')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, section)
);

CREATE TABLE tags (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  citext NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 40)
);

-- ---------------------------------------------------------------- items
-- One base table keeps favorites, tags, trash, search and audit references
-- uniform across sections; each section adds a 1:1 detail table.

CREATE TABLE items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('password', 'network', 'record', 'card', 'document')),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  category_id  uuid REFERENCES categories(id) ON DELETE SET NULL,
  favorite     boolean NOT NULL DEFAULT false,
  notes_enc    encrypted_value,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX items_kind_live ON items(kind, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX items_favorite ON items(updated_at DESC) WHERE favorite AND deleted_at IS NULL;
CREATE INDEX items_trash ON items(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX items_title_search ON items USING gin (to_tsvector('simple', title));

CREATE TABLE item_tags (
  item_id  uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id   uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE password_items (
  item_id       uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  website_name  text,
  url           text,
  username      text,
  password_enc  encrypted_value NOT NULL,
  strength      text CHECK (strength IN ('weak', 'fair', 'strong'))
);

CREATE TABLE network_items (
  item_id         uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  device_type     text NOT NULL CHECK (device_type IN
                  ('Router','Switch','NAS','Server','VM','Access Point','Printer','Camera','UPS','Other')),
  ip              inet,
  hostname        text,
  management_url  text,
  port            integer CHECK (port BETWEEN 1 AND 65535),
  username        text,
  password_enc    encrypted_value,
  location        text,
  mac             macaddr,
  vlan            text
);
CREATE INDEX network_items_ip ON network_items(ip);

CREATE TABLE record_fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  sensitive   boolean NOT NULL DEFAULT false,
  value       text,                                     -- only when NOT sensitive
  value_enc   encrypted_value,                          -- only when sensitive
  CHECK ((sensitive AND value IS NULL) OR (NOT sensitive AND value_enc IS NULL))
);
CREATE INDEX record_fields_item ON record_fields(item_id, position);

CREATE TABLE card_items (
  item_id      uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  holder       text,
  issuer       text,
  brand        text,
  last4        char(4) CHECK (last4 ~ '^[0-9]{4}$'),
  number_enc   encrypted_value NOT NULL,                -- full PAN, always encrypted
  expiry_enc   encrypted_value,
  -- Present only if ALLOW_CVV_STORAGE=true; the API refuses writes otherwise.
  cvv_enc      encrypted_value,
  gradient     text
);

CREATE TABLE files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid REFERENCES items(id) ON DELETE SET NULL,   -- the document item, if any
  related_item_id uuid REFERENCES items(id) ON DELETE SET NULL,   -- attachment target
  storage_name    text NOT NULL UNIQUE,                 -- random, server-generated
  mime            text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes      bigint NOT NULL CHECK (size_bytes > 0),
  sha256          bytea NOT NULL,                       -- of the plaintext, for integrity checks
  original_name_enc encrypted_value,                    -- original filename, encrypted
  description_enc encrypted_value,
  key_version     integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX files_related ON files(related_item_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- audit

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  event_type  text NOT NULL CHECK (event_type IN (
                'LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','PASSWORD_VIEWED','PASSWORD_COPIED',
                'RECORD_CREATED','RECORD_UPDATED','RECORD_DELETED','RECORD_RESTORED','RECORD_PURGED',
                'FILE_VIEWED','FILE_UPLOADED','CARD_REVEALED','BACKUP_STARTED','BACKUP_SUCCESS',
                'BACKUP_FAILED','2FA_CHANGED','SESSION_REVOKED','EXPORT_CREATED','IMPORT_COMPLETED')),
  item_id     uuid,                                     -- no FK: history outlives purged items
  item_label  text,                                     -- title at event time, never a secret
  ip          inet,
  user_agent  text,
  user_id     uuid,
  session_id  uuid
);
CREATE INDEX audit_log_at ON audit_log(at DESC);
CREATE INDEX audit_log_type_at ON audit_log(event_type, at DESC);

-- The application role may append to the audit log but never rewrite it.
-- (Grants are applied by database/init; this trigger enforces it for everyone.)
CREATE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- ---------------------------------------------------------------- operations

CREATE TABLE backup_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('daily', 'weekly', 'monthly', 'manual')),
  status       text NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  db_bytes     bigint,
  files_bytes  bigint,
  error        text                                     -- operator-facing, no secrets
);

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
