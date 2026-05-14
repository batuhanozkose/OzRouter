# OzRouter Web Auto-Update System — Complete Analysis

## Files Retrieved

1. `src/lib/system/autoUpdate.ts` (lines 1-177) — Core auto-update engine: types, config, validation, git script builder, background launcher
2. `src/app/api/system/version/route.ts` (lines 1-311) — API route: GET (version check) + POST (trigger update via SSE or background)
3. `src/app/(dashboard)/dashboard/HomePageClient.tsx` (lines 1-941) — Client-side: version check, SSE consumer, update overlay UI, notification banner
4. `src/lib/versionManager/releaseChecker.ts` (lines 1-100) — Separate release checker for external tools (NOT for OzRouter self-update)
5. `src/lib/db/versionManager.ts` (lines 1-318) — DB-backed tool version management (NOT for OzRouter self-update)

## Key Types

### autoUpdate.ts Types (lines 9-31)

```ts
export type AutoUpdateMode = "source";

export type AutoUpdateConfig = {
  mode: AutoUpdateMode;
  repoDir: string;
  gitRemote: string;
  logPath: string;
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
```

### HomePageClient Types (lines 16-31)

```ts
type UpdateStep = {
  step: string;
  status: string;
  message: string;
};

type VersionInfo = {
  current: string;
  latest: string;
  updateAvailable: boolean;
  channel: string;
  autoUpdateSupported: boolean;
  autoUpdateError?: string | null;
  news?: NewsAnnouncement | null;
};
```

## Architecture

### 1. Version Check Flow (GET /api/system/version)

```
Client (HomePageClient useEffect)
  → GET /api/system/version
  → version/route.ts GET handler
    → Reads `current` from package.json
    → Runs `git ls-remote --tags origin` to get remote tags
    → Parses semver tags via regex: /(?:refs\/tags\/)?v?(\d+\.\d+\.\d+)(?:\^{}|$)/
    → Sorts by semver, picks latest
    → Calls getAutoUpdateConfig() + validateAutoUpdateRuntime()
    → Returns JSON: { current, latest, updateAvailable, autoUpdateSupported, autoUpdateError, channel }
```

**Key Details:**

- Version check uses `git ls-remote --tags` against the configured remote (default: "origin")
- Does NOT use GitHub API — relies on git CLI
- Semver comparison: `latest > current` via localeCompare with numeric option
- `autoUpdateSupported` is true only if: git repo exists (.git dir) AND git CLI available
- Config comes from env vars: `AUTO_UPDATE_GIT_REMOTE` (default "origin"), `AUTO_UPDATE_REPO_DIR` (default cwd), `AUTO_UPDATE_LOG_PATH`

### 2. Update Trigger Flow (POST /api/system/version)

POST body: `{ action: "source-update" | "update", latest: string }`

**Two distinct paths:**

#### Path A: Source Update (action === "source-update") — SSE Stream

```
POST { action: "source-update", latest: "3.8.5" }
  → Validates: current !== latest
  → Validates: autoUpdateRuntime supported (git repo + git CLI)
  → Creates ReadableStream (SSE)
  → Sends step-by-step progress events:
    1. { step: "fetch", status: "running", message: "Fetching latest tags..." }
       → git fetch --tags origin
    2. { step: "fetch", status: "done", message: "Tags fetched." }
    3. { step: "checkout", status: "running", message: "Checking out v3.8.5..." }
       → git checkout v3.8.5
    4. { step: "checkout", status: "done", message: "Checked out v3.8.5." }
    5. { step: "install", status: "running", message: "Installing dependencies..." }
       → npm ci --no-audit --no-fund
    6. { step: "install", status: "done", message: "Dependencies installed." }
    7. { step: "rebuild", status: "running", message: "Rebuilding native modules..." }
       → npm rebuild better-sqlite3
    8. { step: "rebuild", status: "done", message: "Native modules rebuilt." }
    9. { step: "build", status: "running", message: "Building application..." }
       → npm run build
    10. { step: "build", status: "done", message: "Application built." }
    11. { step: "complete", status: "done", message: "Update complete! Restart server." }
  → On error: { step: "error", status: "failed", message: "..." }
  → Returns Response with Content-Type: text/event-stream
```

#### Path B: Background Update (action !== "source-update")

```
POST { action: "update", latest: "3.8.5" }
  → Calls launchAutoUpdate({ latest })
  → launchAutoUpdate():
    → Gets config, validates runtime
    → Builds shell script via buildSourceUpdateScript()
    → Spawns detached child process: sh -c "script" > logPath 2>&1
    → Returns { started: true, channel: "source", logPath }
  → Returns JSON: { success, message, from, to, channel, logPath }
```

