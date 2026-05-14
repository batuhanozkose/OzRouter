/**
 * GET  /api/system/version  — Returns current version and latest GitHub tag
 * POST /api/system/version  — Triggers a deployment-aware background update
 *
 * Security: Requires admin authentication (same as other management routes).
 * Safety: Update only runs if a newer Git tag is available.
 */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import {
  getAutoUpdateConfig,
  launchAutoUpdate,
  validateAutoUpdateRuntime,
} from "@/lib/system/autoUpdate";
import { NEWS_JSON_URL, parseActiveNewsPayload } from "@/shared/utils/releaseNotes";
import { backupDbFileAndWait } from "@/lib/db/backup";

const execFileAsync = promisify(execFile);

// ── GitHub Release Info ─────────────────────────────────────────────────

type ReleaseInfo = {
  releaseName: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
};

async function getGitHubReleaseInfo(version: string): Promise<ReleaseInfo> {
  const empty: ReleaseInfo = { releaseName: null, releaseNotes: null, releaseUrl: null };
  try {
    const res = await fetch(
      `https://api.github.com/repos/batuhanozkose/OzRouter/releases/tags/v${version}`,
      { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/vnd.github+json" } }
    );
    if (!res.ok) return empty;
    const data = await res.json();
    return {
      releaseName: data.name || null,
      releaseNotes: data.body || null,
      releaseUrl: data.html_url || null,
    };
  } catch {
    return empty;
  }
}

export const dynamic = "force-dynamic";

function normalizeTagVersion(tag: string): string | null {
  const match = tag.match(/(?:refs\/tags\/)?v?(\d+\.\d+\.\d+(?:\.\d+)?)(?:\^{}|)$/);
  return match ? match[1] : null;
}

async function getLatestGitHubVersion(remote = "origin"): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-remote", "--tags", "--refs", remote], {
      timeout: 15000,
      cwd: process.cwd(),
    });

    return (
      stdout
        .split("\n")
        .map((line) => normalizeTagVersion(line.split(/\s+/)[1] || ""))
        .filter((version): version is string => Boolean(version))
        .sort(compareVersions)
        .at(-1) || null
    );
  } catch {
    return null;
  }
}

function getCurrentVersion(): string {
  try {
    return require("../../../../../package.json").version as string;
  } catch {
    return "unknown";
  }
}

function isNewer(a: string | null, b: string): boolean {
  if (!a) return false;
  return compareVersions(a, b) > 0;
}

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split(".").map(Number);
  const aParts = parse(a);
  const bParts = parse(b);
  const max = Math.max(aParts.length, bParts.length, 4);
  for (let i = 0; i < max; i++) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function getNews() {
  try {
    const res = await fetch(NEWS_JSON_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    return parseActiveNewsPayload(data);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const current = getCurrentVersion();
  const config = getAutoUpdateConfig();

  const [latest, news, validation] = await Promise.all([
    getLatestGitHubVersion(config.gitRemote),
    getNews(),
    validateAutoUpdateRuntime(config),
  ]);

  const updateAvailable = isNewer(latest, current);

  // Fetch release info for the latest version (non-blocking)
  const releaseInfo =
    latest && updateAvailable
      ? await getGitHubReleaseInfo(latest)
      : { releaseName: null, releaseNotes: null, releaseUrl: null };

  return NextResponse.json({
    current,
    latest: latest ?? "unavailable",
    updateAvailable,
    channel: config.mode,
    autoUpdateSupported: validation.supported,
    autoUpdateError: validation.reason,
    news,
    ...releaseInfo,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const current = getCurrentVersion();
  const config = getAutoUpdateConfig();
  const latest = await getLatestGitHubVersion(config.gitRemote);

  if (!latest) {
    return NextResponse.json(
      { success: false, error: "Could not reach GitHub tags" },
      { status: 503 }
    );
  }

  const resolvedTargetTag = latest.startsWith("v") ? latest : `v${latest}`;

  if (!isNewer(latest, current)) {
    return NextResponse.json({
      success: false,
      error: `Already on latest version (${current})`,
      current,
      latest,
    });
  }

  const validation = await validateAutoUpdateRuntime(config);

  if (!validation.supported) {
    return NextResponse.json(
      {
        success: false,
        error: validation.reason || "Auto-update is not supported in this environment.",
      },
      { status: 400 }
    );
  }

  let backupResult: Awaited<ReturnType<typeof backupDbFileAndWait>>;
  try {
    backupResult = await backupDbFileAndWait("air-update");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: `Database backup could not be created. Update aborted. ${message}`,
      },
      { status: 500 }
    );
  }

  if (!backupResult) {
    return NextResponse.json(
      { success: false, error: "Database backup could not be created. Update aborted." },
      { status: 500 }
    );
  }

  const launched = await launchAutoUpdate({ latest });
  if (!launched.started) {
    return NextResponse.json(
      {
        success: false,
        error: launched.error || "Failed to start auto-update.",
        channel: launched.channel,
        logPath: launched.logPath,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `Update to ${resolvedTargetTag} started in the background.`,
    from: current,
    to: latest,
    channel: launched.channel,
    logPath: launched.logPath,
    backup: backupResult.filename,
  });
}
