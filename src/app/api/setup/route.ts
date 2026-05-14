import { NextResponse } from "next/server";
import {
  isBootstrapRequired,
  hasBootstrapToken,
  validateBootstrapToken,
  clearBootstrapToken,
  isLocalRequest,
} from "@/lib/auth/bootstrapToken";
import { hashManagementPassword } from "@/lib/auth/managementPassword";
import { updateSettings } from "@/lib/db/settings";

/**
 * GET /api/setup — Check if initial setup is required
 */
export async function GET(req: Request) {
  const required = isBootstrapRequired();
  const hasToken = hasBootstrapToken();
  const isLocal = isLocalRequest(req);

  return NextResponse.json({
    required,
    hasToken,
    isLocal,
  });
}

/**
 * POST /api/setup — Complete initial setup with bootstrap token + password
 *
 * Body: { token?: string, password: string }
 * - Remote requests must include the bootstrap token
 * - Local requests (localhost) can skip the token
 */
export async function POST(req: Request) {
  try {
    // Check if setup is actually needed
    if (!isBootstrapRequired()) {
      return NextResponse.json(
        { error: "Setup already completed. Use login instead." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { token, password } = body as { token?: string; password?: string };

    // Validate password
    if (!password || typeof password !== "string" || password.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters." },
        { status: 400 }
      );
    }

    const isLocal = isLocalRequest(req);

    // Remote requests need bootstrap token
    if (!isLocal) {
      if (!hasBootstrapToken()) {
        return NextResponse.json(
          { error: "No bootstrap token available. Restart server to generate one." },
          { status: 400 }
        );
      }

      if (!token || typeof token !== "string") {
        return NextResponse.json(
          { error: "Bootstrap token required for remote setup." },
          { status: 401 }
        );
      }

      if (!validateBootstrapToken(token)) {
        return NextResponse.json({ error: "Invalid bootstrap token." }, { status: 401 });
      }
    }

    // Set password (bcrypt hash + store in settings)
    const hash = await hashManagementPassword(password);
    updateSettings({ password: hash });

    // Clear bootstrap token (one-time use)
    clearBootstrapToken();

    return NextResponse.json({
      success: true,
      message: "Setup completed. You can now log in with your password.",
    });
  } catch (error) {
    console.error("[SETUP] Failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
