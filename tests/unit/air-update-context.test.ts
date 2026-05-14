/**
 * Unit tests for air-update system types and constants.
 *
 * The air-update system provides:
 * 1. AirUpdateContext — global React context with periodic version checks
 * 2. AirUpdatePopup — modal popup when update available
 * 3. AirUpdateBanner — persistent banner when popup dismissed
 * 4. AirUpdateProgress — SSE-connected progress overlay
 * 5. Enhanced version route — backup step + release info
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const AIR_UPDATE_DIR = join(ROOT, "src/shared/components/air-update");

describe("Air Update — file structure", () => {
  const expectedFiles = [
    "AirUpdateContext.tsx",
    "AirUpdatePopup.tsx",
    "AirUpdateBanner.tsx",
    "AirUpdateProgress.tsx",
    "index.ts",
  ];

  for (const file of expectedFiles) {
    test(`${file} exists`, () => {
      assert.ok(existsSync(join(AIR_UPDATE_DIR, file)), `Missing: ${file}`);
    });
  }
});

describe("Air Update — AirUpdateContext exports", () => {
  test("exports AirUpdateProvider and useAirUpdate", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateContext.tsx"), "utf8");
    assert.ok(content.includes("export function AirUpdateProvider"), "Missing AirUpdateProvider");
    assert.ok(content.includes("export function useAirUpdate"), "Missing useAirUpdate hook");
  });

  test("defines AirUpdatePhase type with all phases", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateContext.tsx"), "utf8");
    const requiredPhases = [
      "idle",
      "checking",
      "backup",
      "updating",
      "installing",
      "rebuilding",
      "restarting",
      "done",
      "failed",
    ];
    for (const phase of requiredPhases) {
      assert.ok(content.includes(`"${phase}"`), `Missing phase: ${phase}`);
    }
  });

  test("uses 4-hour periodic check interval", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateContext.tsx"), "utf8");
    assert.ok(content.includes("4 * 60 * 60 * 1000"), "Should check every 4 hours");
  });

  test("persists popup dismissal per version", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateContext.tsx"), "utf8");
    assert.ok(
      content.includes("air-update-dismissed-v"),
      "Should use version-specific dismiss key"
    );
  });

  test("auto-reloads after confirmed successful update", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateContext.tsx"), "utf8");
    assert.ok(content.includes("window.location.reload()"), "Should auto-reload on done");
    assert.ok(
      content.includes("waitForBackgroundUpdate"),
      "Background updates should wait for the target version before reload"
    );
  });
});

describe("Air Update — AirUpdatePopup", () => {
  test("shows data safety notice", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdatePopup.tsx"), "utf8");
    assert.ok(content.includes('t("dataSafeTitle")'), "Missing data safety notice");
    assert.ok(content.includes('t("dataSafeDescription")'), "Should mention backup");
  });

  test("shows release notes when available", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdatePopup.tsx"), "utf8");
    assert.ok(content.includes("releaseNotes"), "Should show release notes");
    assert.ok(content.includes("releaseName"), "Should show release name");
  });

  test("has Update Now and Later buttons", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdatePopup.tsx"), "utf8");
    assert.ok(content.includes("Update Now"), "Missing Update Now button");
    assert.ok(content.includes("Later"), "Missing Later button");
  });
});

describe("Air Update — AirUpdateBanner", () => {
  test("shows version info and click prompt", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateBanner.tsx"), "utf8");
    assert.ok(content.includes('t("updateAvailable")'), "Should show update available text");
    assert.ok(content.includes('t("clickToUpdate")'), "Should have click prompt");
  });

  test("only shows when popup is dismissed", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateBanner.tsx"), "utf8");
    assert.ok(content.includes("dismissed"), "Should check dismissed state");
  });
});

describe("Air Update — AirUpdateProgress", () => {
  test("has all phase steps in stepper", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateProgress.tsx"), "utf8");
    const requiredSteps = [
      "Backup",
      "Downloading",
      "Installing",
      "Building",
      "Restarting",
      "Complete",
    ];
    for (const step of requiredSteps) {
      assert.ok(content.includes(step), `Missing step label: ${step}`);
    }
  });

  test("shows data protection badge during update", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateProgress.tsx"), "utf8");
    assert.ok(content.includes('t("backupProtected")'), "Missing backup badge");
  });

  test("shows step log with status indicators", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateProgress.tsx"), "utf8");
    assert.ok(content.includes("StepLog"), "Missing step log component");
  });
});

describe("Air Update — DashboardLayout integration", () => {
  test("DashboardLayout wraps with AirUpdateProvider", () => {
    const content = readFileSync(
      join(ROOT, "src/shared/components/layouts/DashboardLayout.tsx"),
      "utf8"
    );
    assert.ok(content.includes("AirUpdateProvider"), "Missing AirUpdateProvider wrapper");
    assert.ok(content.includes("AirUpdatePopup"), "Missing AirUpdatePopup");
    assert.ok(content.includes("AirUpdateBanner"), "Missing AirUpdateBanner");
    assert.ok(content.includes("AirUpdateProgress"), "Missing AirUpdateProgress");
  });
});

describe("Air Update — 4-segment version support (x.y.z.w)", () => {
  test("package.json uses 4-segment version", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const parts = pkg.version.split(".");
    assert.ok(
      parts.length === 4,
      `Expected 4-segment version, got ${parts.length}: ${pkg.version}`
    );
    for (const p of parts) {
      assert.ok(/^\d+$/.test(p), `Non-numeric segment: ${p}`);
    }
  });

  test("compareVersions in version route handles 4 segments", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    assert.ok(
      content.includes('v.split(".").map(Number)'),
      "compareVersions should split on dot and parse as numbers"
    );
    assert.ok(
      content.includes("Math.max(aParts.length, bParts.length"),
      "compareVersions should handle variable segment count"
    );
  });

  test("normalizeTagVersion regex accepts 4-segment tags", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    assert.ok(
      content.includes("(?:\\.\\d+)?"),
      "normalizeTagVersion regex should have optional 4th segment"
    );
  });

  test("Air Update client waits for 4-segment target versions", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateContext.tsx"), "utf8");
    assert.ok(
      content.includes("\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?"),
      "Client version normalization should accept x.y.z.w"
    );
    assert.ok(
      content.includes("Math.max(aParts.length, bParts.length, 4)"),
      "Client version comparison should include the fourth segment"
    );
  });

  test("skills registry compareVersions handles 4 segments", () => {
    const content = readFileSync(join(ROOT, "src/lib/skills/registry.ts"), "utf8");
    assert.ok(
      content.includes("aParts.length, bParts.length") || content.includes("aParts[i]"),
      "Skills compareVersions should iterate dynamically over segments"
    );
    assert.ok(
      !content.includes("[aMajor, aMinor, aPatch]"),
      "Skills compareVersions should NOT destructure only 3 segments"
    );
  });

  test("versionManager checkForUpdates uses numeric comparison", () => {
    const content = readFileSync(join(ROOT, "src/lib/versionManager/index.ts"), "utf8");
    assert.ok(
      !content.includes("updateAvailable: current !== latest"),
      "checkForUpdates should NOT use string equality for version comparison"
    );
    assert.ok(
      content.includes("Math.max(cParts.length, lParts.length"),
      "checkForUpdates should compare every available version segment"
    );
  });

  test("skill install manifests accept 4-segment versions", () => {
    const content = readFileSync(join(ROOT, "src/app/api/skills/install/route.ts"), "utf8");
    assert.ok(
      content.includes("\\d+\\.\\d+\\.\\d+(\\.\\d+)?"),
      "Skill install version validation should allow x.y.z.w"
    );
  });
});

describe("Air Update — version route enhancements", () => {
  test("version route creates backup before launching background update", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    assert.ok(content.includes("backupDbFileAndWait"), "Missing awaited backup step");
    assert.ok(content.includes("launchAutoUpdate"), "Missing background update launch");
    assert.ok(content.includes("backupResult.filename"), "Response should expose backup filename");
  });

  test("version route fetches GitHub release info", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    assert.ok(content.includes("getGitHubReleaseInfo"), "Missing release info fetcher");
    assert.ok(content.includes("releaseName"), "Missing releaseName in response");
    assert.ok(content.includes("releaseNotes"), "Missing releaseNotes in response");
    assert.ok(content.includes("releaseUrl"), "Missing releaseUrl in response");
  });

  test("backup failure aborts update before code changes", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    assert.ok(
      content.includes("Database backup could not be created. Update aborted."),
      "Backup failure should abort the update"
    );
  });

  test("version route does not run build/restart inside the request handler", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    assert.ok(!content.includes('"npm", ["run", "build"]'), "Build should run in background");
    assert.ok(!content.includes('"pm2", ["restart"'), "Restart should run in background");
  });

  test("background updater restores the original ref on failure", () => {
    const content = readFileSync(join(ROOT, "src/lib/system/autoUpdate.ts"), "utf8");
    assert.ok(
      content.includes("restore_on_failure"),
      "Background update script should restore the starting ref on failure"
    );
    assert.ok(
      content.includes('git checkout "$start_ref"'),
      "Background update script should check out the starting ref on failure"
    );
  });
});
