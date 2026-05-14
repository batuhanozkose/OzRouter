/**
 * In-Flight Request Tracker
 *
 * Tracks active concurrent requests globally and per-provider.
 * Provides overload protection (503 when limits exceeded) and
 * graceful shutdown support (wait for all inflight to complete).
 *
 * Limits are configurable via Dashboard Settings → DB-persisted.
 */

// ── State ────────────────────────────────────────────────────────────────

let globalCount = 0;
const perProviderCount = new Map<string, number>();

// Default limits (used when DB is not available or not yet initialized)
let maxGlobal = 100;
let maxPerProvider = 20;

// Drain waiters for graceful shutdown
const drainWaiters: Array<() => void> = [];

/**
 * Update limits from settings. Call on startup and when settings change.
 */
export function updateLimits(global: number, perProvider: number): void {
  maxGlobal = global > 0 ? global : 100;
  maxPerProvider = perProvider > 0 ? perProvider : 20;
}

/**
 * Try to acquire a slot for a new request.
 * Returns true if the request can proceed, false if limits exceeded.
 */
export function acquire(provider: string): boolean {
  // Check global limit
  if (globalCount >= maxGlobal) {
    return false;
  }

  // Check per-provider limit
  const providerCurrent = perProviderCount.get(provider) || 0;
  if (providerCurrent >= maxPerProvider) {
    return false;
  }

  // Acquire slot
  globalCount++;
  perProviderCount.set(provider, providerCurrent + 1);
  return true;
}

/**
 * Release a slot when a request completes (success or error).
 * MUST be called in a finally block after acquire().
 */
export function release(provider: string): void {
  globalCount = Math.max(0, globalCount - 1);

  const current = perProviderCount.get(provider) || 0;
  if (current <= 1) {
    perProviderCount.delete(provider);
  } else {
    perProviderCount.set(provider, current - 1);
  }

  // Notify drain waiters if all inflight completed
  if (globalCount === 0 && drainWaiters.length > 0) {
    const waiters = drainWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }
}

/**
 * Get current inflight statistics.
 */
export function getStats(): {
  global: number;
  perProvider: Record<string, number>;
  limits: { global: number; perProvider: number };
} {
  const providers: Record<string, number> = {};
  for (const [provider, count] of perProviderCount) {
    providers[provider] = count;
  }
  return {
    global: globalCount,
    perProvider: providers,
    limits: { global: maxGlobal, perProvider: maxPerProvider },
  };
}

/**
 * Get current global inflight count.
 */
export function getGlobalCount(): number {
  return globalCount;
}

/**
 * Get inflight count for a specific provider.
 */
export function getProviderCount(provider: string): number {
  return perProviderCount.get(provider) || 0;
}

/**
 * Get current limits.
 */
export function getLimits(): { global: number; perProvider: number } {
  return { global: maxGlobal, perProvider: maxPerProvider };
}

/**
 * Wait for all in-flight requests to complete (graceful shutdown).
 * Resolves immediately if no requests are in-flight.
 *
 * @param timeoutMs - Maximum wait time before resolving anyway (default: 30000ms)
 */
export function waitForDrain(timeoutMs = 30000): Promise<void> {
  if (globalCount === 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      // Remove from waiters and resolve on timeout
      const idx = drainWaiters.indexOf(resolve);
      if (idx >= 0) drainWaiters.splice(idx, 1);
      resolve();
    }, timeoutMs);

    // Clear timeout when resolved normally
    const wrappedResolve = () => {
      clearTimeout(timer);
      resolve();
    };

    drainWaiters.push(wrappedResolve);
  });
}

/**
 * Reset all counters (for testing only).
 */
export function _resetForTesting(): void {
  globalCount = 0;
  perProviderCount.clear();
  drainWaiters.splice(0);
  maxGlobal = 100;
  maxPerProvider = 20;
}
