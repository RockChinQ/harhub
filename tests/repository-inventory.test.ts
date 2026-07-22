import assert from "node:assert/strict";
import test from "node:test";

import {
  detectRepositoryInventory,
  isRepositoryInventoryCandidate
} from "../src/features/repository-inventory/index.js";
import { skillFilesChecksum } from "../src/features/skills/index.js";

test("detects existing repository harness assets without requiring Harhub layout", () => {
  const skillFiles = [
    {
      path: "SKILL.md",
      content: Buffer.from("---\nname: review-prep\ndescription: Prepare a review.\n---\n\n# Review Prep\n")
    },
    { path: "references/checklist.md", content: Buffer.from("# Checklist\n") }
  ];
  const files = [
    ...skillFiles.map((file) => ({ path: `.agents/skills/review-prep/${file.path}`, content: file.content })),
    { path: "AGENTS.md", content: Buffer.from("# Agent instructions\n\nVerify before finishing.\n") },
    { path: "packages/api/AGENTS.md", content: Buffer.from("# API instructions\n") },
    { path: ".github/copilot-instructions.md", content: Buffer.from("# Copilot instructions\n") },
    { path: ".cursor/rules/typescript.mdc", content: Buffer.from("# TypeScript rules\n") },
    { path: ".windsurf/rules/testing.md", content: Buffer.from("# Test rules\n") },
    { path: ".mcp.json", content: Buffer.from('{"mcpServers":{}}') },
    { path: "src/index.ts", content: Buffer.from("export {};\n") }
  ];

  const artifacts = detectRepositoryInventory(files);
  assert.deepEqual(artifacts.map((artifact) => [artifact.kind, artifact.format, artifact.path]), [
    ["instruction", "copilot-instructions", ".github/copilot-instructions.md"],
    ["instruction", "agents-instructions", "AGENTS.md"],
    ["instruction", "agents-instructions", "packages/api/AGENTS.md"],
    ["mcp", "mcp-json", ".mcp.json"],
    ["rule", "cursor-rule", ".cursor/rules/typescript.mdc"],
    ["rule", "windsurf-rule", ".windsurf/rules/testing.md"],
    ["skill", "agent-skill", ".agents/skills/review-prep"]
  ]);
  const skill = artifacts.find((artifact) => artifact.kind === "skill");
  assert.equal(skill?.digest, skillFilesChecksum(skillFiles));
  assert.equal(skill?.validation.errors, 0);
  assert.equal(skill?.relationship, "review-required");
});

test("keeps nested Skills separate and reports invalid MCP configuration", () => {
  const artifacts = detectRepositoryInventory([
    {
      path: ".harness/skills/parent/SKILL.md",
      content: Buffer.from("---\nname: parent\ndescription: Parent Skill.\n---\n")
    },
    { path: ".harness/skills/parent/notes.md", content: Buffer.from("Parent notes\n") },
    {
      path: ".harness/skills/parent/nested/SKILL.md",
      content: Buffer.from("---\nname: nested\ndescription: Nested Skill.\n---\n")
    },
    { path: ".cursor/mcp.json", content: Buffer.from("not-json") }
  ]);
  assert.equal(artifacts.filter((artifact) => artifact.kind === "skill").length, 2);
  const parent = artifacts.find((artifact) => artifact.path === ".harness/skills/parent");
  assert.equal(parent?.fileCount, 2);
  const mcp = artifacts.find((artifact) => artifact.kind === "mcp");
  assert.equal(mcp?.health, "error");
  assert.equal(mcp?.relationship, "blocked");
});

test("identifies candidates before downloading repository blobs", () => {
  assert.equal(isRepositoryInventoryCandidate(".agents/skills/demo/SKILL.md"), true);
  assert.equal(isRepositoryInventoryCandidate("services/api/AGENTS.md"), true);
  assert.equal(isRepositoryInventoryCandidate(".vscode/mcp.json"), true);
  assert.equal(isRepositoryInventoryCandidate("src/index.ts"), false);
  assert.equal(isRepositoryInventoryCandidate("../AGENTS.md"), false);
});
