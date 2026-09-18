-- An address to reach a person at, and a second factor for signing in.
--
-- 003_auth.sql deliberately built accounts with no email: a school leaver does not need one
-- to plan an admission, and not collecting a thing is the strongest way to protect it. That
-- holds until the product wants to send something, which it now does, so the address is
-- OPTIONAL and every feature that uses it degrades without it.
--
-- The address is stored encrypted (server/crypto.js, context 'users.email'), not in the
-- plaintext `email` column 001_schema.sql declared and nothing ever wrote. Nothing looks a
-- user up by address, so no blind index is needed — and a deterministic index over an email
-- would tell anyone reading the table which accounts share a domain.

ALTER TABLE users
  ADD COLUMN email_cipher text,
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN notify_by_email boolean NOT NULL DEFAULT false,
  -- The last day a digest went out, in the user's own timezone. One a day, at most.
  ADD COLUMN digest_sent_on date;

COMMENT ON COLUMN users.email_cipher IS 'Encrypted with context users.email. Optional; null means no mail is ever sent.';

-- Two-factor codes, and the same codes used to prove an address belongs to whoever typed it.
--
-- The code itself is NEVER stored. Only its sha256, exactly as sessions.token_hash works:
-- a dump of this table must not let anyone finish a login. `token` is what the client holds
-- between the two halves of the sign-in; it is unguessable and useless on its own.
CREATE TABLE login_challenges (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('login', 'verify_email')),
  code_hash text NOT NULL,
  -- Where to send it. For 'verify_email' this is the address being proved, which is not yet
  -- on the account; for 'login' it is a copy of the account's address at that moment.
  email_cipher text NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_challenges_user ON login_challenges (user_id, purpose, created_at DESC);
CREATE INDEX idx_login_challenges_expiry ON login_challenges (expires_at);

COMMENT ON TABLE login_challenges IS
  'Short-lived one-time codes. Only the sha256 of the code is stored, never the code.';
