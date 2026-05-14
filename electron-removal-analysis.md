# Electron Removal Analysis — OzRouter

## Executive Summary

Electron integration is **shallow** — mostly UI padding hacks and a hook file. Core app logic has **zero** Electron dependency. Removal is safe and clean.

---

## 1. Full Electron Dependency Map

### Files INSIDE `electron/` (DELETE ENTIRE DIRECTORY)

| File                    | Lines | Purpose                                |
| ----------------------- | ----- | -------------------------------------- |
| `electron/main.js`      | ~760  | Main process: BrowserWindow, Tray, IPC |
| `electron/preload.js`   | ~50   | contextBridge → window.electronAPI     |
| `electron/package.json` | ~30   | electron-builder config                |
| `electron/types.d.ts`   | ~40   | TypeScript types for electronAPI       |
| `electron/README.md`    | docs  |                                        |
| `electron/assets/`      | icons | App icons                              |

### Files OUTSIDE `electron/` referencing Electron

#### A. `src/shared/hooks/useElectron.ts` (197 lines) — **DELETE ENTIRELY**

Exports 8 hooks, **none used in .tsx files except `useIsElectron`**:

- `useIsElectron()` → line 27 — used by Header.tsx (line 130), DashboardLayout.tsx (line 16)
- `useElectronAppInfo()` → line 46 — **UNUSED** in any .tsx
- `useDataDir()` → line 74 — **UNUSED**
- `useWindowControls()` → line 101 — **UNUSED**
- `useOpenExternal()` → line 128 — **UNUSED**
- `useServerControls()` → line 148 — **UNUSED**
- `useServerStatus()` → line 173 — **UNUSED**
- `usePortChanged()` → line 188 — **UNUSED**

#### B. `src/shared/components/Header.tsx`

- Line 20: `import { useIsElectron } from "@/shared/hooks/useElectron";`
- Line 130: `const isElectron = useIsElectron();`
- Lines 133-136: `const isMacElectron = isElectron && ... window.electronAPI?.platform === "darwin";`
- Line 154: `paddingTop: isMacElectron ? "calc(1.25rem + var(--desktop-safe-top))" : undefined`
- **Action**: Remove import, remove `isElectron`/`isMacElectron` vars, remove conditional padding style

#### C. `src/shared/components/layouts/DashboardLayout.tsx`

- Line 9: `import { useIsElectron } from "@/shared/hooks/useElectron";`
- Line 16: `const isElectron = useIsElectron();`
- Lines 26-27: `const isMacElectron = isElectron && ... window.electronAPI?.platform === "darwin";`
- Line 32: `document.body.classList.toggle("electron-macos", isMacElectron);`
- Line 37: `}, [isMacElectron]);`
- Line 60: `isMacElectron={isMacElectron}` (prop to Header)
- Line 70: `<Sidebar ... isMacElectron={isMacElectron} />`
- **Action**: Remove import, remove `isElectron`/`isMacElectron` logic, remove `useEffect` that toggles body class, remove prop drilling

#### D. `src/shared/components/Sidebar.tsx`

- Line 27: `isMacElectron?: boolean;` (prop type)
- Line 34: `isMacElectron = false,` (destructure default)
- Line 200: `paddingTop: isMacElectron ? "var(--desktop-safe-top)" : undefined`
- Line 213: `isMacElectron ? "pt-3" : "pt-5"`
- Lines 224-225: `collapsed && !isMacElectron && "mt-2"` / `isMacElectron && "ml-auto"`
- Line 296: `paddingBottom: isMacElectron ? "calc(0.75rem + var(--desktop-safe-bottom))" : undefined`
- **Action**: Remove `isMacElectron` prop from interface and destructure, simplify all conditionals to non-Electron branch

#### E. `src/app/globals.css`

