/**
 * MCP SSE Transport — /api/mcp/sse
 *
 * Endpoints:
 *   GET    — open SSE stream for bidirectional communication
 *   POST   — send JSON-RPC messages to the MCP server
 */

import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/db/settings";
import { handleMcpSSE } from "../../../../../open-sse/mcp-server/httpTransport";
import { extractApiKey, isValidApiKey } from "@/sse/services/auth";

async function guardEnabled(): Promise<NextResponse | null> {
  const settings = await getSettings();
  if (!settings.mcpEnabled) {
    return NextResponse.json(
      { error: "MCP server is disabled. Enable it from the Endpoints page." },
      { status: 503 }
    );
  }
  const transport = (settings.mcpTransport as string) || "stdio";
  if (transport !== "sse") {
    return NextResponse.json(
      { error: `MCP transport is set to "${transport}", not "sse". Change it from Settings.` },
      { status: 400 }
    );
  }
  return null;
}

/**
 * Enforce API key authentication for MCP endpoints.
 * MCP endpoints use API key auth (not dashboard session auth),
 * so they work even when dashboard authentication is enabled.
 */
async function guardAuth(request: NextRequest): Promise<NextResponse | null> {
  const requireKey = process.env.REQUIRE_API_KEY === "true";
  const apiKey = extractApiKey(request as unknown as Request);

  if (requireKey && !apiKey) {
    return NextResponse.json(
      { error: "Unauthorized: API key required. Pass via Authorization: Bearer <key>." },
      { status: 401 }
    );
  }
  if (apiKey) {
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized: invalid API key." }, { status: 401 });
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authErr = await guardAuth(request);
  if (authErr) return authErr;
  const blocked = await guardEnabled();
  if (blocked) return blocked;
  return handleMcpSSE(request);
}

export async function POST(request: NextRequest) {
  const authErr = await guardAuth(request);
  if (authErr) return authErr;
  const blocked = await guardEnabled();
  if (blocked) return blocked;
  return handleMcpSSE(request);
}
