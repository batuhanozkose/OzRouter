/**
 * Playwright Test Runner Helpers
 *
 * Utility functions for running Next.js + Playwright E2E tests:
 *   - Backup directory resolution for app/ dir
 *   - Webpack vs Turbopack mode detection
 *   - Standalone build asset synchronization
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// ── Backup Directory Resolution ─────────────────────────────────────────────

/**
 * Resolve the backup directory path for the app/ folder during Playwright runs.
 * If a base backup already exists, generates a per-run unique path to avoid collisions.
 *
 * @param {Object} opts
 * @param {string} opts.cwd - Project root directory
 * @param {boolean} opts.baseBackupExists - Whether app.__qa_backup already exists
 * @param {boolean} opts.appDirExists - Whether the app/ directory exists
 * @param {number} opts.pid - Process ID for unique suffix
 * @param {number} opts.now - Timestamp for unique suffix
 * @returns {string} Resolved backup directory path
 */
export function resolvePlaywrightAppBackupDir({ cwd, baseBackupExists, appDirExists, pid, now }) {
  const base = path.join(cwd, "app.__qa_backup");
  if (!appDirExists) return base;
  if (!baseBackupExists) return base;
  return `${base}.${pid}.${now}`;
}

// ── Webpack Mode Detection ──────────────────────────────────────────────────

/**
 * Determine whether Playwright dev mode should use webpack instead of Turbopack.
 * Only opts into webpack when running in dev mode AND turbopack is explicitly disabled.
 *
 * @param {Object} opts
 * @param {"dev"|"start"} opts.mode - Run mode
 * @param {Record<string, string>} opts.env - Environment variables
 * @returns {boolean} true if webpack should be used
 */
export function shouldUseWebpackForPlaywrightDev({ mode, env }) {
  if (mode !== "dev") return false;
  return env.OZROUTER_USE_TURBOPACK === "0";
}

// ── Standalone Asset Sync ───────────────────────────────────────────────────

/**
 * Check if standalone build static assets need synchronization.
 * Returns true if the standalone server exists but static assets are missing.
 *
 * @param {Object} opts
 * @param {string} opts.standaloneServerPath - Path to standalone server.js
 * @param {string} opts.rootStaticDirPath - Path to .next/static/
 * @param {string} opts.standaloneStaticDirPath - Path to .next/standalone/.next/static/
 * @returns {boolean}
 */
export function standaloneAssetsNeedSync({
  standaloneServerPath,
  rootStaticDirPath,
  standaloneStaticDirPath,
}) {
  if (!fs.existsSync(standaloneServerPath)) return false;
  if (!fs.existsSync(rootStaticDirPath)) return false;
  if (!fs.existsSync(standaloneStaticDirPath)) return true;

  // Check if any files differ
  const rootFiles = fs.readdirSync(rootStaticDirPath);
  const standaloneFiles = new Set(
    fs.existsSync(standaloneStaticDirPath) ? fs.readdirSync(standaloneStaticDirPath) : []
  );
  return rootFiles.some((f) => !standaloneFiles.has(f));
}

/**
 * Synchronize standalone build assets from the root build output.
 * Copies .next/static/ and public/ into the standalone directory.
 *
 * @param {Object} opts
 * @param {string} opts.standaloneServerPath
 * @param {string} opts.rootStaticDirPath
 * @param {string} opts.standaloneStaticDirPath
 * @param {string} opts.rootPublicDirPath
 * @param {string} opts.standalonePublicDirPath
 * @param {{ log(msg: string): void }} [opts.log] - Logger
 * @returns {boolean} Whether any files were synced
 */
export function syncStandaloneRuntimeAssets({
  standaloneServerPath,
  rootStaticDirPath,
  standaloneStaticDirPath,
  rootPublicDirPath,
  standalonePublicDirPath,
  log,
}) {
  if (!fs.existsSync(standaloneServerPath)) return false;

  let changed = false;

  // Sync static assets
  if (fs.existsSync(rootStaticDirPath)) {
    fs.mkdirSync(standaloneStaticDirPath, { recursive: true });
    for (const file of fs.readdirSync(rootStaticDirPath)) {
      const src = path.join(rootStaticDirPath, file);
      const dest = path.join(standaloneStaticDirPath, file);
      fs.copyFileSync(src, dest);
      changed = true;
    }
  }

  // Sync public assets
  if (rootPublicDirPath && fs.existsSync(rootPublicDirPath)) {
    fs.mkdirSync(standalonePublicDirPath, { recursive: true });
    for (const file of fs.readdirSync(rootPublicDirPath)) {
      const src = path.join(rootPublicDirPath, file);
      const dest = path.join(standalonePublicDirPath, file);
      fs.copyFileSync(src, dest);
      changed = true;
    }
  }

  if (changed && log) {
    log.log("Rehydrated standalone static/public assets into standalone build");
  }

  return changed;
}
