/**
 * WebSocket Server — Next.js Integration
 *
 * Attaches a WebSocket server to the same HTTP server Next.js uses.
 * Handles upgrade requests for /api/v1/responses and /backend-api/codex/responses.
 *
 * Initialized from instrumentation-node.ts during server startup.
 */

import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  createWebSocketServer,
  handleWebSocketUpgrade,
  isWebSocketUpgrade,
} from "@ozrouter/open-sse/handlers/websocketProxy";

// WebSocket upgrade paths
const WS_PATHS = ["/api/v1/responses", "/backend-api/codex/responses"];

let wss: ReturnType<typeof createWebSocketServer> | null = null;
let initialized = false;

/**
 * Initialize the WebSocket server.
 * Call once during server startup.
 */
export function initWebSocketServer(): void {
  if (initialized) return;
  initialized = true;

  wss = createWebSocketServer();
  console.log("[WS_SERVER] WebSocket server created (paths:", WS_PATHS.join(", "), ")");
}

/**
 * Attach the WebSocket server to an HTTP server.
 * Listens for upgrade events and proxies matching paths.
 */
export function attachToHttpServer(server: HttpServer): void {
  if (!wss) {
    console.warn("[WS_SERVER] WebSocket server not initialized — call initWebSocketServer() first");
    return;
  }

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isWebSocketUpgrade(req)) return;

    const url = req.url || "";
    const path = url.split("?")[0];

    if (!WS_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
      return; // Not our path — let Next.js handle it
    }

    // Extract auth from request
    const authHeader = req.headers["authorization"] as string | undefined;

    // TODO: Resolve upstream URL from account pool / combo routing
    // For now, use default OpenAI endpoint
    handleWebSocketUpgrade(wss!, req, socket, head, {
      authHeader,
      log: {
        info: (cat, msg) => console.log(`[${cat}] ${msg}`),
        warn: (cat, msg) => console.warn(`[${cat}] ${msg}`),
        error: (cat, msg) => console.error(`[${cat}] ${msg}`),
      },
    });
  });

  console.log("[WS_SERVER] Attached to HTTP server");
}

/**
 * Check if WebSocket server is initialized.
 */
export function isWebSocketServerInitialized(): boolean {
  return initialized;
}
