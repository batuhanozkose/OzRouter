"use server";

import { NextRequest, NextResponse } from "next/server";
import { listInstances, createInstance, deleteInstance, getInstance } from "@/lib/db/remoteInstances";
import { connectionManager } from "@/lib/ssh/connectionManager";
import { isAuthenticated } from "@/shared/utils/apiAuth";

const createSchema = {
  label: "string",
  host: "string",
  port: "number?",
  username: "string",
  authType: "string",
  password: "string?",
  privateKey: "string?",
};

function validateCreateBody(body: any) {
  const errors: string[] = [];
  if (!body.label || typeof body.label !== "string") errors.push("label is required");
  if (!body.host || typeof body.host !== "string") errors.push("host is required");
  if (!body.username || typeof body.username !== "string") errors.push("username is required");
  if (body.authType && !["password", "privateKey"].includes(body.authType)) {
    errors.push("authType must be 'password' or 'privateKey'");
  }
  return errors;
}

export async function GET(request: NextRequest) {
  const authed = await isAuthenticated(request);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const instances = listInstances();
    return NextResponse.json({ instances });
  } catch (error) {
    return NextResponse.json({ error: "Failed to list instances" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authed = await isAuthenticated(request);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    if (body._action === "test") {
      const testId = body.id;
      if (testId) {
        const result = await connectionManager.testConnection(testId);
        return NextResponse.json(result);
      }

      const errors = validateCreateBody(body);
      if (errors.length > 0) {
        return NextResponse.json({ success: false, error: errors.join(", ") }, { status: 400 });
      }

      // Test with inline credentials (not yet stored)
      try {
        const { createClient } = await import("@/lib/ssh/connectionManager");
        const result = await connectionManager.testConnection("__inline__");
        return NextResponse.json(result);
      } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message });
      }
    }

    const errors = validateCreateBody(body);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
    }

    const instance = createInstance({
      label: body.label,
      host: body.host,
      port: body.port ?? 22,
      username: body.username,
      authType: body.authType,
      password: body.password,
      privateKey: body.privateKey,
    });

    return NextResponse.json({ success: true, instance });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create instance" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authed = await isAuthenticated(request);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    connectionManager.disconnect(id);
    const deleted = deleteInstance(id);
    if (!deleted) {
      return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
