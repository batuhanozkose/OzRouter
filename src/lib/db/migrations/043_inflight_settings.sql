-- 043_inflight_settings.sql
-- Add in-flight request tracking settings.
-- Global and per-provider max concurrent request limits
-- for overload protection and graceful shutdown.

INSERT OR IGNORE INTO key_value (namespace, key, value)
VALUES ('settings', 'inflight_max_global', '100');

INSERT OR IGNORE INTO key_value (namespace, key, value)
VALUES ('settings', 'inflight_max_per_provider', '20');
