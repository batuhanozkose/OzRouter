# Code Context — OzRouter Air-Update (OTA Auto-Update) System

## Summary

**Auto-update infrastructure ALREADY EXISTS in main process + preload.** Backend is ~90% complete.
What's MISSING: TypeScript types, renderer-side React hook, UI component, CI/CD pipeline, code signing.

---

## Files Retrieved

1. `electron/main.js` (lines 34, 163-280, 660-695) — autoUpdater setup, event handlers, IPC handlers
2. `electron/preload.js` (full, 82 lines) — IPC bridge exposing update methods to renderer
3. `electron/types.d.ts` (full, 43 lines) — **MISSING auto-update types** (critical gap)
4. `electron/package.json` (full, 146 lines) — electron-builder config, publish to GitHub Releases
5. `electron/README.md` (full) — docs mention GitHub Releases, but incomplete IPC channel docs
6. `src/shared/hooks/useElectron.ts` (full, ~200 lines) — **NO `useAutoUpdate` hook exists**
7. `src/lib/system/autoUpdate.ts` — **Source-based** auto-update (git pull + rebuild), NOT Electron
8. `src/app/api/system/version/route.ts` — Source-based version check API
9. `src/app/(dashboard)/dashboard/HomePageClient.tsx` (lines 85-580) — Source-based update UI overlay
10. `package.json` (lines 44-49) — Electron build scripts
11. `scripts/prepare-electron-standalone.mjs` — Electron bundle preparation script

---

## Key Code

### 1. Auto-Updater Config (electron/main.js:163-166)

```js
autoUpdater.autoDownload = false; // Manual download trigger
autoUpdater.autoInstallOnAppQuit = true; // Install on quit if downloaded
autoUpdater.logger = console;
```

### 2. Auto-Updater Event Handlers (electron/main.js:210-256)

```js
function setupAutoUpdater() {
  autoUpdater.on("checking-for-update", () => {
    sendToRenderer("update-status", { status: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    sendToRenderer("update-status", { status: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", (info) => {
    sendToRenderer("update-status", { status: "not-available", version: info.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("update-status", {
      status: "downloading",
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    sendToRenderer("update-status", { status: "downloaded", version: info.version });
    // Shows native notification with click-to-install
  });
  autoUpdater.on("error", (error) => {
    sendToRenderer("update-status", { status: "error", message: error.message });
  });
}
```

### 3. Update Functions (electron/main.js:257-279)

```js
async function checkForUpdates(silent = false) {
  if (isDev) {
    if (!silent)
      sendToRenderer("update-status", { status: "error", message: "Updates disabled in dev mode" });
    return;
  }
  await autoUpdater.checkForUpdates();
}

async function downloadUpdate() {
  await autoUpdater.downloadUpdate();
}

function installUpdate() {
  if (nextServer) {
    nextServer.kill("SIGTERM"); // Graceful server shutdown before install
    nextServer = null;
  }
  autoUpdater.quitAndInstall();
}
```

### 4. IPC Handlers (electron/main.js:663-694)

```js
ipcMain.handle("check-for-updates", async () => {
  try {
    await checkForUpdates(false);
    return { success: true };
  } catch (error) {
    sendToRenderer("update-status", { status: "error", message: error.message });
    return { success: false, error: error.message };
  }
});
ipcMain.handle("download-update", async () => {
  /* similar pattern */
});
ipcMain.handle("install-update", () => {
  installUpdate();
});
ipcMain.handle("get-app-version", () => app.getVersion());
```

### 5. Startup Auto-Check (electron/main.js:711-715)

```js
if (!isDev) {
  setTimeout(() => {
    checkForUpdates(true); // Silent check 3s after startup
  }, 3000);
}
```

### 6. Preload Bridge (electron/preload.js)

IPC whitelist:

```js
const ALLOWED_CHANNELS = {
  invoke: ["get-app-info", "open-external", "get-data-dir", "restart-server",
           "check-for-updates", "download-update", "install-update", "get-app-version", ...],
  receive: ["server-status", "port-changed", "update-status"],
};
```

