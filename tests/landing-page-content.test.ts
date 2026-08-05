import assert from "node:assert/strict";
import test from "node:test";

import { landingPageContent } from "../src/web/src/views/landing-page-content.js";

test("landing page leads with the repository governance wedge", () => {
  const content = landingPageContent(false);
  assert.equal(content.primaryHref, "/projects");
  assert.equal(content.primaryAction, "Start your repository inventory");
  assert.match(content.headline, /agent setup.*repositories/i);
  assert.match(content.description, /pull requests/i);
  assert.deepEqual(content.proofPoints, [
    "GitHub App inventory",
    "Skills and MCP versions",
    "Reviewable pull requests",
    "Drift and reverse sync"
  ]);
});

test("landing page offers the existing application to signed-in users", () => {
  const content = landingPageContent(true);
  assert.equal(content.primaryHref, "/projects");
  assert.equal(content.primaryAction, "Open Projects");
});
