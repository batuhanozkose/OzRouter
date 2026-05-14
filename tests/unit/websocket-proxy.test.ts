import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isWebSocketUpgrade,
  createWebSocketServer,
} from "../../open-sse/handlers/websocketProxy.ts";

// Test pure utility functions (no actual WebSocket connections needed)

describe("isWebSocketUpgrade", () => {
  it("detects valid WebSocket upgrade request", () => {
    const req = {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
      },
    };
    assert.equal(isWebSocketUpgrade(req as any), true);
  });

  it("detects case-insensitive headers", () => {
    const req = {
      headers: {
        connection: "keep-alive, Upgrade",
        upgrade: "WebSocket",
      },
    };
    assert.equal(isWebSocketUpgrade(req as any), true);
  });

  it("rejects non-upgrade request", () => {
    const req = {
      headers: {
        connection: "keep-alive",
      },
    };
    assert.equal(isWebSocketUpgrade(req as any), false);
  });

  it("rejects non-websocket upgrade", () => {
    const req = {
      headers: {
        connection: "Upgrade",
        upgrade: "h2c",
      },
    };
    assert.equal(isWebSocketUpgrade(req as any), false);
  });

  it("handles missing headers", () => {
    const req = { headers: {} };
    assert.equal(isWebSocketUpgrade(req as any), false);
  });
});

describe("createWebSocketServer", () => {
  it("creates a WebSocket.Server instance", () => {
    const wss = createWebSocketServer();
    assert.ok(wss, "Should create a server instance");
    assert.equal(typeof wss.handleUpgrade, "function");
    wss.close();
  });
});

describe("WebSocket proxy module exports", () => {
  it("exports all required functions", async () => {
    const mod = await import("../../open-sse/handlers/websocketProxy.ts");
    assert.equal(typeof mod.handleWebSocketUpgrade, "function");
    assert.equal(typeof mod.isWebSocketUpgrade, "function");
    assert.equal(typeof mod.createWebSocketServer, "function");
  });
});

describe("WebSocket server module exports", () => {
  it("exports all required functions", async () => {
    const mod = await import("../../src/server/websocketServer.ts");
    assert.equal(typeof mod.initWebSocketServer, "function");
    assert.equal(typeof mod.attachToHttpServer, "function");
    assert.equal(typeof mod.isWebSocketServerInitialized, "function");
  });
});
