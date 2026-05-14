-- 044_drain_state.sql
-- Add connection draining settings and state.
-- Supports proactive quota-based drain and manual drain/undrain.

ALTER TABLE settings ADD COLUMN drain_threshold_percent INTEGER DEFAULT 90;
ALTER TABLE settings ADD COLUMN drained_connections TEXT DEFAULT '[]';
