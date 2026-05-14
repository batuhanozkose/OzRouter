-- 042_bootstrap_token.sql
-- Bootstrap token state is stored in key_value under namespace='settings'.
-- Stores a hashed one-time token that must be provided during initial setup
-- when accessing OzRouter remotely for the first time.

-- No default row is needed: absence of bootstrap_token_hash means no token exists.
SELECT 1;
