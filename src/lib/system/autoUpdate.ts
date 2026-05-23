import { execFile, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type AutoUpdateMode = "source";

type ExecFileLike = typeof execFileAsync;
type SpawnLike = typeof spawn;

export type AutoUpdateConfig = {
  mode: AutoUpdateMode;
  repoDir: string;
  gitRemote: string;
  patchCommits: string[];
  logPath: string;
  pm2ProcessName: string;
};

export type AutoUpdateValidation = {
  supported: boolean;
  reason: string | null;
};

export type AutoUpdateLaunchResult = {
  started: boolean;
  channel: AutoUpdateMode;
  logPath: string;
  error?: string;
};

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function parsePatchCommits(raw: string | undefined): string[] {
  return (raw || "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getAutoUpdateConfig(env: NodeJS.ProcessEnv = process.env): AutoUpdateConfig {
  const dataDir = env.DATA_DIR || "/tmp/ozrouter";
  const repoDir = env.AUTO_UPDATE_REPO_DIR || process.cwd();

  return {
    mode: "source",
    repoDir,
    gitRemote: env.AUTO_UPDATE_GIT_REMOTE || "origin",
    patchCommits: parsePatchCommits(env.AUTO_UPDATE_PATCH_COMMITS),
    logPath: env.AUTO_UPDATE_LOG_PATH || path.join(dataDir, "logs", "auto-update.log"),
    pm2ProcessName: env.AUTO_UPDATE_PM2_PROCESS || "ozrouter",
  };
}

export async function validateAutoUpdateRuntime(
  config: AutoUpdateConfig,
  execFileImpl: ExecFileLike = execFileAsync,
  existsImpl: (targetPath: string) => Promise<boolean> = pathExists
): Promise<AutoUpdateValidation> {
  const gitDir = path.join(config.repoDir || process.cwd(), ".git");
  if (!(await existsImpl(gitDir))) {
    return {
      supported: false,
      reason: "Not a git repository. Clone OzRouter from GitHub to enable auto-update.",
    };
  }

  try {
    await execFileImpl("git", ["--version"], { timeout: 10_000 });
  } catch {
    return {
      supported: false,
      reason: "git is not available. Install git to enable auto-update.",
    };
  }

  return {
    supported: true,
    reason: null,
  };
}

export async function ensureGitTagExists(
  targetTag: string,
  execFileImpl: ExecFileLike = execFileAsync,
  cwd = process.cwd()
): Promise<void> {
  try {
    await execFileImpl("git", ["rev-parse", "-q", "--verify", `refs/tags/${targetTag}`], {
      timeout: 10_000,
      cwd,
    });
  } catch {
    throw new Error(`Git tag not found: ${targetTag}`);
  }
}

export function buildSourceUpdateScript(
  latest: string,
  gitRemote = "origin",
  pm2ProcessName = "ozrouter"
): string {
  const targetTag = latest.startsWith("v") ? latest : `v${latest}`;

  return [
    "set -eu",
    `echo "[AutoUpdate] Starting background update to ${targetTag}."`,
    'start_ref="$(git rev-parse --verify HEAD)"',
    'backup_branch="pre-update/$(git rev-parse --short HEAD)-$(date +%Y%m%d-%H%M%S)"',
    "restore_on_failure() {",
    "  status=$?",
    '  if [ "$status" -ne 0 ]; then',
    '    echo "[AutoUpdate] Update failed with exit code $status. Restoring $start_ref." >&2',
    '    git checkout "$start_ref" >/dev/null 2>&1 || true',
    "  fi",
    '  exit "$status"',
    "}",
    "trap restore_on_failure EXIT",
    "git stash push --include-untracked -m air-update 2>/dev/null || true",
    `git fetch --tags ${shellQuote(gitRemote)}`,
    `if ! git rev-parse -q --verify "refs/tags/${targetTag}" >/dev/null 2>&1; then`,
    `  echo "[AutoUpdate] Tag ${targetTag} not found." >&2`,
    "  exit 1",
    "fi",
    'git branch "$backup_branch" 2>/dev/null || true',
    `git checkout "${targetTag}"`,
    "npm install --legacy-peer-deps",
    "node scripts/sync-env.mjs 2>/dev/null || true",
    "npm run build",
    "trap - EXIT",
    "if command -v pm2 >/dev/null 2>&1; then",
    `  pm2 restart ${shellQuote(pm2ProcessName)} --update-env`,
    "elif [ -x ./node_modules/.bin/pm2 ]; then",
    `  ./node_modules/.bin/pm2 restart ${shellQuote(pm2ProcessName)} --update-env`,
    "else",
    '  echo "[AutoUpdate] PM2 is not installed; restart OzRouter manually to activate the update."',
    "fi",
    `echo "[AutoUpdate] Successfully updated to ${targetTag}."`,
  ].join("\n");
}

export async function launchAutoUpdate({
  latest,
  env = process.env,
  execFileImpl = execFileAsync,
  spawnImpl = spawn,
  existsImpl = pathExists,
}: {
  latest: string;
  env?: NodeJS.ProcessEnv;
  execFileImpl?: ExecFileLike;
  spawnImpl?: SpawnLike;
  existsImpl?: (targetPath: string) => Promise<boolean>;
}): Promise<AutoUpdateLaunchResult> {
  const config = getAutoUpdateConfig(env);
  const validation = await validateAutoUpdateRuntime(config, execFileImpl, existsImpl);

  if (!validation.supported) {
    return {
      started: false,
      channel: config.mode,
      logPath: config.logPath,
      error: validation.reason || "Auto-update runtime is not available.",
    };
  }

  const script = buildSourceUpdateScript(latest, config.gitRemote, config.pm2ProcessName);

  mkdirSync(path.dirname(config.logPath), { recursive: true });
  const logFd = openSync(config.logPath, "a");
  const child = spawnImpl("sh", ["-lc", script], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, ...env },
    cwd: existsSync(config.repoDir) ? config.repoDir : process.cwd(),
  });
  closeSync(logFd);
  child.unref();

  return {
    started: true,
    channel: config.mode,
    logPath: config.logPath,
  };
}
