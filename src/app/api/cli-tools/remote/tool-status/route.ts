"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireCliToolsAuth } from "@/lib/api/requireCliToolsAuth";
import {
  getRemoteToolBinaryStatus,
  parseCodexOzRouterStatus,
  readRemoteToolPrimaryConfig,
} from "@/shared/services/remoteCliRuntime";
import { getInstance } from "@/lib/db/remoteInstances";

export async function POST(request: NextRequest) {
  const authError = await requireCliToolsAuth(request);
  if (authError) return authError;

  let body: { instanceId?: string; toolId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.instanceId || !body.toolId) {
    return NextResponse.json({ error: "instanceId and toolId are required" }, { status: 400 });
  }

  const instance = getInstance(body.instanceId);
  if (!instance) {
    return NextResponse.json({ error: "Remote instance not found" }, { status: 404 });
  }

  try {
    const runtime = await getRemoteToolBinaryStatus(body.instanceId, body.toolId, {
      healthcheck: false,
    });

    let settings: Record<string, any> | null = null;
    let hasOzRouter = false;
    let config: string | null = null;

    if (runtime.installed && runtime.runnable) {
      config = await readRemoteToolPrimaryConfig(body.instanceId, body.toolId);
      if (config) {
        if (body.toolId === "codex") {
          hasOzRouter = parseCodexOzRouterStatus(config);
        } else {
          try {
            settings = JSON.parse(config);
            if (body.toolId === "claude") {
              hasOzRouter = !!settings?.env?.ANTHROPIC_BASE_URL;
            } else {
              const str = JSON.stringify(settings).toLowerCase();
              hasOzRouter = str.includes("ozrouter");
            }
          } catch {
            settings = null;
          }
        }
      }
    }

    return NextResponse.json({
      installed: runtime.installed,
      runnable: runtime.runnable,
      command: runtime.command,
      commandPath: runtime.commandPath,
      reason: runtime.reason,
      settings,
      config,
      hasOzRouter,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to check tool status" },
      { status: 500 }
    );
  }
}
