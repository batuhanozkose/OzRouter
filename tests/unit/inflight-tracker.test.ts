import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  acquire,
  release,
  getStats,
  getGlobalCount,
  getProviderCount,
  getLimits,
  updateLimits,
  waitForDrain,
  _resetForTesting,
} from "../../open-sse/services/inflightTracker.ts";

describe("inflightTracker", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe("acquire/release", () => {
    it("acquires and releases correctly", () => {
      assert.equal(acquire("openai"), true);
      assert.equal(getGlobalCount(), 1);
      assert.equal(getProviderCount("openai"), 1);

      release("openai");
      assert.equal(getGlobalCount(), 0);
      assert.equal(getProviderCount("openai"), 0);
    });

    it("tracks multiple providers independently", () => {
      acquire("openai");
      acquire("anthropic");
      acquire("openai");

      assert.equal(getGlobalCount(), 3);
      assert.equal(getProviderCount("openai"), 2);
      assert.equal(getProviderCount("anthropic"), 1);

      release("openai");
      assert.equal(getGlobalCount(), 2);
      assert.equal(getProviderCount("openai"), 1);
      assert.equal(getProviderCount("anthropic"), 1);
    });

    it("does not go below zero on extra release", () => {
      acquire("openai");
      release("openai");
      release("openai"); // extra release
      assert.equal(getGlobalCount(), 0);
      assert.equal(getProviderCount("openai"), 0);
    });
  });

  describe("global limit", () => {
    it("blocks when global limit reached", () => {
      updateLimits(3, 100);

      assert.equal(acquire("a"), true);
      assert.equal(acquire("b"), true);
      assert.equal(acquire("c"), true);
      assert.equal(acquire("d"), false); // blocked by global limit

      assert.equal(getGlobalCount(), 3);
    });

    it("allows after release", () => {
      updateLimits(2, 100);

      acquire("a");
      acquire("b");
      assert.equal(acquire("c"), false);

      release("a");
      assert.equal(acquire("c"), true);
      assert.equal(getGlobalCount(), 2);
    });
  });

  describe("per-provider limit", () => {
    it("blocks when per-provider limit reached", () => {
      updateLimits(100, 2);

      assert.equal(acquire("openai"), true);
      assert.equal(acquire("openai"), true);
      assert.equal(acquire("openai"), false); // blocked by per-provider limit

      // Different provider still OK
      assert.equal(acquire("anthropic"), true);
    });

    it("allows different provider after one is full", () => {
      updateLimits(100, 1);

      acquire("openai");
      assert.equal(acquire("openai"), false);
      assert.equal(acquire("anthropic"), true);
    });
  });

  describe("getStats", () => {
    it("returns correct stats", () => {
      updateLimits(50, 10);
      acquire("openai");
      acquire("openai");
      acquire("anthropic");

      const stats = getStats();
      assert.equal(stats.global, 3);
      assert.equal(stats.perProvider["openai"], 2);
      assert.equal(stats.perProvider["anthropic"], 1);
      assert.equal(stats.limits.global, 50);
      assert.equal(stats.limits.perProvider, 10);
    });

    it("returns empty stats when idle", () => {
      const stats = getStats();
      assert.equal(stats.global, 0);
      assert.deepEqual(stats.perProvider, {});
    });
  });

  describe("updateLimits", () => {
    it("updates limits correctly", () => {
      updateLimits(200, 50);
      const limits = getLimits();
      assert.equal(limits.global, 200);
      assert.equal(limits.perProvider, 50);
    });

    it("falls back to defaults for invalid values", () => {
      updateLimits(0, -1);
      const limits = getLimits();
      assert.equal(limits.global, 100);
      assert.equal(limits.perProvider, 20);
    });
  });

  describe("waitForDrain", () => {
    it("resolves immediately when no inflight", async () => {
      const start = Date.now();
      await waitForDrain(1000);
      assert.ok(Date.now() - start < 100, "Should resolve immediately");
    });

    it("resolves when all inflight released", async () => {
      acquire("openai");
      acquire("anthropic");

      const drainPromise = waitForDrain(5000);

      // Release after small delay
      setTimeout(() => {
        release("openai");
        release("anthropic");
      }, 50);

      await drainPromise;
      assert.equal(getGlobalCount(), 0);
    });

    it("resolves on timeout even with inflight remaining", async () => {
      acquire("openai");

      const start = Date.now();
      await waitForDrain(100); // 100ms timeout
      const elapsed = Date.now() - start;

      assert.ok(elapsed >= 90, `Should wait ~100ms, waited ${elapsed}ms`);
      assert.equal(getGlobalCount(), 1); // still inflight
    });
  });
});