- Lines 15-16: `--desktop-safe-top: 0px; --desktop-safe-bottom: 0px;` (root defaults)
- Lines 162-165: `body.electron-macos { --desktop-safe-top: 30px; --desktop-safe-bottom: 8px; }`
- **Action**: Remove `body.electron-macos` block. Root defaults can stay (harmless) or remove too.

#### F. `src/lib/db/proxies.ts` — line 298 (COMMENT ONLY)

- `// Electron installs where migration 004 hasn't run yet.`
- **Action**: Update comment wording, no logic change needed.

---

## 2. package.json Changes

### Scripts to REMOVE (lines 44-49):

```json
"electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:20128 && cd electron && npm run dev\"",
"electron:build": "npm run build && cd electron && npm run build",
"electron:build:win": "npm run build && cd electron && npm run build:win",
"electron:build:mac": "npm run build && cd electron && npm run build:mac",
"electron:build:linux": "npm run build && cd electron && npm run build:linux",
"electron:smoke:packaged": "node scripts/smoke-electron-packaged.mjs",
```

### devDependencies to REMOVE (only if no other usage):

- `"concurrently": "^9.2.1"` (line 142) — ⚠️ **KEEP**: Also used as a word in `src/app/api/providers/[id]/test/route.ts` line 266 but that's a code comment, not an import. Check: no actual import of the `concurrently` package elsewhere. **Safe to remove.**
- `"wait-on": "^9.0.4"` (line 154) — Only used in `electron:dev` script. **Safe to remove.**

---

## 3. Build Scripts to DELETE

| Script                                    | Lines | Purpose                                      |
| ----------------------------------------- | ----- | -------------------------------------------- |
| `scripts/prepare-electron-standalone.mjs` | 167   | Prepares `.next/electron-standalone/` bundle |
| `scripts/smoke-electron-packaged.mjs`     | 101   | Smoke test helpers for packaged Electron app |

---

## 4. Test Files to DELETE

| Test                                       | Lines | Purpose                    |
| ------------------------------------------ | ----- | -------------------------- |
| `tests/unit/electron-smoke-script.test.ts` | 49    | Tests smoke script helpers |
| `tests/unit/electron-preload.test.ts`      | 272   | Tests preload.js           |
| `tests/unit/electron-main.test.ts`         | 298   | Tests main.js              |
| `tests/unit/electron-packaging.test.ts`    | 26    | Tests packaging config     |

**Note**: `tests/unit/t20-t22-provider-headers.test.ts` line 48 references `"electron-fetch"` — this is a GitHub Copilot provider user-agent string, **NOT Electron app code**. Leave it.

---

## 5. Config File Changes

### `.gitignore` (lines 57-63) — REMOVE:

```
# ── Electron ─────────────────────────────────────────────────
electron/package-lock.json
electron/dist-electron/
electron/out/
electron/release/
electron/releases/
electron/node_modules/
```

### `eslint.config.mjs` (lines 57-58) — REMOVE:

```js
// Electron app
"electron/**",
```

### `tsconfig*.json` — NO Electron references. Clean.

### `next.config.*` — NO Electron references. Clean.

---

## 6. Documentation to UPDATE

| File        | Lines | What                                            |
| ----------- | ----- | ----------------------------------------------- |
| `README.md` | 357   | `- electron — optional desktop wrapper.`        |
| `AGENTS.md` | 14    | `JavaScript (open-sse/, electron/)`             |
| `AGENTS.md` | 36-37 | `electron:dev`, `electron:build` commands table |

---

## 7. `autoUpdate.ts` — NOT Electron-Specific

`src/lib/system/autoUpdate.ts` (177 lines) implements **git-based source auto-update** (mode: `"source"`). It:

- Uses `git fetch --tags`, `git checkout`, `npm install`, `npm run build`
- Has zero Electron references
- Used by `src/app/api/system/version/route.ts` (lines 17, 103-104)

**Verdict: KEEP. Not Electron-related.**

The `autoUpdateSupported` / `autoUpdateError` fields in the version route are about git availability, not Electron.

---

