import { NextRequest, NextResponse } from "next/server";
import { listBatches, createBatch, getFile } from "@/lib/localDb";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { SUPPORTED_BATCH_ENDPOINTS } from "@/shared/constants/batchEndpoints";

export async function GET(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
    const batches = listBatches(undefined, limit);
    return NextResponse.json({ batches });
  } catch (error) {
    console.log("Error fetching batches:", error);
    return NextResponse.json({ error: "Failed to fetch batches" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { input_file_id, endpoint, completion_window, model, metadata, output_expires_after } = body;

    if (!input_file_id || !endpoint || !completion_window) {
      return NextResponse.json(
        { error: { message: "input_file_id, endpoint, and completion_window are required" } },
        { status: 400 }
      );
    }

    if (!SUPPORTED_BATCH_ENDPOINTS.includes(endpoint as any)) {
      return NextResponse.json(
        { error: { message: `Unsupported endpoint: ${endpoint}. Supported: ${SUPPORTED_BATCH_ENDPOINTS.join(", ")}` } },
        { status: 400 }
      );
    }

    const file = getFile(input_file_id);
    if (!file) {
      return NextResponse.json(
        { error: { message: `File not found: ${input_file_id}` } },
        { status: 400 }
      );
    }

    const record = createBatch({
      endpoint,
      completionWindow: completion_window,
      inputFileId: input_file_id,
      model: model || null,
      metadata: metadata || null,
      outputExpiresAfterSeconds: output_expires_after?.seconds || null,
      outputExpiresAfterAnchor: output_expires_after?.anchor || null,
    });

    return NextResponse.json({
      id: record.id,
      endpoint: record.endpoint,
      completion_window: record.completionWindow,
      status: record.status,
      input_file_id: record.inputFileId,
      object: "batch",
      created_at: record.createdAt,
      request_counts: {
        total: record.requestCountsTotal,
        completed: record.requestCountsCompleted,
        failed: record.requestCountsFailed,
      },
      metadata: record.metadata,
      model: record.model,
    });
  } catch (error: any) {
    console.log("Error creating batch:", error);
    return NextResponse.json(
      { error: { message: error.message || "Failed to create batch" } },
      { status: 500 }
    );
  }
}
