import assert from "node:assert/strict";
import test from "node:test";

import {
  buildForgeFrameworkTree,
  prefixForgeSkillFilePreview,
  resolveForgeSkillFile
} from "../src/web/src/views/forge-framework-preview.js";
import type {
  AssetFileTreeNode,
  HarnessTemplateAssetSelection
} from "../src/shared/types.js";

const selectedSkill: HarnessTemplateAssetSelection = {
  id: "skill-1",
  kind: "skill",
  name: "discovery-process",
  displayName: "Discovery Process",
  slug: "discovery-process",
  description: "Run product discovery.",
  health: "valid",
  fileCount: 2,
  size: 128,
  reason: "Matches the discovery workflow.",
  installPath: ".harness/skills/discovery-process"
};

const skillTree: AssetFileTreeNode[] = [
  { name: "SKILL.md", path: "SKILL.md", type: "file", size: 64 },
  {
    name: "references",
    path: "references",
    type: "directory",
    children: [
      { name: "guide.md", path: "references/guide.md", type: "file", size: 64 }
    ]
  }
];

test("merges selected Skill package trees into the Forge framework preview", () => {
  const tree = buildForgeFrameworkTree(
    [
      { path: "AGENTS.md", content: "# Agents" },
      { path: ".harness/skills/README.md", content: "# Skills" }
    ],
    [{ assetId: selectedSkill.id, installPath: selectedSkill.installPath, tree: skillTree }]
  );

  assert.deepEqual(flattenFilePaths(tree), [
    ".harness/skills/discovery-process/references/guide.md",
    ".harness/skills/discovery-process/SKILL.md",
    ".harness/skills/README.md",
    "AGENTS.md"
  ]);
});

test("resolves stored Skill files without treating generated framework files as assets", () => {
  assert.deepEqual(
    resolveForgeSkillFile(
      [selectedSkill],
      ".harness/skills/discovery-process/references/guide.md"
    ),
    {
      assetId: "skill-1",
      installPath: ".harness/skills/discovery-process",
      relativePath: "references/guide.md"
    }
  );
  assert.equal(
    resolveForgeSkillFile([selectedSkill], ".harness/skills/README.md"),
    undefined
  );
});

test("prefixes lazy-loaded Skill file previews with their framework path", () => {
  const preview = prefixForgeSkillFilePreview({
    path: "SKILL.md",
    name: "SKILL.md",
    size: 12,
    isText: true,
    truncated: false,
    content: "# Discovery"
  }, selectedSkill.installPath);

  assert.equal(preview.path, ".harness/skills/discovery-process/SKILL.md");
  assert.equal(preview.content, "# Discovery");
});

function flattenFilePaths(nodes: AssetFileTreeNode[]): string[] {
  return nodes.flatMap((node) => node.type === "file"
    ? [node.path]
    : flattenFilePaths(node.children ?? []));
}
