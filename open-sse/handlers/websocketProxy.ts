/**
 * WebSocket Proxy — Codex/OpenAI Responses API
 *
 * Bidirectional WebSocket proxy between client and upstream OpenAI.
 * Supports Codex CLI native WebSocket transport while keeping
 * OzRouter's account pooling and load balancing.
 *
 * Protocol: Client ↔ OzRouter ↔ OpenAI (wss://api.openai.com)
 */

import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

const HEARTBEAT_INTERVAL_MS = 30_000;
const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_UPSTREAM_WS_URL = "wss://api.openai.com/v1/responses";

export interface WebSocketProxyOptions {
  /** Upstream WebSocket URL */
  upstreamUrl?: string;
  /** Authorization header for upstream */
  authHeader?: string;
  /** Additional headers to forward upstream */
  extraHeaders?: Record<string, string>;
  /** Logger */
  log?: {
    info: (category: string, message: string) => void;
    warn: (category: string, message: string) => void;
    error: (category: string, message: string) => void;
  };
}

/**
 * Handle WebSocket upgrade and proxy to upstream.
 */
export function handleWebSocketUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  options: WebSocketProxyOptions = {}
): void {
  const log = options.log || {
    info: (cat: string, msg: string) => console.log(`[${cat}] ${msg}`),
    warn: (cat: string, msg: string) => console.warn(`[${cat}] ${msg}`),
    error: (cat: string, msg: string) => console.error(`[${cat}] ${msg}`),
  };

  const upstreamUrl = options.upstreamUrl || DEFAULT_UPSTREAM_WS_URL;

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    wss.emit("connection", clientWs, req);

    log.info("WS_PROXY", `Client connected, proxying to ${upstreamUrl}`);

    // Build upstream headers
    const upstreamHeaders: Record<string, string> = {};
    if (options.authHeader) {
      upstreamHeaders["Authorization"] = options.authHeader;
    }
    if (options.extraHeaders) {
      Object.assign(upstreamHeaders, options.extraHeaders);
    }

    // Forward relevant client headers
    const forwardHeaders = ["openai-beta", "openai-organization", "x-request-id", "user-agent"];
    for (const name of forwardHeaders) {
      const value = req.headers[name];
      if (typeof value === "string") {
        upstreamHeaders[name] = value;
      }
    }

    // Connect to upstream
    const upstreamWs = new WebSocket(upstreamUrl, {
      headers: upstreamHeaders,
      handshakeTimeout: UPSTREAM_CONNECT_TIMEOUT_MS,
    });

    let clientAlive = true;
    let upstreamAlive = false;

    // ── Heartbeat ──────────────────────────────────────────────────────
    const heartbeat = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.ping();
      }
      if (upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);

    // ── Upstream → Client ──────────────────────────────────────────────
    upstreamWs.on("open", () => {
      upstreamAlive = true;
      log.info("WS_PROXY", "Upstream connection established");
    });

    upstreamWs.on("message", (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    upstreamWs.on("close", (code, reason) => {
      log.info("WS_PROXY", `Upstream closed: code=${code} reason=${reason?.toString()}`);
      cleanup(code, reason?.toString());
    });

    upstreamWs.on("error", (err) => {
      log.error("WS_PROXY", `Upstream error: ${err.message}`);
      cleanup(1011, "upstream_error");
    });

    upstreamWs.on("pong", () => {
      upstreamAlive = true;
    });

    // ── Client → Upstream ──────────────────────────────────────────────
    clientWs.on("message", (data, isBinary) => {
      if (upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(data, { binary: isBinary });
      }
    });

    clientWs.on("close", (code, reason) => {
      log.info("WS_PROXY", `Client closed: code=${code} reason=${reason?.toString()}`);
      cleanup(code, reason?.toString());
    });

    clientWs.on("error", (err) => {
      log.error("WS_PROXY", `Client error: ${err.message}`);
      cleanup(1011, "client_error");
    });

    clientWs.on("pong", () => {
      clientAlive = true;
    });

    // ── Cleanup ────────────────────────────────────────────────────────
    let cleaned = false;
    function cleanup(code?: number, reason?: string): void {
      if (cleaned) return;
      cleaned = true;

      clearInterval(heartbeat);

      const closeCode = code || 1000;

      if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
        try {
          clientWs.close(closeCode, reason);
        } catch {}
      }

      if (
        upstreamWs.readyState === WebSocket.OPEN ||
        upstreamWs.readyState === WebSocket.CONNECTING
      ) {
        try {
          upstreamWs.close(closeCode, reason);
        } catch {}
      }

      log.info("WS_PROXY", "Proxy session cleaned up");
    }
  });
}

/**
 * Check if a request is a WebSocket upgrade request.
 */
export function isWebSocketUpgrade(req: IncomingMessage): boolean {
  const connection = req.headers["connection"];
  const upgrade = req.headers["upgrade"];

  return (
    typeof connection === "string" &&
    connection.toLowerCase().includes("upgrade") &&
    typeof upgrade === "string" &&
    upgrade.toLowerCase() === "websocket"
  );
}

/**
 * Create a WebSocket server instance (no HTTP server attached).
 */
export function createWebSocketServer(): WebSocketServer {
  return new WebSocketServer({ noServer: true });
}
