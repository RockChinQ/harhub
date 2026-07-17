import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import {
  buildHarnessTemplate,
  createHarnessTemplateArchive,
  createLocalHarnessFollowUp,
  workspaceAssetSummaries
} from "../src/server/services/forge.js";
import type {
  AssetCatalog,
  AssetRecord,
  HarnessWorkspaceAssetSummary
} from "../src/shared/types.js";

test("asks a bounded sequence of project follow-up questions", () => {
  const input = { requirement: "Build a release assistant", answers: [] };
  const first = createLocalHarnessFollowUp(input);

  assert.equal(first.ready, false);
  assert.ok(first.question);
  assert.equal(first.component?.type, "single-select");
  assert.equal(first.component?.options.length, 4);

  const second = createLocalHarnessFollowUp({
    ...input,
    answers: [{ question: first.question ?? "one", answer: "Internal engineering team" }]
  });
  assert.equal(second.component?.type, "multi-select");
  assert.equal(second.component?.maxSelections, 2);

  const third = createLocalHarnessFollowUp({
    ...input,
    answers: [
      { question: "one", answer: "Internal engineering team" },
      { question: "two", answer: "Create and review work" }
    ]
  });
  assert.equal(third.component?.type, "text");
  assert.equal(third.component?.options.length, 0);

  const complete = createLocalHarnessFollowUp({
    ...input,
    answers: [
      { question: "one", answer: "one" },
      { question: "two", answer: "two" },
      { question: "three", answer: "three" }
    ]
  });
  assert.equal(complete.ready, true);
  assert.equal(complete.question, undefined);
});

test("builds a framework that records selected workspace Skills", () => {
  const skill = workspaceSkill();
  const template = buildHarnessTemplate({
    name: "Release Assistant",
    summary: "Prepare release notes and readiness evidence.",
    targetUsers: ["Release managers"],
    goals: ["Create consistent release handoffs"],
    constraints: ["Use existing workspace assets"],
    successCriteria: ["Reviewers receive a complete handoff"],
    stackNotes: ["Confirm the target repository stack"],
    agentRules: ["Run readiness checks before release"],
    selectedAssets: [{ assetId: skill.id, reason: "Matches release note work." }],
    workflow: {
      name: "Release workflow",
      objective: "Prepare and verify a release",
      steps: ["Collect changes", "Verify readiness"],
      verification: ["Release notes reviewed"]
    }
  }, "llm", [skill]);

  assert.equal(template.selectedAssets.length, 1);
  assert.equal(template.selectedAssets[0].id, skill.id);
  assert.equal(template.selectedAssets[0].installPath, ".harness/skills/release-notes");
  assert.ok(template.files.some((file) => file.path === "AGENTS.md"));
  const catalog = template.files.find((file) => file.path === ".harness/catalog/skills.json");
  assert.match(catalog?.content ?? "", /asset:skill:release-notes/);
});

test("creates a safe ZIP for generated framework files", async () => {
  const archive = await createHarnessTemplateArchive(emptyCatalog(), {
    slug: "release-assistant",
    files: [
      { path: "AGENTS.md", content: "# Agent guide\n" },
      { path: ".harness/README.md", content: "# Harness\n" }
    ],
    selectedAssetIds: []
  });
  const zip = await JSZip.loadAsync(archive.buffer);

  assert.equal(archive.fileName, "release-assistant-harness.zip");
  assert.equal(await zip.file("AGENTS.md")?.async("string"), "# Agent guide\n");
  assert.equal(await zip.file(".harness/README.md")?.async("string"), "# Harness\n");

  await assert.rejects(
    createHarnessTemplateArchive(emptyCatalog(), {
      slug: "unsafe",
      files: [{ path: "../AGENTS.md", content: "unsafe" }],
      selectedAssetIds: []
    }),
    /Invalid generated file path/
  );
});

test("offers only stored non-error Skills to the builder", () => {
  const valid = catalogAsset("valid-skill", "valid");
  const invalid = catalogAsset("invalid-skill", "error");
  const unstored = { ...catalogAsset("unstored-skill", "valid"), storage: undefined };

  assert.deepEqual(
    workspaceAssetSummaries([valid, invalid, unstored]).map((asset) => asset.id),
    [valid.id]
  );
});

function workspaceSkill(): HarnessWorkspaceAssetSummary {
  return {
    id: "asset:skill:release-notes",
    kind: "skill",
    name: "release-notes",
    displayName: "Release Notes",
    slug: "release-notes",
    description: "Create consistent release notes from repository changes.",
    health: "valid",
    fileCount: 2,
    size: 256
  };
}

function emptyCatalog(): AssetCatalog {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    assets: [],
    skills: []
  };
}

function catalogAsset(name: string, health: AssetRecord["health"]): AssetRecord {
  return {
    id: `asset:skill:${name}`,
    kind: "skill",
    name,
    displayName: name,
    slug: name,
    description: `${name} description`,
    health,
    validation: { errors: health === "error" ? 1 : 0, warnings: 0 },
    storage: {
      provider: "s3",
      layout: "files",
      bucket: "test-bucket",
      key: `skills/${name}/`,
      size: 128,
      fileCount: 1,
      contentType: "application/vnd.harhub.skill-directory",
      checksum: "a".repeat(64),
      uploadedAt: new Date().toISOString()
    }
  };
}