Exposed API:

```js
contextBridge.exposeInMainWorld("electronAPI", {
  // ... existing methods ...
  getAppVersion: () => safeInvoke("get-app-version"),
  checkForUpdates: () => safeInvoke("check-for-updates"),
  downloadUpdate: () => safeInvoke("download-update"),
  installUpdate: () => safeInvoke("install-update"),
  onUpdateStatus: (callback) => safeOn("update-status", callback),
});
```

### 7. electron-builder Publish Config (electron/package.json)

```json
{
  "version": "3.8.4",
  "dependencies": {
    "better-sqlite3": "^12.8.0",
    "electron-updater": "^6.8.3"
  },
  "devDependencies": {
    "electron": "^41.2.0",
    "electron-builder": "^26.8.1"
  },
  "build": {
    "appId": "online.ozrouter.desktop",
    "productName": "OzRouter",
    "publish": {
      "provider": "github",
      "owner": "batuhanozkose",
      "repo": "OzRouter"
    },
    "win": { "target": ["nsis", "portable"] },
    "mac": { "target": "dmg", "category": "public.app-category.developer-tools" },
    "linux": { "target": ["AppImage", "deb"], "category": "Development" }
  }
}
```

### 8. Current types.d.ts — INCOMPLETE (electron/types.d.ts)

```ts
interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  getAppInfo(): Promise<{
    name: string;
    version: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    platform: string;
    arch: string;
  }>;
  openExternal(url: string): Promise<void>;
  getDataDir(): Promise<string>;
  restartServer(): Promise<{ success: boolean; error?: string }>;
  minimizeWindow(): void;
  maximizeWindow(): void;
  closeWindow(): void;
  onServerStatus(callback: (data: { status: string; message?: string }) => void): () => void;
  onPortChanged(callback: (data: { port: number }) => void): () => void;
  // ❌ MISSING: getAppVersion, checkForUpdates, downloadUpdate, installUpdate, onUpdateStatus
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ MAIN PROCESS (electron/main.js)                         │
│                                                         │
│ electron-updater (autoUpdater)                          │
│   ├─ autoUpdater.autoDownload = false                   │
│   ├─ autoUpdater.autoInstallOnAppQuit = true            │
│   ├─ Events → sendToRenderer("update-status", data)    │
│   └─ GitHub Releases (provider: "github")              │
│                                                         │
│ IPC Handlers:                                           │
│   ├─ check-for-updates → checkForUpdates(false)        │
│   ├─ download-update → downloadUpdate()                │
│   ├─ install-update → installUpdate()                  │
│   └─ get-app-version → app.getVersion()                │
│                                                         │
│ Startup: setTimeout(checkForUpdates(true), 3000)       │
└────────────────┬────────────────────────────────────────┘
                 │ IPC (contextBridge)
┌────────────────┴────────────────────────────────────────┐
│ PRELOAD (electron/preload.js)                           │
│                                                         │
│ window.electronAPI = {                                  │
│   checkForUpdates(), downloadUpdate(), installUpdate(), │
│   getAppVersion(), onUpdateStatus(callback)             │
│ }                                                       │
└────────────────┬────────────────────────────────────────┘
                 │ window.electronAPI.*
┌────────────────┴────────────────────────────────────────┐
│ RENDERER (Next.js App)                                  │
│                                                         │
│ ❌ NO useAutoUpdate hook                                │
│ ❌ NO auto-update UI component                          │
│ ❌ NO UpdateStatus types in types.d.ts                  │
│                                                         │
│ Existing patterns to follow:                            │
│   src/shared/hooks/useElectron.ts (useServerStatus)     │
│   src/shared/components/Header.tsx (isElectron check)   │
│   src/shared/components/layouts/DashboardLayout.tsx     │
└─────────────────────────────────────────────────────────┘
```

### Two Separate Update Systems

