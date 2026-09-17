-- Local username + password sign-in.
--
-- 001_schema.sql created `users` with an email and a display name but no credentials,
-- because sign-in was left open. This adds the missing half.
--
-- Credential rules this schema encodes:
--   * `username` is the login handle and is case-insensitively unique.
--   * `password_hash` holds an scrypt digest with its own salt and parameters. The column
--     is wide and opaque on purpose: a rehash with stronger parameters must not need a migration.
--   * There is no password column. There never should be.
--   * `email` stays nullable — a user may sign up with a handle alone.

-- Must come before the citext column below.
CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE users
  ADD COLUMN username citext,
  ADD COLUMN password_hash text,
  ADD COLUMN password_updated_at timestamptz,
  ADD COLUMN failed_login_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;

ALTER TABLE users
  ADD CONSTRAINT users_username_key UNIQUE (username),
  ADD CONSTRAINT users_username_shape CHECK (
    username IS NULL OR (length(username) BETWEEN 3 AND 32 AND username ~ '^[a-zA-Z0-9_.-]+$')
  ),
  -- A row that can sign in must have both halves, or neither.
  ADD CONSTRAINT users_credentials_complete CHECK (
    (username IS NULL AND password_hash IS NULL) OR (username IS NOT NULL AND password_hash IS NOT NULL)
  );

COMMENT ON COLUMN users.password_hash IS 'scrypt digest: scrypt$N$r$p$salt_b64$hash_b64. Never a plaintext or reversible value.';
COMMENT ON COLUMN users.locked_until IS 'Set after repeated failed sign-ins; checked before any password comparison.';

-- Opaque server-side sessions. The browser only ever holds the random token.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  user_agent text
);

-- The raw token is never stored, so a leaked database dump cannot be replayed as a login.
COMMENT ON TABLE sessions IS 'One row per active sign-in. token_hash is sha256(token); the token itself exists only in the cookie.';

CREATE INDEX idx_sessions_user ON sessions (user_id, expires_at DESC);
CREATE INDEX idx_sessions_expiry ON sessions (expires_at);