## 8. `versionManager.ts` — NOT Electron-Specific

`src/lib/db/versionManager.ts` has `autoUpdate: boolean` and `autoStart: boolean` fields (line 63-64). These are for the **CLI tool version manager** (manages installed CLI tools), not Electron.

**Verdict: KEEP. Not Electron-related.**

---

## 9. `open-sse/` — One False Positive

`open-sse/config/providerHeaderProfiles.ts` line 12:

```ts
export const GITHUB_COPILOT_USER_AGENT_LIBRARY = "electron-fetch";
```

This is GitHub Copilot's expected User-Agent value. **NOT related to Electron desktop app. KEEP.**

---

## 10. Risk Analysis

### SAFE — No breakage:

- Deleting `electron/` directory — standalone, no imports from `src/`
- Deleting `src/shared/hooks/useElectron.ts` — only 2 consumers (Header, DashboardLayout)
- Deleting electron test files — standalone tests
- Deleting electron build scripts — only used by `electron:*` npm scripts
- Removing npm scripts — no other scripts depend on them

### REQUIRES CARE:

1. **Header.tsx** — After removing `isElectron`/`isMacElectron`, the `paddingTop` style on line 154 must be removed or simplified. The component must still render correctly.
2. **DashboardLayout.tsx** — The `useEffect` that toggles `electron-macos` body class (lines 30-37) must be fully removed. Props passed to Header/Sidebar must be cleaned.
3. **Sidebar.tsx** — `isMacElectron` prop removal affects 7 lines. Each conditional must resolve to the `false` branch (non-Electron behavior).
4. **globals.css** — Remove `body.electron-macos` block. The CSS vars `--desktop-safe-top/--desktop-safe-bottom` in `:root` are harmless (0px defaults) but can be cleaned too.

### ZERO RISK — Leave alone:

- `src/lib/system/autoUpdate.ts` — git-based, no Electron
- `src/lib/db/versionManager.ts` — CLI tool manager, no Electron
- `src/app/api/system/version/route.ts` — git auto-update, no Electron
- `open-sse/config/providerHeaderProfiles.ts` — "electron-fetch" is a provider UA string
- `src/lib/db/proxies.ts` line 298 — comment only (optional: reword)

---

## 11. Complete Deletion Checklist

### DELETE (directories):

- [ ] `electron/` (entire directory)

### DELETE (files):

- [ ] `src/shared/hooks/useElectron.ts`
- [ ] `scripts/prepare-electron-standalone.mjs`
- [ ] `scripts/smoke-electron-packaged.mjs`
- [ ] `tests/unit/electron-smoke-script.test.ts`
- [ ] `tests/unit/electron-preload.test.ts`
- [ ] `tests/unit/electron-main.test.ts`
- [ ] `tests/unit/electron-packaging.test.ts`

### EDIT (remove Electron code):

- [ ] `src/shared/components/Header.tsx` — remove import, isElectron/isMacElectron vars, conditional padding
- [ ] `src/shared/components/layouts/DashboardLayout.tsx` — remove import, isElectron/isMacElectron logic, useEffect, prop drilling
- [ ] `src/shared/components/Sidebar.tsx` — remove isMacElectron prop from interface + all 7 conditional lines
- [ ] `src/app/globals.css` — remove `body.electron-macos` block (lines 162-165) + optionally `--desktop-safe-top/bottom` vars (lines 15-16)
- [ ] `package.json` — remove 6 electron scripts (lines 44-49) + `concurrently` + `wait-on` devDeps
- [ ] `.gitignore` — remove Electron section (lines 57-63)
- [ ] `eslint.config.mjs` — remove `"electron/**"` ignore (lines 57-58)
- [ ] `src/lib/db/proxies.ts` — reword comment at line 298 (optional)

### UPDATE (documentation):

- [ ] `README.md` — remove Electron references
- [ ] `AGENTS.md` — remove Electron from stack, commands table, and desktop app mentions
