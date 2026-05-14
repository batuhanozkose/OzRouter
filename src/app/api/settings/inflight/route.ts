import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db/settings";
import { updateLimits, getLimits } from "@ozrouter/open-sse/services/inflightTracker";

type JsonRecord = Record<string, unknown>;

/**
 * GET /api/settings/inflight — Get inflight limits
 */
export async function GET() {
  const settings = getSettings() as JsonRecord;
  return NextResponse.json({
    inflight_max_global: settings.inflight_max_global ?? 100,
    inflight_max_per_provider: settings.inflight_max_per_provider ?? 20,
    current: getLimits(),
  });
}

/**
 * PUT /api/settings/inflight — Update inflight limits
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { inflight_max_global, inflight_max_per_provider } = body as {
      inflight_max_global?: number;
      inflight_max_per_provider?: number;
    };

    const updates: Record<string, unknown> = {};

    if (typeof inflight_max_global === "number" && inflight_max_global > 0) {
      updates.inflight_max_global = inflight_max_global;
    }
    if (typeof inflight_max_per_provider === "number" && inflight_max_per_provider > 0) {
      updates.inflight_max_per_provider = inflight_max_per_provider;
    }

    if (Object.keys(updates).length > 0) {
      updateSettings(updates);
      // Update runtime limits
      const settings = getSettings() as JsonRecord;
      updateLimits(
        (settings.inflight_max_global as number) ?? 100,
        (settings.inflight_max_per_provider as number) ?? 20
      );
    }

    return NextResponse.json({ success: true, limits: getLimits() });
  } catch (error) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
