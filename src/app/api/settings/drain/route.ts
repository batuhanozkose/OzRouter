import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db/settings";
import {
  drainConnection,
  undrainConnection,
  getDrainedConnections,
  getThreshold,
  updateThreshold,
  serializeToPersist,
} from "@ozrouter/open-sse/services/connectionDrain";

type JsonRecord = Record<string, unknown>;

/**
 * GET /api/settings/drain — Get drain state and threshold
 */
export async function GET() {
  return NextResponse.json({
    threshold: getThreshold(),
    connections: getDrainedConnections(),
  });
}

/**
 * POST /api/settings/drain — Manual drain/undrain a connection
 * Body: { connectionId: string, action: "drain" | "undrain" }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { connectionId, action } = body as {
      connectionId?: string;
      action?: "drain" | "undrain";
    };

    if (!connectionId || typeof connectionId !== "string") {
      return NextResponse.json({ error: "connectionId required" }, { status: 400 });
    }

    if (action !== "drain" && action !== "undrain") {
      return NextResponse.json({ error: "action must be 'drain' or 'undrain'" }, { status: 400 });
    }

    if (action === "drain") {
      drainConnection(connectionId, "manual");
    } else {
      undrainConnection(connectionId);
    }

    // Persist state
    updateSettings({ drained_connections: serializeToPersist() });

    return NextResponse.json({
      success: true,
      connections: getDrainedConnections(),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * PUT /api/settings/drain — Update drain threshold
 * Body: { threshold: number }
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { threshold } = body as { threshold?: number };

    if (typeof threshold !== "number" || threshold <= 0 || threshold > 100) {
      return NextResponse.json({ error: "threshold must be between 1 and 100" }, { status: 400 });
    }

    updateThreshold(threshold);
    updateSettings({ drain_threshold_percent: threshold });

    return NextResponse.json({
      success: true,
      threshold: getThreshold(),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
