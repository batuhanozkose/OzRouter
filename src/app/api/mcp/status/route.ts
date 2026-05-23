import { NextResponse } from "next/server";
import { getAuditStats, queryAuditEntries } from "@ozrouter/open-sse/mcp-server/audit";
import { getMcpHttpStatus, ensureMcpTransport } from "../../../../../open-sse/mcp-server/httpTransport";
import { getSettings } from "@/lib/db/settings";

export async function GET() {
  try {
    const [stats, lastCallPage, settings] = await Promise.all([
      getAuditStats(),
      queryAuditEntries({ limit: 1, offset: 0 }),
      getSettings(),
    ]);

    const mcpEnabled = !!settings.mcpEnabled;
    const mcpTransport = (settings.mcpTransport as string) || "sse";

    // Eagerly initialize SSE transport if enabled — so status shows online immediately
    if (mcpEnabled && mcpTransport === "sse") {
      ensureMcpTransport(mcpTransport);
    }

    const httpStatus = getMcpHttpStatus();
    const online = mcpEnabled && !!httpStatus.transport;
    const now = Date.now();
    const startedAtMs = httpStatus.startedAt ? new Date(httpStatus.startedAt).getTime() : null;
    const uptimeMs =
      typeof startedAtMs === "number" && Number.isFinite(startedAtMs)
        ? Math.max(0, now - startedAtMs)
        : null;

    const lastCall = lastCallPage.entries[0] || null;

    return NextResponse.json({
      status: online ? "online" : "offline",
      online,
      enabled: mcpEnabled,
      transport: mcpTransport,
      heartbeatPath: null,
      heartbeat: online
        ? {
            pid: null,
            transport: mcpTransport,
            startedAt: httpStatus.startedAt || null,
            uptimeMs,
            lastHeartbeatAt: new Date().toISOString(),
            pidAlive: null,
            heartbeatAgeMs: 0,
          }
        : null,
      httpTransport: httpStatus,
      activity: {
        totalCalls24h: stats.totalCalls,
        successRate: stats.successRate,
        avgDurationMs: stats.avgDurationMs,
        topTools: stats.topTools,
        lastCallAt: lastCall?.createdAt || null,
        lastCallTool: lastCall?.toolName || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load MCP status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
