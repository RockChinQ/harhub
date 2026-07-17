import assert from "node:assert/strict";
import test from "node:test";

import { forgeArchiveFileName } from "../src/web/src/lib/api/forge.js";

test("uses the UTF-8 semantic session name for Forge archive downloads", () => {
  assert.equal(
    forgeArchiveFileName(
      "attachment; filename=\"project-harness.zip\"; filename*=UTF-8''%E5%8F%91%E7%A5%A8%E5%AE%A1%E6%A0%B8%E7%B3%BB%E7%BB%9F-harness.zip"
    ),
    "发票审核系统-harness.zip"
  );
  assert.equal(
    forgeArchiveFileName("attachment; filename=\"release-assistant-harness.zip\""),
    "release-assistant-harness.zip"
  );
});
