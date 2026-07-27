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

test("discovers Skills at the repository root and arbitrary nested paths", () => {
  const artifacts = detectRepositoryInventory([
    {
      path: "SKILL.md",
      content: Buffer.from("---\nname: repository-skill\ndescription: Root repository Skill.\n---\n")
    },
    { path: "references/root.md", content: Buffer.from("Root reference\n") },
    { path: "dist/generated.txt", content: Buffer.from("Generated output\n") },
    {
      path: "skills/release-notes/SKILL.md",
      content: Buffer.from("---\nname: release-notes\ndescription: Write release notes.\n---\n")
    },
    {
      path: "packages/api/.cursor/skills/api-review/SKILL.md",
      content: Buffer.from("---\nname: api-review\ndescription: Review APIs.\n---\n")
    },
    {
      path: ".github/skills/issue-triage/SKILL.md",
      content: Buffer.from("---\nname: issue-triage\ndescription: Triage issues.\n---\n")
    },
    {
      path: ".codex/skills/deploy/SKILL.md",
      content: Buffer.from("---\nname: deploy\ndescription: Deploy services.\n---\n")
    }
  ]);

  const skills = artifacts.filter((artifact) => artifact.kind === "skill");
  assert.deepEqual(skills.map((skill) => skill.path), [
    ".",
    ".codex/skills/deploy",
    ".github/skills/issue-triage",
    "packages/api/.cursor/skills/api-review",
    "skills/release-notes"
  ]);
  assert.equal(skills.find((skill) => skill.path === ".")?.fileCount, 2);
  assert.ok(skills.every((skill) => skill.validation.errors === 0));
});

test("ignores every harness artifact beneath excluded directories", () => {
  const artifacts = detectRepositoryInventory([
    {
      path: "node_modules/dependency/AGENTS.md",
      content: Buffer.from("Dependency instructions\n")
    },
    {
      path: "dist/CLAUDE.md",
      content: Buffer.from("Generated instructions\n")
    },
    {
      path: "build/mcp.json",
      content: Buffer.from('{"mcpServers":{}}')
    },
    {
      path: "target/rules/generated.mdc",
      content: Buffer.from("Generated rule\n")
    }
  ]);

  assert.deepEqual(artifacts, []);
});

test("identifies candidates before downloading repository blobs", () => {
  assert.equal(isRepositoryInventoryCandidate(".agents/skills/demo/SKILL.md"), true);
  assert.equal(isRepositoryInventoryCandidate("SKILL.md"), true);
  assert.equal(isRepositoryInventoryCandidate("skills/demo/SKILL.md"), true);
  assert.equal(isRepositoryInventoryCandidate("packages/api/.cursor/skills/demo/SKILL.md"), true);
  assert.equal(isRepositoryInventoryCandidate(".github/skills/demo/SKILL.md"), true);
  assert.equal(isRepositoryInventoryCandidate("services/api/AGENTS.md"), true);
  assert.equal(isRepositoryInventoryCandidate(".vscode/mcp.json"), true);
  assert.equal(isRepositoryInventoryCandidate("node_modules/dependency/SKILL.md"), false);
  assert.equal(isRepositoryInventoryCandidate(".venv/lib/site-packages/dependency/SKILL.md"), false);
  assert.equal(isRepositoryInventoryCandidate("dist/generated/SKILL.md"), false);
  assert.equal(isRepositoryInventoryCandidate("skills/demo/skill.md"), false);
  assert.equal(isRepositoryInventoryCandidate("src/index.ts"), false);
  assert.equal(isRepositoryInventoryCandidate("../AGENTS.md"), false);
});
