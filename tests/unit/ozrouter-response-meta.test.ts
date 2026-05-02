import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOzRouterResponseMetaHeaders,
  buildOzRouterSseMetadataComment,
  formatOzRouterCost,
  getOzRouterTokenCounts,
} from "../../src/domain/ozrouterResponseMeta.ts";

test("getOzRouterTokenCounts normalizes common usage shapes", () => {
  assert.deepEqual(
    getOzRouterTokenCounts({
      prompt_tokens: 12,
      completion_tokens: 5,
    }),
    { input: 12, output: 5 }
  );
  assert.deepEqual(
    getOzRouterTokenCounts({
      input_tokens: "9",
      output_tokens: "4",
    }),
    { input: 9, output: 4 }
  );
});

test("buildOzRouterResponseMetaHeaders formats provider alias, tokens, latency, and cost", () => {
  const headers = buildOzRouterResponseMetaHeaders({
    provider: "claude",
    model: "claude-sonnet-4-6",
    cacheHit: true,
    latencyMs: 1234.6,
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
    },
    costUsd: 0.00123456789,
  });

  assert.equal(headers["X-OzRouter-Provider"], "cc");
  assert.equal(headers["X-OzRouter-Model"], "claude-sonnet-4-6");
  assert.equal(headers["X-OzRouter-Cache-Hit"], "true");
  assert.equal(headers["X-OzRouter-Latency-Ms"], "1235");
  assert.equal(headers["X-OzRouter-Tokens-In"], "11");
  assert.equal(headers["X-OzRouter-Tokens-Out"], "7");
  assert.equal(headers["X-OzRouter-Response-Cost"], "0.0012345679");
});

test("buildOzRouterSseMetadataComment emits comment lines compatible with SSE", () => {
  const comment = buildOzRouterSseMetadataComment({
    provider: "openai",
    model: "gpt-4o-mini",
    usage: {
      prompt_tokens: 4,
      completion_tokens: 2,
    },
    latencyMs: 50,
    costUsd: formatOzRouterCost(0),
  });

  assert.match(comment, /^: x-ozrouter-cache-hit=false/m);
  assert.match(comment, /^: x-ozrouter-provider=openai/m);
  assert.match(comment, /^: x-ozrouter-model=gpt-4o-mini/m);
  assert.match(comment, /^: x-ozrouter-tokens-in=4/m);
  assert.match(comment, /^: x-ozrouter-tokens-out=2/m);
  assert.match(comment, /^: x-ozrouter-response-cost=0\.0000000000/m);
});
