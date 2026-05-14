import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { restoreFullBackupArchiveFile } from "@/lib/db/fullBackup";
import { isAuthenticated } from "@/shared/utils/apiAuth";

const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB

class UploadValidationError extends Error {
  status = 400;
}

function isFullBackupFilename(filename: string) {
  return filename.endsWith(".tar.gz") || filename.endsWith(".tgz");
}

async function readUploadedArchive(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      throw new UploadValidationError("No file provided. Upload a .tar.gz full backup.");
    }
    return {
      fileName: file.name,
      fileBuffer: Buffer.from(await file.arrayBuffer()),
    };
  }

  const buffer = await request.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new UploadValidationError("No file content provided.");
  }

  const url = new URL(request.url);
  return {
    fileName: url.searchParams.get("filename") || "ozrouter-full-backup.tar.gz",
    fileBuffer: Buffer.from(buffer),
  };
}

/**
 * POST /api/db-backups/importAll — Upload a .tar.gz full backup created by exportAll.
 *
 * Restores storage.sqlite and call log artifacts, then preserves a full pre-import backup
 * under db_backups for rollback.
 */
export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tmpPath: string | null = null;

  try {
    const { fileName, fileBuffer } = await readUploadedArchive(request);

    if (!isFullBackupFilename(fileName)) {
      return NextResponse.json(
        { error: "Invalid file type. Only .tar.gz and .tgz files are accepted." },
        { status: 400 }
      );
    }

    if (fileBuffer.length > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum allowed size is ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB.` },
        { status: 400 }
      );
    }

    if (fileBuffer.length < 512) {
      return NextResponse.json(
        { error: "File too small to be a valid full backup archive." },
        { status: 400 }
      );
    }

    tmpPath = path.join(os.tmpdir(), `ozrouter-full-import-${Date.now()}.tar.gz`);
    fs.writeFileSync(tmpPath, fileBuffer);

    const result = await restoreFullBackupArchiveFile(tmpPath, fileName);
    console.log(
      `[DB] Imported full backup from upload: ${result.connectionCount} connections, ${result.nodeCount} nodes, ${result.comboCount} combos, ${result.apiKeyCount} API keys`
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[API] Error importing full backup:", error);
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* best effort */
      }
    }
  }
}
