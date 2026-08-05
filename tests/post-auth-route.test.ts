import assert from "node:assert/strict";
import test from "node:test";

import { routeAfterAuthentication } from "../src/web/src/app/post-auth-route.js";

test("authentication preserves an explicit repository onboarding route", () => {
  assert.deepEqual(routeAfterAuthentication({ view: "projects" }), { view: "projects" });
  assert.deepEqual(
    routeAfterAuthentication({ view: "project-detail", projectId: "project-1" }),
    { view: "project-detail", projectId: "project-1" }
  );
});

test("authentication sends a generic landing sign-in to Projects", () => {
  assert.deepEqual(routeAfterAuthentication({ view: "landing" }), { view: "projects" });
});

test("authentication preserves other explicit application routes", () => {
  assert.deepEqual(routeAfterAuthentication({ view: "assets" }), { view: "assets" });
  assert.deepEqual(routeAfterAuthentication({ view: "workspace" }), { view: "workspace" });
});
