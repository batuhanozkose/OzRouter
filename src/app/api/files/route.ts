import { NextRequest, NextResponse } from "next/server";
import { listFiles, createFile } from "@/lib/localDb";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

const MAX_FILE_BYTES = 512 * 1024 * 1024; // 512 MB

export async function GET(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
    const files = listFiles({ limit });
    return NextResponse.json({ files });
  } catch (error) {
    console.log("Error fetching files:", error);
    return NextResponse.json({ error: "Failed to fetch files" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const contentType = request.headers.get("content-type") || "";

    let filename: string;
    let purpose: string;
    let content: Buffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const purposeField = formData.get("purpose") as string | null;

      if (!file) {
        return NextResponse.json({ error: { message: "No file provided" } }, { status: 400 });
      }
      if (!purposeField) {
        return NextResponse.json({ error: { message: "Purpose is required" } }, { status: 400 });
      }

      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: { message: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024}MB)` } }, { status: 400 });
      }

      filename = file.name || "batch_input.jsonl";
      purpose = purposeField;
      content = Buffer.from(await file.arrayBuffer());
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      if (!body.content) {
        return NextResponse.json({ error: { message: "Content is required" } }, { status: 400 });
      }
      if (!body.purpose) {
        return NextResponse.json({ error: { message: "Purpose is required" } }, { status: 400 });
      }
      if (typeof body.content !== "string") {
        return NextResponse.json({ error: { message: "Content must be a string" } }, { status: 400 });
      }
      if (Buffer.byteLength(body.content, "utf-8") > MAX_FILE_BYTES) {
        return NextResponse.json({ error: { message: `Content too large (max ${MAX_FILE_BYTES / 1024 / 1024}MB)` } }, { status: 400 });
      }

      filename = body.filename || "batch_input.jsonl";
      purpose = body.purpose;
      content = Buffer.from(body.content, "utf-8");
    } else {
      return NextResponse.json({ error: { message: "Unsupported content type. Use multipart/form-data or application/json" } }, { status: 400 });
    }

    // Validate JSONL format
    const text = content.toString("utf-8");
    const lines = text.split("\n").filter((line) => line.trim());
    for (let i = 0; i < lines.length; i++) {
      try {
        JSON.parse(lines[i]);
      } catch {
        return NextResponse.json({ error: { message: `Invalid JSON at line ${i + 1}` } }, { status: 400 });
      }
    }

    const record = createFile({
      filename,
      purpose,
      content,
      mimeType: "application/jsonl",
      bytes: content.length,
      apiKeyId: null,
      status: "validating",
    });

    return NextResponse.json({
      id: record.id,
      bytes: record.bytes,
      created_at: record.createdAt,
      filename: record.filename,
      object: "file",
      purpose: record.purpose,
      status: record.status || "validating",
      expires_at: record.expiresAt || null,
    });
  } catch (error: any) {
    console.log("Error creating file:", error);
    return NextResponse.json({ error: { message: error.message || "Failed to create file" } }, { status: 500 });
  }
}