### 3. buildSourceUpdateScript (autoUpdate.ts lines 108-131)

Generates a sequential bash script:

```bash
git fetch --tags origin
git checkout v3.8.5        # or vX.Y.Z
npm ci --no-audit --no-fund
npm rebuild better-sqlite3
npm run build
# Note: does NOT restart the server
```

The script uses `set -euo pipefail` for safety. Target tag is validated with `git rev-parse` before building script.

### 4. launchAutoUpdate (autoUpdate.ts lines 134-177)

Background launcher:

- Gets config from `getAutoUpdateConfig()`
- Validates runtime (git repo + git CLI)
- Validates target git tag exists via `ensureGitTagExists()`
- Builds shell script via `buildSourceUpdateScript()`
- Spawns detached child process: `spawn("sh", ["-c", script], { detached: true, stdio: [...] })`
- Output redirected to `logPath` (default: `~/.ozrouter/logs/auto-update.log`)
- Process is `.unref()`'d so parent can exit
- Returns `{ started, channel, logPath, error? }`

### 5. Client-Side Update UI (HomePageClient.tsx)

#### State Management

```ts
const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
const [updating, setUpdating] = useState(false);
const [updateSteps, setUpdateSteps] = useState<UpdateStep[]>([]);
const [updatePhase, setUpdatePhase] = useState<"idle" | "running" | "done" | "failed">("idle");
const [showUpdateOverlay, setShowUpdateOverlay] = useState(false);
```

#### Version Check (useEffect, lines ~140-190)

- On mount, fetches `GET /api/system/version`
- Sets `versionInfo` state with result
- If `updateAvailable === true`, shows notification banner

#### handleUpdate Function (lines ~301-400)

```ts
const handleUpdate = async () => {
  setUpdating(true);
  setUpdatePhase("running");
  setUpdateSteps([]);

  const res = await fetch("/api/system/version", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "source-update", latest: versionInfo.latest }),
  });

  // If JSON response (error or background mode):
  if (contentType.includes("application/json")) {
    // Handle error or success + start polling
    await pollBackgroundUpdate({ message, targetVersion });
    return;
  }

  // If SSE stream:
  const reader = res.body.getReader();
  // Read SSE events, update steps via mergeUpdateStep()
  // On "complete" → setUpdatePhase("done"), auto-reload after 3s
  // On "error" → setUpdatePhase("failed")
};
```

#### mergeUpdateStep (lines 67-78)

Smart merge: updates existing step by name or appends new step. Maintains ordered list.

#### pollBackgroundUpdate (lines ~197-290)

Polls update log file for background updates (non-SSE path). Uses interval-based polling with retry logic.

#### Update Overlay UI (lines ~430-570)

- Full-screen overlay with backdrop blur
- Shows step-by-step progress with status indicators (running/done/failed)
- Step labels: fetch → "Fetching Updates", checkout → "Checking Out", install → "Installing", rebuild → "Rebuilding", build → "Building", complete → "Complete", error → "Error"
- Status colors: running = primary, done = green, failed = red
- On completion: shows "Reloading page automatically..." and reloads after 3s
- On failure: shows error message, "Close" and "Retry" buttons

#### Update Notification Banner (lines ~539-570)

- Shown when `updateAvailable && !showUpdateOverlay`
- Displays version info: "Update Available: v{latest}"
- If `autoUpdateSupported`: shows "Update Now" button
- If NOT `autoUpdateSupported`: shows disabled "Manual Update" button with error tooltip

### 6. Environment Detection

**Auto-update is supported when ALL of these are true:**

1. `.git` directory exists at `config.repoDir` (default: `process.cwd()`)
2. `git` CLI is available (tested via `git --version`)

**Auto-update is NOT supported (with reasons):**

- Docker containers: No `.git` directory → "Not a git repository"
- Pre-built releases (zip/tar): No `.git` directory → "Not a git repository"
- No git installed: → "git is not available"

**No explicit Docker detection** — relies on `.git` dir presence check.

### 7. Versioning Strategy

- **Version source**: `package.json` → `version` field (currently `3.8.4`)
- **All 3 package.json files synced**: root, `open-sse/`, `electron/`
- **Remote versions**: Git tags matching `vX.Y.Z` pattern
- **Comparison**: `localeCompare` with `{ numeric: true, sensitivity: "base" }` for semver ordering
- **Tag format**: `v` prefix (e.g., `v3.8.4`), stripped for comparison

### 8. SSE Stream Protocol

**Format**: Standard SSE (`data: JSON\n\n`)

**Event schema**:

```ts
{
  step: "fetch" | "checkout" | "install" | "rebuild" | "build" | "complete" | "error",
  status: "running" | "done" | "failed",
  message: string
}
```

