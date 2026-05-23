import { NextResponse } from "next/server";
import { getMcpHttpStatus, ensureMcpTransport } from "../../../../../open-sse/mcp-server/httpTransport";
import { extractApiKey, isValidApiKey } from "@/sse/services/auth";
import { getSettings } from "@/lib/db/settings";

async function guardAuth(request: Request): Promise<NextResponse | null> {
  const requireKey = process.env.REQUIRE_API_KEY === "true";
  const apiKey = extractApiKey(request);
  if (requireKey && !apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 });
  }
  if (apiKey) {
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
  }
  return null;
}

export async function GET(request: Request) {
  const authError = await guardAuth(request);
  if (authError) return authError;

  try {
    const settings = await getSettings();

    if (!settings.mcpEnabled) {
      return NextResponse.json(
        { error: "MCP server is disabled. Enable it from the Endpoints page." },
        { status: 503 }
      );
    }

    const mcpTransport = (settings.mcpTransport as string) || "sse";

    // Eager init for SSE
    if (mcpTransport === "sse") {
      ensureMcpTransport(mcpTransport as "sse");
    }

    const httpStatus = getMcpHttpStatus();
    const baseUrl = process.env.OZROUTER_BASE_URL || `http://localhost:${process.env.API_PORT || "20128"}`;

    // Test internal health endpoint
    let healthResult: unknown = null;
    let healthOk = false;
    let healthError: string | null = null;

    try {
      const res = await fetch(`${baseUrl}/api/monitoring/health`, {
        headers: process.env.OZROUTER_API_KEY
          ? { Authorization: `Bearer ${process.env.OZROUTER_API_KEY}` }
          : {},
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        healthResult = await res.json();
        healthOk = true;
      } else {
        healthError = `HTTP ${res.status}: ${await res.text().catch(() => "Unknown error")}`;
      }
    } catch (err) {
      healthError = err instanceof Error ? err.message : String(err);
    }

    return NextResponse.json({
      mcpEnabled: true,
      transport: mcpTransport,
      transportOnline: !!httpStatus.transport,
      transportStartedAt: httpStatus.startedAt,
      uptime: httpStatus.uptime,
      activeSessions: httpStatus.transport === "streamable-http"
        ? httpStatus.startedAt ? 1 : 0
        : httpStatus.transport === "sse" ? 1 : 0,
      healthCheck: {
        ok: healthOk,
        error: healthError,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP test failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
