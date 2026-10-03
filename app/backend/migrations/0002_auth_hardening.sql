-- Phase 2: authentication hardening.
--   * single master account: a unique index on a constant allows at most one row.
--   * totp_last_step blocks replay of a TOTP code within its validity window.
--   * login_attempts gets 'setup' bookkeeping via existing stages; no change needed.

CREATE UNIQUE INDEX users_single_master ON users ((true));

ALTER TABLE users ADD COLUMN totp_last_step bigint;
ALTER TABLE users ADD COLUMN password_changed_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX sessions_expires ON sessions(expires_at);
