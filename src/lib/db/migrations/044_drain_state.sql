-- 044_drain_state.sql
-- Add connection draining settings and state.
-- Supports proactive quota-based drain and manual drain/undrain.

INSERT OR IGNORE INTO key_value (namespace, key, value)
VALUES ('settings', 'drain_threshold_percent', '90');

INSERT OR IGNORE INTO key_value (namespace, key, value)
VALUES ('settings', 'drained_connections', '[]');
