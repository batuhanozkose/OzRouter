import test from "node:test";
import assert from "node:assert/strict";

const { getActiveSidebarHref, matchesSidebarHref } =
  await import("../../src/shared/utils/sidebarRouteMatch.ts");

test("matchesSidebarHref respects exact routes and segment boundaries", () => {
  assert.equal(matchesSidebarHref("/dashboard", "/dashboard", true), true);
  assert.equal(matchesSidebarHref("/dashboard/cache", "/dashboard", true), false);
  assert.equal(matchesSidebarHref("/dashboard/studio", "/dashboard/studio"), true);
  assert.equal(matchesSidebarHref("/dashboard/cachex", "/dashboard/cache"), false);
});

test("getActiveSidebarHref prefers the most specific sidebar entry", () => {
  const items = [
    { href: "/dashboard/cache" },
    { href: "/dashboard/studio" },
    { href: "/dashboard/limits" },
  ];

  assert.equal(getActiveSidebarHref("/dashboard/studio", items), "/dashboard/studio");
  assert.equal(getActiveSidebarHref("/dashboard/cache", items), "/dashboard/cache");
  assert.equal(getActiveSidebarHref("/dashboard/cache/entries", items), "/dashboard/cache");
  assert.equal(getActiveSidebarHref("/dashboard/limits", items), "/dashboard/limits");
});
