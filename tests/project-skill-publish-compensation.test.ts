import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveProjectPublishRecovery,
  type ProjectPublishState,
  type ProjectPublishErrorKind
} from "../src/server/services/project-skill-publish-compensation.js";

test("treats confirmed Project publication as committed after an ambiguous error", () => {
  assert.deepEqual(
    resolveProjectPublishRecovery("commit-unknown", "published"),
    "keep-published"
  );
});

test("restores the old catalog only when publication definitely did not commit", () => {
  assert.deepEqual(
    resolveProjectPublishRecovery("known-failure", "not-published"),
    "restore-old"
  );
  assert.deepEqual(
    resolveProjectPublishRecovery("commit-unknown", "not-published"),
    "restore-old"
  );
});

test("preserves both catalog generations when publication outcome cannot be confirmed", () => {
  const cases: Array<[ProjectPublishErrorKind, ProjectPublishState]> = [
    ["commit-unknown", "unknown"],
    ["known-failure", "unknown"]
  ];
  for (const [errorKind, state] of cases) {
    assert.equal(resolveProjectPublishRecovery(errorKind, state), "preserve-both");
  }
});
