-- 041_combo_strategy_tracking.sql
-- Add combo_strategy column to usage_history for proper strategy tracking per combo request.
-- Previously only tracked in-memory via comboMetrics.ts (reset on restart).
-- This enables persistent analytics on which routing strategies drive actual usage.

ALTER TABLE usage_history ADD COLUMN combo_strategy TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_uh_combo_strategy ON usage_history(combo_strategy);
