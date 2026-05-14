/**
 * Bootstrap Token — First-Run Security
 *
 * On first startup (no password configured), generates a one-time token
 * and logs it to console. Remote clients must provide this token + a new
 * password to complete setup. Localhost access bypasses token requirement.
 *
 * Flow:
 * 1. Server starts → no password set → generateBootstrapToken() → log token
 * 2. Remote user → POST /api/setup { token, password } → validate → set password → clear token
 * 3. Local user → POST /api/setup { password } → set password directly (no token needed)
 */

import crypto from "node:crypto";
import { getSettings, updateSettings } from "@/lib/db/settings";

type JsonRecord = Record<string, unknown>;

// In-memory cache of the raw token (only available during the process that generated it)
let _currentBootstrapToken: string | null = null;

/**
 * Generate a bootstrap token and store its hash in the DB.
 * Returns the raw token (shown to user once via console).
 * Only generates if no password is set and no token exists.
 */
export function generateBootstrapToken(): string | null {
  const settings = getSettings() as JsonRecord;

  // Don't generate if setup is already complete (password is set)
  if (settings.password && typeof settings.password === "string" && settings.password.length > 0) {
    return null;
  }

  // Don't generate if a token already exists (from a previous start)
  if (
    settings.bootstrap_token_hash &&
    typeof settings.bootstrap_token_hash === "string" &&
    settings.bootstrap_token_hash.length > 0
  ) {
    // Return cached token if we generated it in this process
    return _currentBootstrapToken;
  }

  // Generate new token
  const token = crypto.randomUUID();
  const hash = hashToken(token);

  updateSettings({ bootstrap_token_hash: hash });
  _currentBootstrapToken = token;

  return token;
}

/**
 * Validate a bootstrap token against the stored hash.
 */
export function validateBootstrapToken(token: string): boolean {
  if (!token || typeof token !== "string") return false;

  const settings = getSettings() as JsonRecord;
  const storedHash = settings.bootstrap_token_hash;

  if (!storedHash || typeof storedHash !== "string") return false;

  const inputHash = hashToken(token);
  return timingSafeEqual(storedHash, inputHash);
}

/**
 * Clear the bootstrap token after successful setup.
 */
export function clearBootstrapToken(): void {
  updateSettings({ bootstrap_token_hash: null });
  _currentBootstrapToken = null;
}

/**
 * Check if bootstrap setup is required (no password set).
 */
export function isBootstrapRequired(): boolean {
  const settings = getSettings() as JsonRecord;
  // Bootstrap required if no password is set
  return (
    !settings.password || typeof settings.password !== "string" || settings.password.length === 0
  );
}

/**
 * Check if a bootstrap token exists in the DB.
 */
export function hasBootstrapToken(): boolean {
  const settings = getSettings() as JsonRecord;
  return (
    typeof settings.bootstrap_token_hash === "string" && settings.bootstrap_token_hash.length > 0
  );
}

/**
 * Check if the request originates from localhost.
 * Localhost requests can skip bootstrap token validation.
 */
export function isLocalRequest(req: Request): boolean {
  // Check various headers that indicate the client IP
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");

  // If behind a proxy, check forwarded headers
  const clientIp = forwarded?.split(",")[0]?.trim() || realIp || "";

  return isLocalAddress(clientIp);
}

/**
 * Check if an IP address is a local/loopback address.
 */
export function isLocalAddress(ip: string): boolean {
  if (!ip) return true; // No IP = direct connection = local
  const normalized = ip.trim().toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.")
  );
}

/**
 * Log the bootstrap token to console with a visible banner.
 * Called once during server startup.
 */
export function logBootstrapToken(
  token: string,
  logger?: { warn: (...args: unknown[]) => void }
): void {
  const banner = [
    "",
    "============================================",
    "  OzRouter Bootstrap Token (first-run):",
    `  ${token}`,
    "============================================",
    "  Use this token to set your password when",
    "  accessing the dashboard remotely.",
    "  Local access (localhost) does not require",
    "  this token.",
    "============================================",
    "",
  ].join("\n");

  if (logger?.warn) {
    logger.warn(banner);
  } else {
    console.warn(banner);
  }
}

// ── Internal Helpers ──────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}
