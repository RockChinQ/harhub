import assert from "node:assert/strict";
import test from "node:test";

import { parseSkillDocument } from "../src/web/src/views/assets/skill-frontmatter.js";

test("extracts structured Skill frontmatter from Markdown content", () => {
  const parsed = parseSkillDocument(`---
name: business-health-diagnostic
description: Diagnose SaaS business health.
intent: >-
  Find problems early and prioritize actions.
best_for:
  - Board reviews
  - Fundraising preparation
---

# Purpose

Review the business.
`);

  assert.deepEqual(parsed.metadata, {
    name: "business-health-diagnostic",
    description: "Diagnose SaaS business health.",
    intent: "Find problems early and prioritize actions.",
    best_for: ["Board reviews", "Fundraising preparation"]
  });
  assert.equal(parsed.body, "# Purpose\n\nReview the business.\n");
});

test("leaves ordinary Markdown untouched", () => {
  const content = "# Readme\n\nNo metadata here.\n";
  assert.deepEqual(parseSkillDocument(content), { body: content });
});

test("leaves malformed frontmatter visible instead of hiding it", () => {
  const content = "---\nname: [broken\n---\n\n# Purpose\n";
  assert.deepEqual(parseSkillDocument(content), { body: content });
});
