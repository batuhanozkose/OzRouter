import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_OZROUTER_BASE_URL,
  resolveOzRouterBaseUrl,
} from "../../src/shared/utils/resolveOzRouterBaseUrl.ts";

test("resolveOzRouterBaseUrl prefers OZROUTER_BASE_URL", () => {
  assert.equal(
    resolveOzRouterBaseUrl({
      OZROUTER_BASE_URL: "https://internal.example.com/",
      BASE_URL: "https://base.example.com",
      NEXT_PUBLIC_BASE_URL: "https://public.example.com",
    }),
    "https://internal.example.com"
  );
});

test("resolveOzRouterBaseUrl falls back to BASE_URL", () => {
  assert.equal(
    resolveOzRouterBaseUrl({
      BASE_URL: "https://base.example.com/",
      NEXT_PUBLIC_BASE_URL: "https://public.example.com",
    }),
    "https://base.example.com"
  );
});

test("resolveOzRouterBaseUrl falls back to NEXT_PUBLIC_BASE_URL", () => {
  assert.equal(
    resolveOzRouterBaseUrl({
      NEXT_PUBLIC_BASE_URL: "https://public.example.com/",
    }),
    "https://public.example.com"
  );
});

test("resolveOzRouterBaseUrl ignores blank values", () => {
  assert.equal(
    resolveOzRouterBaseUrl({
      OZROUTER_BASE_URL: "   ",
      BASE_URL: "",
      NEXT_PUBLIC_BASE_URL: " https://public.example.com/ ",
    }),
    "https://public.example.com"
  );
});

test("resolveOzRouterBaseUrl uses the default localhost fallback", () => {
  assert.equal(resolveOzRouterBaseUrl({}), DEFAULT_OZROUTER_BASE_URL);
});
