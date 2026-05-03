import { NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import {
  getProvider,
  generateAuthData,
  exchangeTokens,
  requestDeviceCode,
  pollForToken,
} from "@/lib/oauth/providers";
import {
  createProviderConnection,
  updateProviderConnection,
  getProviderConnections,
  isCloudEnabled,
  resolveProxyForProvider,
} from "@/models";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { syncToCloud } from "@/lib/cloudSync";
import { startLocalServer } from "@/lib/oauth/utils/server";
import { runWithProxyContext } from "@ozrouter/open-sse/utils/proxyFetch.ts";
import {
  jsonObjectSchema,
  oauthExchangeSchema,
  oauthPollSchema,
} from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { importCodexAuthFileFromLocalCli } from "@/lib/oauth/utils/codexAuthFile";
import { getCliConfigPaths, getCliRuntimeStatus } from "@/shared/services/cliRuntime";

type CodexDeviceAuthState = {
  id: string;
  status: "running" | "success" | "error";
  startedAt: number;
  stdout: string;
  stderr: string;
  verificationUrl: string | null;
  userCode: string | null;
  connectionId: string | null;
  importResult: unknown;
  error: string | null;
  child?: ReturnType<typeof spawn>;
  authSnapshot?: { existed: boolean; content: string | null; authPath: string | null };
  timeout?: NodeJS.Timeout;
};

const codexDeviceAuthGlobal = globalThis as typeof globalThis & {
  __codexDeviceAuthState?: CodexDeviceAuthState | null;
};

// Use globalThis to persist callback server state across Next.js HMR reloads
if (!globalThis.__codexCallbackState) {
  globalThis.__codexCallbackState = null;
}
if (!codexDeviceAuthGlobal.__codexDeviceAuthState) {
  codexDeviceAuthGlobal.__codexDeviceAuthState = null;
}

/**
 * Constant-time string comparison to prevent timing-oracle attacks (CWE-208).
 * Handles null/undefined safely and different-length strings.
 */
function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return a === b;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Dynamic OAuth API Route
 * Handles: authorize, exchange, device-code, poll, start-callback-server, poll-callback
 */

// GET /api/oauth/[provider]/authorize - Generate auth URL
// GET /api/oauth/[provider]/device-code - Request device code (for device_code flow)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string; action: string }> }
) {
  try {
    const { provider, action } = await params;
    const { searchParams } = new URL(request.url);

    if (action === "authorize") {
      const redirectUri = searchParams.get("redirect_uri") || "http://localhost:8080/callback";
      const authData = generateAuthData(provider, redirectUri);
      if (provider === "qoder" && !authData.authUrl) {
        return NextResponse.json({
          ...authData,
          supported: false,
          error:
            "Qoder browser OAuth is experimental and disabled by default. Configure QODER_OAUTH_* environment variables or use a Personal Access Token.",
        });
      }
      return NextResponse.json(authData);
    }

    if (action === "device-code") {
      const providerData = getProvider(provider);
      if (providerData.flowType !== "device_code") {
        return NextResponse.json(
          { error: "Provider does not support device code flow" },
          { status: 400 }
        );
      }

      const authData = generateAuthData(provider, null);
      const startUrl = searchParams.get("startUrl");
      const region = searchParams.get("region") || "us-east-1";

      // Resolve proxy for this provider (provider-level → global → direct)
      const proxy = await resolveProxyForProvider(provider);

      // Request device code (through proxy if configured)
      let deviceData;
      if (
        provider === "github" ||
        provider === "kiro" ||
        provider === "amazon-q" ||
        provider === "kimi-coding" ||
        provider === "kilocode"
      ) {
        // GitHub, Kiro/Amazon Q, Kimi Coding, and KiloCode don't use PKCE for device code
        if ((provider === "kiro" || provider === "amazon-q") && startUrl) {
          const providerOverrideConfig = {
            ...providerData.config,
            startUrl,
            region,
            skipIssuerUrlForRegistration: true,
            registerClientUrl: `https://oidc.${region}.amazonaws.com/client/register`,
            deviceAuthUrl: `https://oidc.${region}.amazonaws.com/device_authorization`,
            tokenUrl: `https://oidc.${region}.amazonaws.com/token`,
            ssoOidcEndpoint: `https://oidc.${region}.amazonaws.com`,
          };

          deviceData = await runWithProxyContext(proxy, () =>
            (requestDeviceCode as any)(provider, null, providerOverrideConfig)
          );
        } else {
          deviceData = await runWithProxyContext(proxy, () => (requestDeviceCode as any)(provider));
        }
      } else {
        // Qwen and other providers use PKCE
        deviceData = await runWithProxyContext(proxy, () =>
          requestDeviceCode(provider, authData.codeChallenge)
        );
      }

      return NextResponse.json({
        ...deviceData,
        codeVerifier: authData.codeVerifier,
      });
    }

    if (action === "start-callback-server") {
      return await handleStartCallbackServer(provider, searchParams);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.log("OAuth GET error:", error);
    return NextResponse.json({ error: (error as any).message }, { status: 500 });
  }
}

/**
 * Start Codex callback server on port 1455
 * Returns the auth URL and stores codeVerifier for later exchange
 */
async function handleStartCallbackServer(provider: string, searchParams: URLSearchParams) {
  if (provider !== "codex") {
    return NextResponse.json(
      { error: "Callback server only supported for codex" },
      { status: 400 }
    );
  }

  // Clean up existing server if any
  if (globalThis.__codexCallbackState?.close) {
    try {
      globalThis.__codexCallbackState.close();
    } catch (e) {
      /* ignore */
    }
  }
  globalThis.__codexCallbackState = null;

  try {
    // Start temp server on port 1455
    const { port, close } = await startLocalServer((params) => {
      // Write directly to globalThis so it survives module reloads
      if (globalThis.__codexCallbackState) {
        globalThis.__codexCallbackState.callbackParams = params;
      }
    }, 1455);

    const redirectUri = `http://localhost:${port}/auth/callback`;
    const authData = generateAuthData(provider, redirectUri);

    globalThis.__codexCallbackState = {
      callbackParams: null,
      close,
      port,
      redirectUri,
      codeVerifier: authData.codeVerifier,
      startedAt: Date.now(),
    };

    // Auto-cleanup after 5 minutes
    const startedAt = Date.now();
    setTimeout(() => {
      if (globalThis.__codexCallbackState?.startedAt === startedAt) {
        try {
          close();
        } catch (e) {
          /* ignore */
        }
        globalThis.__codexCallbackState = null;
      }
    }, 300000);

    return NextResponse.json({
      authUrl: authData.authUrl,
      codeVerifier: authData.codeVerifier,
      redirectUri,
      serverPort: port,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as any).message }, { status: 500 });
  }
}

