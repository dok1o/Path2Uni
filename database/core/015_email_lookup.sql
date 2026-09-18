-- Signing in with an address means finding a row by it, and the address is encrypted with a
-- random IV per value, so `where email_cipher = $1` can never match. That is what
-- server/crypto.js blindIndex() exists for: a keyed HMAC in a companion column, deterministic
-- by necessity.
--
-- What it costs, stated plainly: two accounts with the same address produce the same index,
-- so this column reveals which rows share an address. That is unavoidable for a unique
-- constraint on an encrypted value, and it is the whole reason blindIndex has its own key,
-- separate from the encryption key. An attacker holding only the dump learns which accounts
-- share an address and nothing about what it is.

ALTER TABLE users ADD COLUMN email_index text;

CREATE UNIQUE INDEX idx_users_email_index ON users (email_index) WHERE email_index IS NOT NULL;

COMMENT ON COLUMN users.email_index IS
  'Keyed HMAC of the lowercased address (server/crypto.js blindIndex, key P2U_INDEX_KEY). For lookup and uniqueness only; it is not reversible and is not the address.';
