-- Defence in depth for the credential column.
--
-- verifyPassword() rejects a malformed digest, but the database should not be able to hold
-- one either: a row whose password_hash is `scrypt$$$$$` decodes to an empty digest, and an
-- empty digest compared against an empty derived key is equal — every password would pass.
-- The gate is the application check; this constraint makes the bad row unstorable as well.

ALTER TABLE users
  ADD CONSTRAINT users_password_hash_shape CHECK (
    password_hash IS NULL OR password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9+/=]{16,}\$[A-Za-z0-9+/=]{43,}$'
  );
