import os from "os";
import path from "path";

const APP_NAME = "ozrouter";

function fallbackHomeDir(): string {
  const envHome = process.env.HOME || process.env.USERPROFILE;
  return typeof envHome === "string" && envHome.trim() ? path.resolve(envHome) : os.tmpdir();
}

function safeHomeDir(): string {
  try {
    return os.homedir();
  } catch {
    return fallbackHomeDir();
  }
}

function normalizeConfiguredPath(dir: unknown): string | null {
  if (typeof dir !== "string") return null;
  const trimmed = dir.trim();
  if (!trimmed) return null;
  const homeDir = safeHomeDir();
  const expanded = trimmed
    .replace(/^~(?=$|[\\/])/, homeDir)
    .replace(/^\$HOME(?=$|[\\/])/, homeDir)
    .replace(/^\${HOME}(?=$|[\\/])/, homeDir);
  return path.resolve(expanded);
}

export function resolveMitmDataDir(): string {
  const configured = normalizeConfiguredPath(process.env.DATA_DIR);
  if (configured) return configured;

  const homeDir = safeHomeDir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return path.join(appData, APP_NAME);
  }

  const xdgConfigHome = normalizeConfiguredPath(process.env.XDG_CONFIG_HOME);
  if (xdgConfigHome) {
    return path.join(xdgConfigHome, APP_NAME);
  }

  return path.join(homeDir, `.${APP_NAME}`);
}
