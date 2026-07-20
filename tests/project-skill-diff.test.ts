import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectSkillLineDiff } from "../src/web/src/views/project-skill-diff.js";

test("aligns modified Project Skill lines with their Library counterparts", () => {
  const rows = buildProjectSkillLineDiff(
    "---\nname: example\ndescription: Library wording\n---",
    "---\nname: example\ndescription: Project wording\n---"
  );

  assert.deepEqual(rows.map((row) => row.kind), [
    "unchanged",
    "unchanged",
    "modified",
    "unchanged"
  ]);
  assert.deepEqual(rows[2], {
    kind: "modified",
    before: { line: 3, text: "description: Library wording" },
    after: { line: 3, text: "description: Project wording" }
  });
});

test("keeps added and removed Project Skill lines aligned with line numbers", () => {
  const rows = buildProjectSkillLineDiff(
    "first\nremoved\nshared",
    "first\nshared\nadded"
  );

  assert.deepEqual(rows, [
    {
      kind: "unchanged",
      before: { line: 1, text: "first" },
      after: { line: 1, text: "first" }
    },
    {
      kind: "removed",
      before: { line: 2, text: "removed" }
    },
    {
      kind: "unchanged",
      before: { line: 3, text: "shared" },
      after: { line: 2, text: "shared" }
    },
    {
      kind: "added",
      after: { line: 3, text: "added" }
    }
  ]);
});
