/**
 * API Route: /api/pricing/sync
 *
 * POST   — Trigger a manual pricing sync from external sources.
 * GET    — Get current sync status.
 * PATCH  — Enable/disable periodic sync or set interval.
 * DELETE — Clear all synced pricing data.
 */

import { NextRequest, NextResponse } from "next/server";
import { pricingSyncRequestSchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { z } from "zod";

const syncConfigSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMs: z.number().int().min(60000).optional(),
});

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  try {
    const validation = validateBody(pricingSyncRequestSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { sources, dryRun = false } = validation.data;

    const { syncPricingFromSources } = await import("@/lib/pricingSync");
    const result = await syncPricingFromSources({ sources, dryRun });

    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { getSyncStatus } = await import("@/lib/pricingSync");
    return NextResponse.json(getSyncStatus());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          message: "Invalid request",
          details: [{ field: "body", message: "Invalid JSON body" }],
        },
      },
      { status: 400 }
    );
  }

  const parsed = syncConfigSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Validation failed", details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { setSyncEnabled, setSyncInterval, getSyncStatus } = await import("@/lib/pricingSync");

  if (typeof parsed.data.enabled === "boolean") {
    setSyncEnabled(parsed.data.enabled);
  }
  if (typeof parsed.data.intervalMs === "number") {
    setSyncInterval(parsed.data.intervalMs);
  }

  return NextResponse.json(getSyncStatus());
}

export async function DELETE() {
  try {
    const { clearSyncedPricing } = await import("@/lib/pricingSync");
    clearSyncedPricing();
    return NextResponse.json({ success: true, message: "Synced pricing data cleared" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