| System                   | Scope              | Mechanism                          | Status                  |
| ------------------------ | ------------------ | ---------------------------------- | ----------------------- |
| **Electron Auto-Update** | Desktop app binary | electron-updater → GitHub Releases | Backend ✅, Frontend ❌ |
| **Source Auto-Update**   | Self-hosted/dev    | git pull + npm rebuild via SSE     | Fully working ✅        |

---

## Identified Gaps (What Needs to Be Built)

### Gap 1: TypeScript Types — `electron/types.d.ts`

**Missing from ElectronAPI interface:**

```ts
// These methods exist in preload.js but have NO type definitions
getAppVersion(): Promise<string>;
checkForUpdates(): Promise<{ success: boolean; error?: string }>;
downloadUpdate(): Promise<{ success: boolean; error?: string }>;
installUpdate(): Promise<void>;
onUpdateStatus(callback: (data: UpdateStatusData) => void): () => void;
```

**Missing interface:**

```ts
interface UpdateStatusData {
  status: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  message?: string;
}
```

### Gap 2: React Hook — `src/shared/hooks/useElectron.ts`

No `useAutoUpdate()` hook exists. Should follow pattern of existing `useServerStatus()`:

```ts
// Pattern from useServerStatus (line 170-195):
export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatusData>({ status: "starting" });
  const isElectron = useIsElectron();
  useEffect(() => {
    if (!isElectron || typeof window === "undefined" || !window.electronAPI) return;
    const cleanup = window.electronAPI.onServerStatus((data) => setStatus(data));
    return cleanup;
  }, [isElectron]);
  return status;
}
```

### Gap 3: UI Component

No auto-update banner/notification/dialog component exists for the Electron app.
Needs:

- Update available notification banner
- Download progress indicator
- "Restart to update" button
- Integration point: `DashboardLayout.tsx` or `Header.tsx`

### Gap 4: CI/CD Pipeline — `.github/workflows/`

No GitHub Actions workflow exists. Only `.github/CODEOWNERS` present.
Needs:

- Build workflow (Windows, macOS, Linux)
- Publish to GitHub Releases with `electron-builder --publish always`
- Code signing (macOS notarization, Windows code signing)
- `GH_TOKEN` secret for electron-builder publish

### Gap 5: Code Signing

No code signing configured in `electron/package.json`:

- macOS: No `notarize` config, no Apple Developer ID
- Windows: No certificate config
- Without signing: macOS Gatekeeper blocks, Windows SmartScreen warns

### Gap 6: electron/README.md Documentation

IPC Channels section incomplete — missing `check-for-updates`, `download-update`, `install-update`, `get-app-version` in Invoke section, missing `update-status` in Receive section.

---

## Start Here

**`electron/types.d.ts`** — First file to edit. Add `UpdateStatusData` interface and 5 missing methods to `ElectronAPI`. This unblocks all renderer-side work (hook, component, etc.).

Then:

1. `src/shared/hooks/useElectron.ts` — Add `useAutoUpdate()` hook
2. New component: `src/shared/components/AutoUpdateBanner.tsx`
3. `src/shared/components/layouts/DashboardLayout.tsx` — Mount the banner
4. `.github/workflows/electron-release.yml` — CI/CD pipeline
5. `electron/README.md` — Update docs

---

## Risks & Constraints

1. **Code Signing REQUIRED** for production — unsigned apps blocked on macOS, warned on Windows
2. **GH_TOKEN needed** — electron-builder requires GitHub token for publish
3. **Version sync** — `electron/package.json` version must match release tags
4. **Server shutdown** — `installUpdate()` already kills Next.js server before quit (line 273-276), good
5. **CSP allows GitHub** — `connect-src` already includes `https://*.github.com/batuhanozkose/OzRouter` (line 293)
6. **Dev mode guard** — `checkForUpdates()` already skips in dev mode (line 258-262)
7. **Notification support** — Native notification on download-complete already implemented (line 237-247)
8. **autoDownload=false** — User must explicitly trigger download (good UX pattern)
9. **better-sqlite3 in Electron** — Native module rebuild needed per platform (already handled by electron-builder)
10. **No differential updates** — Full app download each update (electron-updater default)
