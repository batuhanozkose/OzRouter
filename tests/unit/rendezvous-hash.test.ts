import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fnv1a,
  rendezvousHashSelect,
  extractRoutingKey,
} from "../../open-sse/services/rendezvousHash.ts";

describe("fnv1a", () => {
  it("returns consistent hash for same input", () => {
    const h1 = fnv1a("hello");
    const h2 = fnv1a("hello");
    assert.equal(h1, h2);
  });

  it("returns different hash for different input", () => {
    const h1 = fnv1a("hello");
    const h2 = fnv1a("world");
    assert.notEqual(h1, h2);
  });

  it("returns unsigned 32-bit integer", () => {
    const hash = fnv1a("test-string");
    assert.ok(hash >= 0, "hash should be non-negative");
    assert.ok(hash <= 0xffffffff, "hash should be <= 2^32 - 1");
  });
});

describe("rendezvousHashSelect", () => {
  const targets = [
    { id: "provider-a:conn-1" },
    { id: "provider-b:conn-2" },
    { id: "provider-c:conn-3" },
    { id: "provider-d:conn-4" },
  ];

  it("returns -1 for empty targets", () => {
    assert.equal(rendezvousHashSelect([], "any-key"), -1);
  });

  it("returns 0 for single target", () => {
    assert.equal(rendezvousHashSelect([{ id: "only-one" }], "any-key"), 0);
  });

  it("returns deterministic result for same key", () => {
    const key = "conversation-abc-123";
    const idx1 = rendezvousHashSelect(targets, key);
    const idx2 = rendezvousHashSelect(targets, key);
    const idx3 = rendezvousHashSelect(targets, key);
    assert.equal(idx1, idx2);
    assert.equal(idx2, idx3);
  });

  it("returns valid index within range", () => {
    for (let i = 0; i < 100; i++) {
      const idx = rendezvousHashSelect(targets, `key-${i}`);
      assert.ok(idx >= 0, `index should be >= 0, got ${idx}`);
      assert.ok(idx < targets.length, `index should be < ${targets.length}, got ${idx}`);
    }
  });

  it("distributes keys across targets (rough uniformity)", () => {
    const counts = new Map<number, number>();
    const NUM_KEYS = 10000;

    for (let i = 0; i < NUM_KEYS; i++) {
      const idx = rendezvousHashSelect(targets, `test-key-${i}`);
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }

    // Each target should get roughly 25% of keys (±10%)
    const expected = NUM_KEYS / targets.length;
    const tolerance = expected * 0.15; // 15% tolerance

    for (let i = 0; i < targets.length; i++) {
      const count = counts.get(i) || 0;
      assert.ok(
        count >= expected - tolerance && count <= expected + tolerance,
        `Target ${i} got ${count} keys, expected ~${expected} (±${Math.round(tolerance)})`
      );
    }
  });

  it("minimal disruption when adding a target (≈1/N remap)", () => {
    const originalTargets = targets.slice(0, 3);
    const expandedTargets = [...targets]; // add 4th target
    const NUM_KEYS = 1000;

    let remapped = 0;
    for (let i = 0; i < NUM_KEYS; i++) {
      const key = `stability-test-${i}`;
      const origIdx = rendezvousHashSelect(originalTargets, key);
      const newIdx = rendezvousHashSelect(expandedTargets, key);
      // If the same target ID is at a different index, it's still the same target
      if (originalTargets[origIdx].id !== expandedTargets[newIdx].id) {
        remapped++;
      }
    }

    // With 3→4 targets, roughly 1/4 (25%) should remap. Allow up to 35%.
    const remapRate = remapped / NUM_KEYS;
    assert.ok(
      remapRate <= 0.35,
      `Remap rate ${(remapRate * 100).toFixed(1)}% exceeds 35% — not minimal disruption`
    );
  });

  it("minimal disruption when removing a target (≈1/N remap)", () => {
    const originalTargets = [...targets]; // 4 targets
    const reducedTargets = targets.slice(0, 3); // remove last
    const NUM_KEYS = 1000;

    let remapped = 0;
    for (let i = 0; i < NUM_KEYS; i++) {
      const key = `remove-test-${i}`;
      const origIdx = rendezvousHashSelect(originalTargets, key);
      const newIdx = rendezvousHashSelect(reducedTargets, key);
      // Keys that were on the removed target MUST remap.
      // Keys on remaining targets should stay.
      if (
        originalTargets[origIdx].id !== "provider-d:conn-4" && // wasn't on removed
        originalTargets[origIdx].id !== reducedTargets[newIdx].id // but still remapped
      ) {
        remapped++;
      }
    }

    // Non-removed keys should have very low remap rate (<5%)
    const nonRemovedTotal = Array.from({ length: NUM_KEYS }, (_, i) => {
      const idx = rendezvousHashSelect(originalTargets, `remove-test-${i}`);
      return originalTargets[idx].id !== "provider-d:conn-4" ? 1 : 0;
    }).reduce((a, b) => a + b, 0);

    const remapRate = nonRemovedTotal > 0 ? remapped / nonRemovedTotal : 0;
    assert.ok(
      remapRate <= 0.05,
      `Non-removed key remap rate ${(remapRate * 100).toFixed(1)}% exceeds 5%`
    );
  });
});

describe("extractRoutingKey", () => {
  it("uses previous_response_id when available", () => {
    const key = extractRoutingKey({ previous_response_id: "resp_abc123" });
    assert.equal(key, "prev:resp_abc123");
  });

  it("uses session when no previous_response_id", () => {
    const key = extractRoutingKey({ session: "sess_xyz" });
    assert.equal(key, "sess:sess_xyz");
  });

  it("uses session_id as fallback", () => {
    const key = extractRoutingKey({ session_id: "sid_456" });
    assert.equal(key, "sess:sid_456");
  });

  it("uses first user message content", () => {
    const key = extractRoutingKey({
      messages: [
        { role: "system", content: "You are a helper." },
        { role: "user", content: "Hello, how are you?" },
      ],
    });
    assert.equal(key, "msg:Hello, how are you?");
  });

  it("truncates long user message to 128 chars", () => {
    const longMsg = "A".repeat(256);
    const key = extractRoutingKey({
      messages: [{ role: "user", content: longMsg }],
    });
    assert.equal(key, `msg:${"A".repeat(128)}`);
  });

  it("uses input field (Responses API)", () => {
    const key = extractRoutingKey({ input: "Write a function" });
    assert.equal(key, "input:Write a function");
  });

  it("returns random fallback when no key available", () => {
    const key = extractRoutingKey({});
    assert.ok(key.startsWith("rand:"), `Expected rand: prefix, got ${key}`);
  });

  it("prioritizes previous_response_id over session", () => {
    const key = extractRoutingKey({
      previous_response_id: "resp_1",
      session: "sess_2",
    });
    assert.equal(key, "prev:resp_1");
  });

  it("prioritizes session over messages", () => {
    const key = extractRoutingKey({
      session: "sess_2",
      messages: [{ role: "user", content: "hello" }],
    });
    assert.equal(key, "sess:sess_2");
  });

  it("ignores empty strings", () => {
    const key = extractRoutingKey({
      previous_response_id: "",
      session: "",
      messages: [{ role: "user", content: "" }],
    });
    assert.ok(key.startsWith("rand:"));
  });
});
