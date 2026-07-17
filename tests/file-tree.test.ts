import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AssetFileTreeNode } from "../src/shared/types.js";
import { FileTree } from "../src/web/src/views/assets/file-tree.js";

test("keeps regular folders open while selected Skill roots start collapsed", () => {
  const nodes: AssetFileTreeNode[] = [
    {
      name: "rules",
      path: ".harness/rules",
      type: "directory",
      children: [{
        name: "engineering.md",
        path: ".harness/rules/engineering.md",
        type: "file"
      }]
    },
    {
      name: "product-discovery",
      path: ".harness/skills/product-discovery",
      type: "directory",
      children: [{
        name: "SKILL.md",
        path: ".harness/skills/product-discovery/SKILL.md",
        type: "file"
      }]
    }
  ];

  const html = renderToStaticMarkup(createElement(FileTree, {
    nodes,
    onSelect: () => undefined,
    markers: { ".harness/skills/product-discovery": "Skill" },
    defaultCollapsedPaths: [".harness/skills/product-discovery"]
  }));

  assert.match(html, /engineering\.md/);
  assert.doesNotMatch(html, /SKILL\.md/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /product-discovery is a Skill/);
});
