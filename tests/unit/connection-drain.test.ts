import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  drainConnection,
  undrainConnection,
  isDrained,
  getDrainedConnections,
  getDrainState,
  checkQuotaDrain,
  updateThreshold,
  getThreshold,
  loadFromPersisted,
  serializeToPersist,
  _resetForTesting,
} from "../../open-sse/services/connectionDrain.ts";

describe("connectionDrain", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe("drain/undrain", () => {
    it("drains a connection", () => {
      drainConnection("conn-1", "manual");
      assert.equal(isDrained("conn-1"), true);
    });

    it("undrains a connection", () => {
      drainConnection("conn-1", "manual");
      undrainConnection("conn-1");
      assert.equal(isDrained("conn-1"), false);
    });

    it("reports non-drained connection as false", () => {
      assert.equal(isDrained("unknown-conn"), false);
    });

    it("does not duplicate drain entries", () => {
      drainConnection("conn-1", "manual");
      drainConnection("conn-1", "quota"); // second call — should not override
      assert.equal(getDrainedConnections().length, 1);
      assert.equal(getDrainState("conn-1")?.reason, "manual"); // keeps original
    });
  });

  describe("getDrainedConnections", () => {
    it("returns all drained connections", () => {
      drainConnection("conn-a", "quota");
      drainConnection("conn-b", "manual");
      drainConnection("conn-c", "error");

      const drained = getDrainedConnections();
      assert.equal(drained.length, 3);
      const ids = drained.map((d) => d.connectionId).sort();
      assert.deepEqual(ids, ["conn-a", "conn-b", "conn-c"]);
    });

    it("returns empty array when none drained", () => {
      assert.deepEqual(getDrainedConnections(), []);
    });
  });

  describe("getDrainState", () => {
    it("returns drain state with metadata", () => {
      drainConnection("conn-1", "quota");
      const state = getDrainState("conn-1");

      assert.ok(state, "State should exist");
      assert.equal(state.connectionId, "conn-1");
      assert.equal(state.reason, "quota");
      assert.ok(state.drainedAt > 0, "drainedAt should be set");
      assert.equal(state.probeCount, 0);
    });

    it("returns undefined for non-drained connection", () => {
      assert.equal(getDrainState("unknown"), undefined);
    });
  });

  describe("checkQuotaDrain", () => {
    it("drains when usage exceeds threshold", () => {
      const drained = checkQuotaDrain("conn-1", 95);
      assert.equal(drained, true);
      assert.equal(isDrained("conn-1"), true);
    });

    it("drains at exact threshold", () => {
      const drained = checkQuotaDrain("conn-1", 90);
      assert.equal(drained, true);
    });

    it("does not drain below threshold", () => {
      const drained = checkQuotaDrain("conn-1", 85);
      assert.equal(drained, false);
      assert.equal(isDrained("conn-1"), false);
    });

    it("uses custom threshold", () => {
      const drained = checkQuotaDrain("conn-1", 75, 70);
      assert.equal(drained, true);
    });

    it("does not re-drain already drained connection", () => {
      drainConnection("conn-1", "manual");
      const drained = checkQuotaDrain("conn-1", 95);
      assert.equal(drained, false); // already drained
    });

    it("respects updated threshold", () => {
      updateThreshold(50);
      const drained = checkQuotaDrain("conn-1", 55);
      assert.equal(drained, true);
    });
  });

  describe("threshold", () => {
    it("defaults to 90", () => {
      assert.equal(getThreshold(), 90);
    });

    it("updates correctly", () => {
      updateThreshold(75);
      assert.equal(getThreshold(), 75);
    });

    it("rejects invalid values", () => {
      updateThreshold(0);
      assert.equal(getThreshold(), 90); // fallback to default

      updateThreshold(101);
      assert.equal(getThreshold(), 90);

      updateThreshold(-10);
      assert.equal(getThreshold(), 90);
    });
  });

  describe("persistence", () => {
    it("serializes drain state to JSON", () => {
      drainConnection("conn-1", "quota");
      drainConnection("conn-2", "manual");

      const json = serializeToPersist();
      const parsed = JSON.parse(json);
      assert.equal(parsed.length, 2);
    });

    it("loads drain state from JSON", () => {
      const json = JSON.stringify([
        {
          connectionId: "conn-x",
          drainedAt: 1000,
          reason: "quota",
          probeCount: 2,
          lastProbeAt: 500,
        },
        {
          connectionId: "conn-y",
          drainedAt: 2000,
          reason: "manual",
          probeCount: 0,
          lastProbeAt: 0,
        },
      ]);

      loadFromPersisted(json);
      assert.equal(isDrained("conn-x"), true);
      assert.equal(isDrained("conn-y"), true);
      assert.equal(getDrainState("conn-x")?.reason, "quota");
      assert.equal(getDrainState("conn-y")?.reason, "manual");
    });

    it("handles invalid JSON gracefully", () => {
      loadFromPersisted("not valid json");
      assert.equal(getDrainedConnections().length, 0);
    });

    it("handles empty array", () => {
      loadFromPersisted("[]");
      assert.equal(getDrainedConnections().length, 0);
    });

    it("round-trips correctly", () => {
      drainConnection("conn-rt", "quota");
      const json = serializeToPersist();
      _resetForTesting();
      loadFromPersisted(json);
      assert.equal(isDrained("conn-rt"), true);
    });
  });
});
