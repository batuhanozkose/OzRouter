import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLocalAddress, extractRoutingKey } from "../../src/lib/auth/bootstrapToken.ts";

// Test the pure, DB-independent functions

describe("isLocalAddress", () => {
  it("treats 127.0.0.1 as local", () => {
    assert.equal(isLocalAddress("127.0.0.1"), true);
  });

  it("treats ::1 as local", () => {
    assert.equal(isLocalAddress("::1"), true);
  });

  it("treats ::ffff:127.0.0.1 as local", () => {
    assert.equal(isLocalAddress("::ffff:127.0.0.1"), true);
  });

  it("treats localhost as local", () => {
    assert.equal(isLocalAddress("localhost"), true);
  });

  it("treats 0.0.0.0 as local", () => {
    assert.equal(isLocalAddress("0.0.0.0"), true);
  });

  it("treats 127.x.x.x as local", () => {
    assert.equal(isLocalAddress("127.0.0.2"), true);
    assert.equal(isLocalAddress("127.255.255.255"), true);
  });

  it("treats empty string as local (direct connection)", () => {
    assert.equal(isLocalAddress(""), true);
  });

  it("treats remote IP as non-local", () => {
    assert.equal(isLocalAddress("192.168.1.1"), false);
    assert.equal(isLocalAddress("10.0.0.1"), false);
    assert.equal(isLocalAddress("8.8.8.8"), false);
  });

  it("handles whitespace", () => {
    assert.equal(isLocalAddress("  127.0.0.1  "), true);
    assert.equal(isLocalAddress("  ::1  "), true);
  });

  it("is case-insensitive", () => {
    assert.equal(isLocalAddress("LOCALHOST"), true);
    assert.equal(isLocalAddress("Localhost"), true);
  });
});

describe("bootstrapToken module exports", () => {
  it("exports all required functions", async () => {
    const mod = await import("../../src/lib/auth/bootstrapToken.ts");
    assert.equal(typeof mod.generateBootstrapToken, "function");
    assert.equal(typeof mod.validateBootstrapToken, "function");
    assert.equal(typeof mod.clearBootstrapToken, "function");
    assert.equal(typeof mod.isBootstrapRequired, "function");
    assert.equal(typeof mod.hasBootstrapToken, "function");
    assert.equal(typeof mod.isLocalRequest, "function");
    assert.equal(typeof mod.isLocalAddress, "function");
    assert.equal(typeof mod.logBootstrapToken, "function");
  });
});

describe("logBootstrapToken", () => {
  it("calls logger.warn with token in message", async () => {
    const { logBootstrapToken } = await import("../../src/lib/auth/bootstrapToken.ts");
    const messages: string[] = [];
    const mockLogger = { warn: (...args: unknown[]) => messages.push(String(args[0])) };

    logBootstrapToken("test-token-abc", mockLogger);

    assert.ok(messages.length > 0, "Should log a message");
    assert.ok(messages[0].includes("test-token-abc"), "Message should contain the token");
    assert.ok(messages[0].includes("Bootstrap Token"), "Message should contain 'Bootstrap Token'");
  });
});
