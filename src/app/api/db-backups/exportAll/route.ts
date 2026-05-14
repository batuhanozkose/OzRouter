import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { createFullBackupArchiveFile } from "@/lib/db/fullBackup";
import { isAuthenticated } from "@/shared/utils/apiAuth";

/**
 * GET /api/db-backups/exportAll
 * Exports the database, settings summaries, and call log artifacts as a tar.gz archive.
 * Security: Requires admin authentication.
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let archivePath: string | null = null;

  try {
    const archive = await createFullBackupArchiveFile();
    archivePath = archive.archivePath;
    const archiveBuffer = fs.readFileSync(archive.archivePath);

    return new NextResponse(archiveBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${archive.filename}"`,
        "Content-Length": archiveBuffer.length.toString(),
      },
    });
  } catch (error: unknown) {
    console.error("[ExportAll] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to create full export",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    if (archivePath && fs.existsSync(archivePath)) {
      try {
        fs.unlinkSync(archivePath);
      } catch {
        /* best effort */
      }
    }
  }
}