**Flow**: Each step sends two events — first with `status: "running"`, then `status: "done"` after completion. Steps are sequential. On error at any step, sends `{ step: "error", status: "failed", message }` and closes stream.

### 9. Git Operations Detail (version/route.ts POST handler)

The POST handler with `action: "source-update"` executes these git commands in sequence:

```bash
# Step 1: Fetch tags
git fetch --tags ${gitRemote}    # default: "origin"

# Step 2: Checkout target version
git checkout v${latest}

# Step 3: Install dependencies
npm ci --no-audit --no-fund

# Step 4: Rebuild native modules
npm rebuild better-sqlite3

# Step 5: Build application
npm run build
```

All commands execute with 5-minute timeout (`300_000ms`) and `cwd` set to project root.

**Critical observation**: The update DOES NOT restart the server. After completion, the client auto-reloads, but the server process must be restarted manually or by a process manager (pm2, systemd, etc.).

### 10. No Separate Update Components

No dedicated update components in `src/shared/components/`. The entire update UI is inline within `HomePageClient.tsx`.

### 11. No `/api/system/update/` Routes

No separate update routes exist. All update logic lives in `/api/system/version/route.ts` (both GET and POST).

## Key Code Snippets

### getAutoUpdateConfig (autoUpdate.ts lines 54-65)

```ts
export function getAutoUpdateConfig(env: NodeJS.ProcessEnv = process.env): AutoUpdateConfig {
  const dataDir = env.DATA_DIR || path.join(os.homedir(), ".ozrouter");
  return {
    mode: "source" as AutoUpdateMode,
    repoDir: env.AUTO_UPDATE_REPO_DIR || process.cwd(),
    gitRemote: env.AUTO_UPDATE_GIT_REMOTE || "origin",
    logPath: env.AUTO_UPDATE_LOG_PATH || path.join(dataDir, "logs", "auto-update.log"),
  };
}
```

### validateAutoUpdateRuntime (autoUpdate.ts lines 67-92)

```ts
export async function validateAutoUpdateRuntime(
  config: AutoUpdateConfig,
  execFileImpl: ExecFileLike = execFileAsync
): Promise<AutoUpdateValidation> {
  const gitDir = path.join(config.repoDir || process.cwd(), ".git");
  if (!fs.existsSync(gitDir)) {
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
  return { supported: true, reason: null };
}
```

### GET Handler — Version Comparison (version/route.ts lines 20-130)

```ts
// Parse semver from git tags
const match = tag.match(/(?:refs\/tags\/)?v?(\d+\.\d+\.\d+)(?:\^{}|$)/);

// Get latest via git ls-remote
const { stdout } = await execFileAsync("git", ["ls-remote", "--tags", config.gitRemote], {
  timeout: 30_000,
  cwd: config.repoDir,
});

// Compare versions
const updateAvailable =
  latest.localeCompare(current, undefined, {
    numeric: true,
    sensitivity: "base",
  }) > 0;
```

### POST Handler — SSE Stream (version/route.ts lines 148-280)

```ts
if (config.mode === "source") {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        // 5 sequential steps with SSE events
        send({ step: "fetch", status: "running", message: "..." });
        await execFileAsync("git", ["fetch", "--tags", config.gitRemote], {
          timeout: 300_000,
          cwd,
        });
        send({ step: "fetch", status: "done", message: "Tags fetched." });
        // ... checkout, install, rebuild, build
        send({ step: "complete", status: "done", message: "Update complete!" });
      } catch (err) {
        send({ step: "error", status: "failed", message: errMsg });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

## Constraints & Risks

1. **No server restart**: Update completes (git checkout + npm ci + build) but server keeps running old code until manually restarted
2. **No rollback mechanism**: If update fails mid-way (e.g., npm ci fails), git is already checked out to new tag
3. **No lock/mutex**: Concurrent update requests could cause corruption
4. **Git checkout disrupts running code**: `git checkout` changes files on disk while Node.js is running
5. **5-minute timeout**: Long `npm ci` or `npm run build` could timeout on slow machines
6. **No Docker support**: By design — Docker users must rebuild container
7. **No progress percentage**: Steps are discrete, no granular progress within each step
8. **No changelog/release notes**: Only version number shown, no release details

## Start Here

**`src/app/api/system/version/route.ts`** — This is the central hub. Contains both version check (GET) and update trigger (POST) logic. All paths converge here.

Then read **`src/lib/system/autoUpdate.ts`** for the core engine (config, validation, script building, background launch).

Finally **`src/app/(dashboard)/dashboard/HomePageClient.tsx`** (lines 15-570) for the complete client-side UX.
