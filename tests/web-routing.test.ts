import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRoute, pathForRoute, routeFromPath } from "../src/web/src/app/routing.js";

test("binds Forge sessions to addressable routes", () => {
  assert.deepEqual(routeFromPath("/forge"), { view: "forge" });
  assert.deepEqual(routeFromPath("/forge/session%3Aabc%2F123"), {
    view: "forge",
    forgeSessionId: "session:abc/123"
  });
  assert.equal(
    pathForRoute({ view: "forge", forgeSessionId: "session:abc/123" }),
    "/forge/session%3Aabc%2F123"
  );
  assert.deepEqual(
    normalizeRoute({ view: "forge", forgeSessionId: "" }),
    { view: "forge" }
  );
});
