-- 043_inflight_settings.sql
-- Add in-flight request tracking settings.
-- Global and per-provider max concurrent request limits
-- for overload protection and graceful shutdown.

ALTER TABLE settings ADD COLUMN inflight_max_global INTEGER DEFAULT 100;
ALTER TABLE settings ADD COLUMN inflight_max_per_provider INTEGER DEFAULT 20;
