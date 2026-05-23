import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const changelog = await readFile(join(process.cwd(), "CHANGELOG.md"), "utf8");
    return new NextResponse(changelog, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Changelog not found" }, { status: 404 });
  }
}
