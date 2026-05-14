-- 042_bootstrap_token.sql
-- Add bootstrap_token_hash column to settings for first-run security.
-- Stores a hashed one-time token that must be provided during initial setup
-- when accessing OzRouter remotely for the first time.

ALTER TABLE settings ADD COLUMN bootstrap_token_hash TEXT DEFAULT NULL;
