import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const ROOT = join(import.meta.dirname, "../..");

test("quota cache background refresh catches async tick failures", () => {
  const content = readFileSync(join(ROOT, "src/domain/quotaCache.ts"), "utf8");

  assert.ok(
    content.includes("void backgroundRefreshTick().catch"),
    "quota cache interval should not leave rejected refresh promises unhandled"
  );
  assert.ok(
    content.includes("[QuotaCache] Background refresh tick failed:"),
    "quota cache interval should log failed refresh ticks"
  );
});

test("connection drain probe timer has an outer failure guard", () => {
  const content = readFileSync(join(ROOT, "open-sse/services/connectionDrain.ts"), "utf8");

  assert.ok(
    content.includes("[ConnectionDrain] Probe timer failed:"),
    "connection drain probe interval should catch unexpected outer failures"
  );
});
