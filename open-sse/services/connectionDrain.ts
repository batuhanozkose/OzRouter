/**
 * Connection Drain Manager
 *
 * Proactive capacity protection: drains connections when quota usage
 * exceeds a configurable threshold. Drained connections are skipped
 * during combo routing, and periodically probed for recovery.
 *
 * Drain triggers:
 * - Automatic: quota usage >= threshold% (default 90%)
 * - Manual: dashboard override (drain/undrain)
 *
 * Recovery:
 * - Periodic probe checks if quota has reset
 * - Manual undrain via dashboard
 */

export interface DrainState {
  connectionId: string;
  drainedAt: number;
  reason: "quota" | "manual" | "error";
  probeCount: number;
  lastProbeAt: number;
}

// ── In-memory State ───────────────────────────────────────────────────────

const drainedConnections = new Map<string, DrainState>();
let drainThreshold = 90;

// Probe timer handle
let probeInterval: ReturnType<typeof setInterval> | null = null;
const PROBE_INTERVAL_MS = 60_000; // Check every 60 seconds

// Probe callback — set by consumer (combo routing) to test if connection recovered
let probeCallback: ((connectionId: string) => Promise<boolean>) | null = null;

/**
 * Set the probe callback function.
 * Called during probe checks to test if a drained connection has recovered.
 * Should return true if the connection is healthy, false if still drained.
 */
export function setProbeCallback(cb: (connectionId: string) => Promise<boolean>): void {
  probeCallback = cb;
}

/**
 * Update drain threshold from settings.
 */
export function updateThreshold(percent: number): void {
  drainThreshold = percent > 0 && percent <= 100 ? percent : 90;
}

/**
 * Get current drain threshold.
 */
export function getThreshold(): number {
  return drainThreshold;
}

/**
 * Drain a connection (mark as unavailable for new requests).
 */
export function drainConnection(
  connectionId: string,
  reason: "quota" | "manual" | "error" = "manual"
): void {
  if (drainedConnections.has(connectionId)) return;

  const state: DrainState = {
    connectionId,
    drainedAt: Date.now(),
    reason,
    probeCount: 0,
    lastProbeAt: 0,
  };

  drainedConnections.set(connectionId, state);
}

/**
 * Undrain a connection (restore to active pool).
 */
export function undrainConnection(connectionId: string): void {
  drainedConnections.delete(connectionId);
}

/**
 * Check if a connection is currently drained.
 */
export function isDrained(connectionId: string): boolean {
  return drainedConnections.has(connectionId);
}

/**
 * Get all drained connections.
 */
export function getDrainedConnections(): DrainState[] {
  return Array.from(drainedConnections.values());
}

/**
 * Get drain state for a specific connection.
 */
export function getDrainState(connectionId: string): DrainState | undefined {
  return drainedConnections.get(connectionId);
}

/**
 * Check if a connection should be auto-drained based on quota usage.
 * Returns true if the connection was drained.
 */
export function checkQuotaDrain(
  connectionId: string,
  usagePercent: number,
  threshold?: number
): boolean {
  const effectiveThreshold = threshold ?? drainThreshold;

  if (usagePercent >= effectiveThreshold && !isDrained(connectionId)) {
    drainConnection(connectionId, "quota");
    return true;
  }

  return false;
}

/**
 * Start the periodic probe timer.
 */
export function startProbeTimer(): void {
  if (probeInterval) return;

  probeInterval = setInterval(async () => {
    if (!probeCallback) return;

    for (const [connectionId, state] of drainedConnections) {
      // Only probe quota-drained connections (manual drains need manual undrain)
      if (state.reason !== "quota") continue;

      try {
        state.probeCount++;
        state.lastProbeAt = Date.now();

        const recovered = await probeCallback(connectionId);
        if (recovered) {
          undrainConnection(connectionId);
        }
      } catch {
        // Probe failed — connection still drained
      }
    }
  }, PROBE_INTERVAL_MS);

  // Don't prevent process exit
  if (probeInterval.unref) {
    probeInterval.unref();
  }
}

/**
 * Stop the probe timer.
 */
export function stopProbeTimer(): void {
  if (probeInterval) {
    clearInterval(probeInterval);
    probeInterval = null;
  }
}

/**
 * Load drained connections from persisted state (JSON array).
 */
export function loadFromPersisted(json: string): void {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      for (const state of parsed) {
        if (state && typeof state.connectionId === "string") {
          drainedConnections.set(state.connectionId, {
            connectionId: state.connectionId,
            drainedAt: state.drainedAt || Date.now(),
            reason: state.reason || "manual",
            probeCount: state.probeCount || 0,
            lastProbeAt: state.lastProbeAt || 0,
          });
        }
      }
    }
  } catch {
    // Invalid JSON — ignore
  }
}

/**
 * Serialize current drain state for persistence.
 */
export function serializeToPersist(): string {
  return JSON.stringify(getDrainedConnections());
}

/**
 * Reset all state (for testing).
 */
export function _resetForTesting(): void {
  drainedConnections.clear();
  drainThreshold = 90;
  stopProbeTimer();
  probeCallback = null;
}