function redactCliOutput(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-redacted")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "jwt-redacted");
}

function stripAnsiAndControl(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function isLikelyCodexDeviceCode(value: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4,5}$/.test(value) || /^[A-Z0-9]{6,12}$/.test(value);
}

function extractLikelyCodexDeviceCode(outputWithoutUrls: string): string | null {
  const codeLines = outputWithoutUrls
    .split(/\r?\n/)
    .filter((line) => /\b(?:code|verification|device)\b/i.test(line));
  const preferredText = codeLines.length > 0 ? codeLines.join("\n") : outputWithoutUrls;
  const preferredTokens =
    preferredText.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,5}\b|\b[A-Z0-9]{6,12}\b/g) || [];
  const preferredCode = preferredTokens.find(isLikelyCodexDeviceCode);
  if (preferredCode) return preferredCode;

  const allTokens =
    outputWithoutUrls.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,5}\b|\b[A-Z0-9]{6,12}\b/g) || [];
  return allTokens.find(isLikelyCodexDeviceCode) || null;
}

export function extractCodexDeviceAuthHints(output: string) {
  const cleanOutput = stripAnsiAndControl(output);
  const urls = (cleanOutput.match(/https?:\/\/[^\s"'<>]+/g) || []).map((url) =>
    url.replace(/[),.;\]]+$/g, "")
  );
  const verificationUrl =
    urls.find((url) => /openai|auth|device|login/i.test(url)) || urls[0] || null;
  const outputWithoutUrls = cleanOutput.replace(/https?:\/\/[^\s"'<>]+/g, " ");
  const userCode = extractLikelyCodexDeviceCode(outputWithoutUrls);

  return {
    verificationUrl,
    userCode,
  };
}

async function snapshotCodexAuthFile() {
  const paths = getCliConfigPaths("codex");
  const authPath = paths?.auth || null;
  if (!authPath) return { existed: false, content: null, authPath };

  try {
    return {
      existed: true,
      content: await fs.readFile(authPath, "utf8"),
      authPath,
    };
  } catch {
    return { existed: false, content: null, authPath };
  }
}

async function restoreCodexAuthSnapshot(snapshot?: CodexDeviceAuthState["authSnapshot"]) {
  if (!snapshot?.authPath || !snapshot.existed || snapshot.content == null) return;

  await fs.mkdir(path.dirname(snapshot.authPath), { recursive: true });
  await fs.writeFile(snapshot.authPath, snapshot.content, { encoding: "utf8", mode: 0o600 });
  try {
    await fs.chmod(snapshot.authPath, 0o600);
  } catch {
    // Best effort on platforms that ignore chmod semantics.
  }
}

async function handleStartCodexDeviceLogin(request: Request, connectionId?: string | null) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const current = codexDeviceAuthGlobal.__codexDeviceAuthState;
  if (current?.status === "running") {
    return NextResponse.json({
      success: false,
      pending: true,
      error: "already_running",
      errorDescription: "A Codex CLI device-auth login is already running.",
      verificationUrl: current.verificationUrl,
      userCode: current.userCode,
    });
  }

  const runtime = await getCliRuntimeStatus("codex");
  if (!runtime.installed || !runtime.runnable || !runtime.commandPath) {
    return NextResponse.json(
      {
        success: false,
        error: "codex_cli_unavailable",
        errorDescription:
          runtime.installed && !runtime.runnable
            ? "Codex CLI is installed but not runnable."
            : "Codex CLI is not installed.",
        runtime,
      },
      { status: 409 }
    );
  }

  const authSnapshot = await snapshotCodexAuthFile();
  const state: CodexDeviceAuthState = {
    id: randomUUID(),
    status: "running",
    startedAt: Date.now(),
    stdout: "",
    stderr: "",
    verificationUrl: null,
    userCode: null,
    connectionId: connectionId || null,
    importResult: null,
    error: null,
    authSnapshot,
  };

  const child = spawn(runtime.commandPath, ["login", "--device-auth"], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  state.child = child;
  codexDeviceAuthGlobal.__codexDeviceAuthState = state;

  const updateOutput = (chunk: Buffer) => {
    state.stdout = redactCliOutput((state.stdout + chunk.toString()).slice(-12000));
    const hints = extractCodexDeviceAuthHints(`${state.stdout}\n${state.stderr}`);
    state.verificationUrl = hints.verificationUrl;
    state.userCode = hints.userCode;
  };
  child.stdout.on("data", updateOutput);
  child.stderr.on("data", (chunk) => {
    state.stderr = redactCliOutput((state.stderr + chunk.toString()).slice(-12000));
    const hints = extractCodexDeviceAuthHints(`${state.stdout}\n${state.stderr}`);
    state.verificationUrl = hints.verificationUrl;
    state.userCode = hints.userCode;
  });

  state.timeout = setTimeout(
    () => {
      if (state.status !== "running") return;
      state.status = "error";
      state.error = "Codex CLI device-auth timed out.";
      child.kill("SIGKILL");
    },
    10 * 60 * 1000
  );

  child.on("error", (error) => {
    if (state.timeout) clearTimeout(state.timeout);
    state.status = "error";
    state.error = error.message || "Failed to start Codex CLI device-auth.";
  });

  child.on("close", async (code) => {
    if (state.timeout) clearTimeout(state.timeout);
    if (state.status !== "running") return;

    if (code !== 0) {
      state.status = "error";
      state.error = state.stderr || state.stdout || `Codex CLI exited with code ${code}`;
      return;
    }

    try {
      state.importResult = await importCodexAuthFileFromLocalCli({
        connectionId: state.connectionId,
      });
      await restoreCodexAuthSnapshot(state.authSnapshot);
      await syncToCloudIfEnabled();
      state.status = "success";
    } catch (error: any) {
      try {
        await restoreCodexAuthSnapshot(state.authSnapshot);
      } catch {
        // Preserve original import error.
      }
      state.status = "error";
      state.error = error?.message || "Failed to import Codex CLI auth.json.";
    }
  });

  return NextResponse.json({
    success: false,
    pending: true,
    id: state.id,
    verificationUrl: state.verificationUrl,
    userCode: state.userCode,
  });
}

async function handlePollCodexDeviceLogin(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const state = codexDeviceAuthGlobal.__codexDeviceAuthState;
  if (!state) {
    return NextResponse.json({
      success: false,
      pending: false,
      error: "no_device_login",
      errorDescription: "No Codex CLI device-auth login is running.",
    });
  }

  if (state.status === "success") {
    const result = state.importResult;
    codexDeviceAuthGlobal.__codexDeviceAuthState = null;
    return NextResponse.json({
      success: true,
      pending: false,
      result,
    });
  }

  if (state.status === "error") {
    const error = state.error || "Codex CLI device-auth failed.";
    codexDeviceAuthGlobal.__codexDeviceAuthState = null;
    return NextResponse.json({
      success: false,
      pending: false,
      error: "device_auth_failed",
      errorDescription: error,
    });
  }

  const hints = extractCodexDeviceAuthHints(`${state.stdout}\n${state.stderr}`);
  state.verificationUrl = hints.verificationUrl;
  state.userCode = hints.userCode;

  return NextResponse.json({
    success: false,
    pending: true,
    verificationUrl: state.verificationUrl,
    userCode: state.userCode,
    startedAt: state.startedAt,
  });
}

// POST /api/oauth/[provider]/exchange - Exchange code for tokens and save
// POST /api/oauth/[provider]/poll - Poll for token (device_code flow)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string; action: string }> }
) {
  try {
    const { provider, action } = await params;
    let rawBody: any = {};
    try {
      rawBody = await request.json();
    } catch {
      if (
        action !== "poll-callback" &&
        action !== "device-login-start" &&
        action !== "device-login-poll"
      ) {
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
    }

    let body: any = rawBody;
    if (action === "exchange") {
      const validation = validateBody(oauthExchangeSchema, rawBody);
      if (isValidationFailure(validation)) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      body = validation.data;
    } else if (action === "poll") {
      const validation = validateBody(oauthPollSchema, rawBody);
      if (isValidationFailure(validation)) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      body = validation.data;
    } else if (action === "poll-callback") {
      const validation = validateBody(jsonObjectSchema, rawBody || {});
      if (isValidationFailure(validation)) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      body = validation.data;
    } else if (action === "device-login-start" || action === "device-login-poll") {
      const validation = validateBody(jsonObjectSchema, rawBody || {});
      if (isValidationFailure(validation)) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      body = validation.data;
    }

    if (action === "device-login-start") {
      if (provider !== "codex") {
        return NextResponse.json(
          { error: "Codex CLI device-auth is only supported for codex" },
          { status: 400 }
        );
      }
      return handleStartCodexDeviceLogin(request, body.connectionId);
    }

    if (action === "device-login-poll") {
      if (provider !== "codex") {
        return NextResponse.json(
          { error: "Codex CLI device-auth is only supported for codex" },
          { status: 400 }
        );
      }
      return handlePollCodexDeviceLogin(request);
    }

    if (action === "exchange") {
      const { code, redirectUri, connectionId, codeVerifier, state } = body;
      const normalizedState = typeof state === "string" && state.length > 0 ? state : undefined;
      const providerData = getProvider(provider);

      if (providerData.flowType === "authorization_code_pkce" && !codeVerifier) {
        return NextResponse.json(
          {
            error: {
              message: "Invalid request",
              details: [
                {
                  field: "codeVerifier",
                  message: `Code verifier is required for ${provider} OAuth exchange`,
                },
              ],
            },
          },
          { status: 400 }
        );
      }

      // Resolve proxy for this provider (provider-level → global → direct)
      const proxy = await resolveProxyForProvider(provider);

      // Exchange code for tokens (through proxy if configured)
      const tokenData = await runWithProxyContext(proxy, () =>
        exchangeTokens(provider, code, redirectUri, codeVerifier, normalizedState)
      );

      // Normalize: if name is missing, use email or displayName as fallback so accounts
      // always show a real label (e.g. user@gmail.com) instead of "Account #abc123"
      if (!tokenData.name && (tokenData.email || tokenData.displayName)) {
        tokenData.name = tokenData.email || tokenData.displayName;
      }

      // Upsert: update existing connection if same provider+email, else create new
      const expiresAt = tokenData.expiresIn
        ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
        : null;

      let connection: any;
      if (tokenData.email) {
        const existing = await getProviderConnections({ provider });
        const match = existing.find((c: any) => {
          if (c.id && safeEqual(connectionId, c.id)) return true;
          // safeEqual: constant-time comparison to prevent timing attacks (CWE-208, finding #258-6/7)
          if (!safeEqual(c.email, tokenData.email) || c.authType !== "oauth") return false;
          // For Codex, also check workspaceId to avoid overwriting different workspace connections
          if (provider === "codex" && tokenData.providerSpecificData?.workspaceId) {
            const existingWorkspace = c.providerSpecificData?.workspaceId;
            return safeEqual(existingWorkspace, tokenData.providerSpecificData.workspaceId);
          }
          return true;
        });
        const matchId = typeof match?.id === "string" ? match.id : null;
        if (matchId) {
          connection = await updateProviderConnection(matchId, {
            ...tokenData,
            expiresAt,
            testStatus: "active",
            isActive: true,
          });
        }
      }
      if (!connection) {
        connection = await createProviderConnection({
          provider,
          authType: "oauth",
          ...tokenData,
          expiresAt,
          testStatus: "active",
        });
      }

      // Auto sync to Cloud if enabled
      await syncToCloudIfEnabled();

      return NextResponse.json({
        success: true,
        connection: {
          id: connection.id,
          provider: connection.provider,
          email: connection.email,
          displayName: connection.displayName,
        },
      });
    }

    if (action === "poll") {
      const { deviceCode, connectionId, codeVerifier, extraData } = body;

      // Resolve proxy for this provider (provider-level → global → direct)
      const proxy = await resolveProxyForProvider(provider);

      // Poll for token (through proxy if configured)
      let result;
      if (provider === "github" || provider === "kimi-coding" || provider === "kilocode") {
        // For providers that don't use PKCE (GitHub, Kimi Coding, KiloCode), don't pass codeVerifier
        result = await runWithProxyContext(proxy, () =>
          (pollForToken as any)(provider, deviceCode)
        );
      } else if (provider === "kiro" || provider === "amazon-q") {
        // Kiro needs extraData (clientId, clientSecret) from device code response
        result = await runWithProxyContext(proxy, () =>
          (pollForToken as any)(provider, deviceCode, null, extraData)
        );
      } else {
        // Qwen and other providers use PKCE
        if (!codeVerifier) {
          return NextResponse.json({ error: "Missing code verifier" }, { status: 400 });
        }
        result = await runWithProxyContext(proxy, () =>
          (pollForToken as any)(provider, deviceCode, codeVerifier)
        );
      }

      if (result.success) {
        // Normalize: if name is missing, use email as fallback display label
        if (!result.tokens.name && (result.tokens.email || result.tokens.displayName)) {
          result.tokens.name = result.tokens.email || result.tokens.displayName;
        }

        // Upsert: update existing connection if same provider+email, else create new
        const expiresAt = result.tokens.expiresIn
          ? new Date(Date.now() + result.tokens.expiresIn * 1000).toISOString()
          : null;

        let connection: any;
        if (result.tokens.email) {
          const existing = await getProviderConnections({ provider });
          const match = existing.find((c: any) => {
            if (c.id && safeEqual(connectionId, c.id)) return true;
            // safeEqual: constant-time comparison to prevent timing attacks (CWE-208, finding #258-8/9)
            if (!safeEqual(c.email, result.tokens.email) || c.authType !== "oauth") return false;
            // For Codex, also check workspaceId to avoid overwriting different workspace connections
            if (provider === "codex" && result.tokens.providerSpecificData?.workspaceId) {
              const existingWorkspace = c.providerSpecificData?.workspaceId;
              return safeEqual(existingWorkspace, result.tokens.providerSpecificData.workspaceId);
            }
            return true;
          });
          const matchId = typeof match?.id === "string" ? match.id : null;
          if (matchId) {
            connection = await updateProviderConnection(matchId, {
              ...result.tokens,
              expiresAt,
              testStatus: "active",
              isActive: true,
            });
          }
        }
        if (!connection) {
          connection = await createProviderConnection({
            provider,
            authType: "oauth",
            ...result.tokens,
            expiresAt,
            testStatus: "active",
          });
        }

        // Auto sync to Cloud if enabled
        await syncToCloudIfEnabled();

        return NextResponse.json({
          success: true,
          connection: {
            id: connection.id,
            provider: connection.provider,
          },
        });
      }

      // Still pending or error - don't create connection for pending states
      const isPending =
        result.pending || result.error === "authorization_pending" || result.error === "slow_down";

      return NextResponse.json({
        success: false,
        error: result.error,
        errorDescription: result.errorDescription,
        pending: isPending,
      });
    }

    if (action === "poll-callback") {
      const { connectionId } = body;

      // Poll for Codex callback server result
      if (provider !== "codex") {
        return NextResponse.json(
          { error: "poll-callback only supported for codex" },
          { status: 400 }
        );
      }

      if (!globalThis.__codexCallbackState) {
        return NextResponse.json({
          success: false,
          error: "no_server",
          errorDescription: "Callback server not running",
        });
      }

      if (!globalThis.__codexCallbackState.callbackParams) {
        return NextResponse.json({ success: false, pending: true });
      }

      // Callback received! Extract code and exchange for tokens
      const params = globalThis.__codexCallbackState.callbackParams;
      const { redirectUri, codeVerifier, close } = globalThis.__codexCallbackState;

      // Clean up server
      try {
        close();
      } catch (e) {
        /* ignore */
      }
      globalThis.__codexCallbackState = null;

      if (params.error) {
        return NextResponse.json({
          success: false,
          error: params.error,
          errorDescription: params.error_description,
        });
      }

      if (!params.code) {
        return NextResponse.json({
          success: false,
          error: "no_code",
          errorDescription: "No authorization code received",
        });
      }

      try {
        // Resolve proxy for this provider
        const proxy = await resolveProxyForProvider(provider);

        // Exchange code for tokens (through proxy if configured)
        const tokenData = await runWithProxyContext(proxy, () =>
          exchangeTokens(provider, params.code, redirectUri, codeVerifier, params.state)
        );

        // Normalize: if name is missing, use email as fallback display label
        if (!tokenData.name && (tokenData.email || tokenData.displayName)) {
          tokenData.name = tokenData.email || tokenData.displayName;
        }

        // Upsert: update existing connection if same provider+email, else create new
        const expiresAt = tokenData.expiresIn
          ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
          : null;

        let connection: any;
        if (tokenData.email) {
          const existing = await getProviderConnections({ provider });
          const match = existing.find((c: any) => {
            if (c.id && safeEqual(connectionId, c.id)) return true;
            // safeEqual: constant-time comparison to prevent timing attacks (CWE-208, finding #258-6/7)
            if (!safeEqual(c.email, tokenData.email) || c.authType !== "oauth") return false;
            // For Codex, also check workspaceId to avoid overwriting different workspace connections
            if (provider === "codex" && tokenData.providerSpecificData?.workspaceId) {
              const existingWorkspace = c.providerSpecificData?.workspaceId;
              return safeEqual(existingWorkspace, tokenData.providerSpecificData.workspaceId);
            }
            return true;
          });
          const matchId = typeof match?.id === "string" ? match.id : null;
          if (matchId) {
            connection = await updateProviderConnection(matchId, {
              ...tokenData,
              expiresAt,
              testStatus: "active",
              isActive: true,
            });
          }
        }
        if (!connection) {
          connection = await createProviderConnection({
            provider,
            authType: "oauth",
            ...tokenData,
            expiresAt,
            testStatus: "active",
          });
        }

        await syncToCloudIfEnabled();

        return NextResponse.json({
          success: true,
          connection: {
            id: connection.id,
            provider: connection.provider,
            email: connection.email,
            displayName: connection.displayName,
          },
        });
      } catch (exchangeErr: any) {
        return NextResponse.json({ success: false, error: exchangeErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.log("OAuth POST error:", error);
    return NextResponse.json({ error: (error as any).message }, { status: 500 });
  }
}

/**
 * Sync to Cloud if enabled
 */
async function syncToCloudIfEnabled() {
  try {
    const cloudEnabled = await isCloudEnabled();
    if (!cloudEnabled) return;

    const machineId = await getConsistentMachineId();
    await syncToCloud(machineId);
  } catch (error) {
    console.log("Error syncing to cloud after OAuth:", error);
  }
}
