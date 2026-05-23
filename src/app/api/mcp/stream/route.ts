/**
 * MCP Streamable HTTP Transport — /api/mcp/stream
 *
 * Endpoints:
 *   POST   — send JSON-RPC messages to the MCP server
 *   GET    — open SSE stream for server-initiated messages
 *   DELETE — end session
 */

import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/db/settings";
import { handleMcpStreamableHTTP } from "../../../../../open-sse/mcp-server/httpTransport";
import { extractApiKey, isValidApiKey } from "@/sse/services/auth";

async function guardEnabled(): Promise<NextResponse | null> {
  const settings = await getSettings();
  if (!settings.mcpEnabled) {
    return NextResponse.json(
      { error: "MCP server is disabled. Enable it from the Endpoints page." },
      { status: 503 }
    );
  }
  const transport = (settings.mcpTransport as string) || "streamable-http";
  if (transport !== "streamable-http") {
    return NextResponse.json(
      {
        error: `MCP transport is set to "${transport}", not "streamable-http". Change it from Settings.`,
      },
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

export async function POST(request: NextRequest) {
  const authErr = await guardAuth(request);
  if (authErr) return authErr;
  const blocked = await guardEnabled();
  if (blocked) return blocked;
  return handleMcpStreamableHTTP(request);
}

export async function GET(request: NextRequest) {
  const authErr = await guardAuth(request);
  if (authErr) return authErr;
  const blocked = await guardEnabled();
  if (blocked) return blocked;
  return handleMcpStreamableHTTP(request);
}

export async function DELETE(request: NextRequest) {
  const authErr = await guardAuth(request);
  if (authErr) return authErr;
  const blocked = await guardEnabled();
  if (blocked) return blocked;
  return handleMcpStreamableHTTP(request);
}
