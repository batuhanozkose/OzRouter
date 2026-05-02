#!/usr/bin/env node

/**
 * Healthcheck script for OzRouter.
 * Checks the /api/monitoring/health endpoint on the dashboard port.
 */
const port = process.env.DASHBOARD_PORT || process.env.PORT || "20128";

fetch(`http://127.0.0.1:${port}/api/monitoring/health`)
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  })
  .catch(() => process.exit(1));
