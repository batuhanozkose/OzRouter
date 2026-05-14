import { NextResponse } from "next/server";
import { getStats } from "@ozrouter/open-sse/services/inflightTracker";

/**
 * GET /api/v1/inflight — Get real-time inflight request status
 */
export async function GET() {
  return NextResponse.json(getStats());
}
