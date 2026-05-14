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

  test("auto-reloads after successful update", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdateContext.tsx"), "utf8");
    assert.ok(content.includes("window.location.reload()"), "Should auto-reload on done");
  });
});

describe("Air Update — AirUpdatePopup", () => {
  test("shows data safety notice", () => {
    const content = readFileSync(join(AIR_UPDATE_DIR, "AirUpdatePopup.tsx"), "utf8");
    assert.ok(content.includes("Your data is safe"), "Missing data safety notice");
    assert.ok(content.includes("database backup"), "Should mention backup");
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
    assert.ok(content.includes("Update available"), "Should show update available text");
    assert.ok(content.includes("Click to update"), "Should have click prompt");
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
    assert.ok(content.includes("Database backed up"), "Missing backup badge");
    assert.ok(content.includes("your data is protected"), "Missing protection text");
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

describe("Air Update — version route enhancements", () => {
  test("version route includes backup step in SSE", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    assert.ok(content.includes("backupDbFileAndWait"), "Missing awaited backup step");
    assert.ok(content.includes('step: "backup"'), "Missing backup SSE step");
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

  test("version route emits progress steps matching client phases", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    for (const step of ["backup", "fetch", "install", "dependencies", "build", "restart"]) {
      assert.ok(content.includes(`step: "${step}"`), `Missing SSE step: ${step}`);
    }
  });

  test("restart failure prevents complete status", () => {
    const content = readFileSync(join(ROOT, "src/app/api/system/version/route.ts"), "utf8");
    assert.ok(
      content.includes("Update installed, but service restart failed"),
      "Restart failure should not be reported as a completed update"
    );
  });
});
