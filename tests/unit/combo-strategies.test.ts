import test from "node:test";
import assert from "node:assert/strict";

import { handleComboChat } from "../../open-sse/services/combo.ts";
import * as combosDb from "../../src/lib/db/combos.ts";

/**
 * Combo strategies test — validates strategy dispatch and routing behavior.
 */

function makeCombo(id: string, strategy: string, models: string[]) {
  return {
    id,
    name: id,
    strategy,
    models,
    config: { maxRetries: 1, retryDelayMs: 100 },
    isActive: true,
  };
}

function makeBody(model: string) {
  return {
    model,
    messages: [{ role: "user", content: "test prompt" }],
    stream: false,
  };
}

test("priority strategy routes to first model", async () => {
  const id = `test-priority-${crypto.randomUUID().slice(0, 8)}`;
  await combosDb.createCombo(makeCombo(id, "priority", ["openai/gpt-4", "openai/gpt-3.5-turbo"]));
  const combo = await combosDb.getComboById(id);
  combo.config = { maxRetries: 0, retryDelayMs: 0 };

  let calledModel: string | null = null;
  const handleSingleModel = async (_body: any, modelStr: string) => {
    calledModel = modelStr;
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await handleComboChat({
    body: makeBody(id),
    combo,
    handleSingleModel,
    log: { info: () => {}, warn: () => {}, debug: () => {} },
  });

  assert.equal(result.status, 200);
  assert.ok(calledModel?.startsWith("openai/gpt-4"), `Expected gpt-4 first, got ${calledModel}`);
});

test("least-used strategy sorts by usage", async () => {
  const id = `test-least-${crypto.randomUUID().slice(0, 8)}`;
  await combosDb.createCombo(makeCombo(id, "least-used", ["openai/gpt-3.5-turbo", "openai/gpt-4"]));
  const combo = await combosDb.getComboById(id);

  const calledModels: string[] = [];
  const handleSingleModel = async (_body: any, modelStr: string) => {
    calledModels.push(modelStr);
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await handleComboChat({
    body: makeBody(id),
    combo,
    handleSingleModel,
    log: { info: () => {}, warn: () => {}, debug: () => {} },
  });

  assert.equal(calledModels.length, 1);
  assert.ok(
    calledModels[0]?.includes("gpt-3.5-turbo") || calledModels[0]?.includes("gpt-4"),
    `Expected a valid model, got ${calledModels[0]}`
  );
});

test("round-robin strategy cycles through models", async () => {
  const id = `test-rr-${crypto.randomUUID().slice(0, 8)}`;
  await combosDb.createCombo(
    makeCombo(id, "round-robin", ["openai/gpt-4", "openai/gpt-3.5-turbo"])
  );
  const combo = await combosDb.getComboById(id);

  const calledModels: string[] = [];
  const handleSingleModel = async (_body: any, modelStr: string) => {
    calledModels.push(modelStr);
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  // Two calls should rotate through both models
  await handleComboChat({
    body: makeBody(id),
    combo,
    handleSingleModel,
    log: { info: () => {}, warn: () => {}, debug: () => {} },
  });
  await handleComboChat({
    body: makeBody(id),
    combo,
    handleSingleModel,
    log: { info: () => {}, warn: () => {}, debug: () => {} },
  });

  assert.equal(calledModels.length, 2);
  assert.notEqual(calledModels[0], calledModels[1], "Round-robin should cycle models");
});

test("fallback triggers when primary model fails", async () => {
  const id = `test-fallback-${crypto.randomUUID().slice(0, 8)}`;
  await combosDb.createCombo(makeCombo(id, "priority", ["openai/gpt-4", "openai/gpt-3.5-turbo"]));
  const combo = await combosDb.getComboById(id);
  combo.config = { maxRetries: 0, retryDelayMs: 0 };

  const calledModels: string[] = [];
  const handleSingleModel = async (_body: any, modelStr: string) => {
    calledModels.push(modelStr);
    if (modelStr && modelStr.includes("gpt-4")) {
      return new Response(JSON.stringify({ error: { message: "overloaded" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await handleComboChat({
    body: makeBody(id),
    combo,
    handleSingleModel,
    log: { info: () => {}, warn: () => {}, debug: () => {} },
  });

  // gpt-4 always returns 503 → fallback to gpt-3.5-turbo which succeeds
  assert.equal(result.status, 200, `Expected 200, got ${result.status}`);
  assert.equal(
    calledModels.length,
    2,
    `Expected 2 calls (primary fail + fallback success), got ${calledModels.length}: ${calledModels.join(", ")}`
  );
  assert.ok(calledModels[0]?.includes("gpt-4"), `First: ${calledModels[0]}`);
  assert.ok(calledModels[1]?.includes("gpt-3.5-turbo"), `Second: ${calledModels[1]}`);
});
