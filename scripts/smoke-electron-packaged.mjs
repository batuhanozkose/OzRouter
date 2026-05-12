/**
 * Electron Smoke Test Helpers
 *
 * Utility functions used by the packaged Electron smoke test to:
 *   1. Discover the correct executable name per platform.
 *   2. Build a sandboxed environment for the smoke run.
 *   3. Detect fatal Electron startup log patterns.
 */

import path from "node:path";

// ── Executable Names ────────────────────────────────────────────────────────

export const LINUX_EXECUTABLE_NAMES = ["ozrouter-desktop", "OzRouter"];

export const MAC_EXECUTABLE_NAMES = ["OzRouter.app"];

export const WIN_EXECUTABLE_NAMES = ["OzRouter.exe", "ozrouter-desktop.exe"];

// ── Environment Builder ─────────────────────────────────────────────────────

/**
 * Secrets that must never leak into the smoke-test child process.
 */
const SECRET_ENV_KEYS = [
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "SNYK_TOKEN",
  "NPM_TOKEN",
  "ELECTRON_BUILDER_TOKEN",
  "AWS_SECRET_ACCESS_KEY",
  "AZURE_CLIENT_SECRET",
];

/**
 * Parent env keys that are safe to forward (platform-dependent allowlist).
 */
const ALLOWED_PARENT_KEYS = [
  "DISPLAY",
  "PATH",
  "LANG",
  "TERM",
  "WAYLAND_DISPLAY",
  "XDG_RUNTIME_DIR",
];

/**
 * Build a sandboxed environment for running the packaged Electron app.
 *
 * @param {Object} opts
 * @param {"linux"|"darwin"|"win32"} opts.currentPlatform
 * @param {string} opts.dataDir - Isolated data directory for the smoke run
 * @param {Record<string, string>} [opts.parentEnv] - Parent process env (defaults to process.env)
 * @returns {Record<string, string>}
 */
export function buildSmokeEnv({ currentPlatform, dataDir, parentEnv = {} }) {
  const env = {};

  // Forward allowlisted parent variables
  for (const key of ALLOWED_PARENT_KEYS) {
    if (parentEnv[key] != null) {
      env[key] = parentEnv[key];
    }
  }

  // Core OzRouter env
  env.DATA_DIR = dataDir;
  env.NODE_ENV = "production";
  env.ELECTRON_ENABLE_LOGGING = "1";
  env.ELECTRON_ENABLE_STACK_DUMPING = "1";

  // Platform-specific sandbox paths
  if (currentPlatform === "linux" || currentPlatform === "darwin") {
    env.HOME = path.join(dataDir, "home");
    env.XDG_CONFIG_HOME = path.join(dataDir, "config");
  }

  // Explicitly strip secrets (safety net even if they weren't in parentEnv)
  for (const key of SECRET_ENV_KEYS) {
    delete env[key];
  }

  return env;
}

// ── Fatal Log Patterns ──────────────────────────────────────────────────────

/**
 * Patterns that indicate a fatal Electron startup error.
 * If any line from the child process matches, the smoke test should fail.
 */
export const FATAL_LOG_PATTERNS = [
  /\[Electron\]\s*Unhandled Rejection/i,
  /\[Electron\]\s*Uncaught Exception/i,
  /\[Electron\]\s*Fatal error/i,
  /GPU process isn't usable/i,
  /FATAL ERROR:/,
  /Segmentation fault/,
  /\bSIGSEGV\b/,
  /\bSIGABRT\b/,
];
