import { NextRequest, NextResponse } from "next/server";
import { requireCliToolsAuth } from "@/lib/api/requireCliToolsAuth";
import { CLI_TOOL_IDS } from "@/shared/services/cliRuntime";
import { getRemoteToolsShallowStatuses } from "@/shared/services/remoteCliRuntime";
import { getInstance } from "@/lib/db/remoteInstances";

export async function POST(request: NextRequest) {
  const authError = await requireCliToolsAuth(request);
  if (authError) return authError;

  let body: { instanceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.instanceId) {
    return NextResponse.json({ error: "instanceId is required" }, { status: 400 });
  }

  const instance = getInstance(body.instanceId);
  if (!instance) {
    return NextResponse.json({ error: "Remote instance not found" }, { status: 404 });
  }

  try {
    console.log("[REMOTE_STATUS] Fetching statuses for", body.instanceId);
    const statuses: Record<string, any> = await getRemoteToolsShallowStatuses(
      body.instanceId,
      CLI_TOOL_IDS
    );
    console.log("[REMOTE_STATUS] Got shallow statuses:", Object.keys(statuses).length, "tools");

    for (const status of Object.values(statuses)) {
      if (!status.installed || !status.runnable) {
        status.configStatus = "not_installed";
      } else {
        status.configStatus = "unknown";
      }
    }

    return NextResponse.json(statuses);
  } catch (error: any) {
    const code = error.code || "";
    if (code === "SSH_CONNECT_TIMEOUT" || code === "SSH_HOST_UNREACHABLE") {
      return NextResponse.json({ error: code, message: error.message }, { status: 502 });
    }
    if (code === "SSH_AUTH_FAILED") {
      return NextResponse.json({ error: code, message: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to check remote status", message: error.message },
      { status: 500 }
    );
  }
}
