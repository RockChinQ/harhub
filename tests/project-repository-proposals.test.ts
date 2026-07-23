import assert from "node:assert/strict";
import test from "node:test";

import type { AssetRecord, ProjectBinding, ProjectInventoryArtifact } from "../src/shared/types.js";
import {
  createAddLibrarySkillsProposal,
  createBootstrapProposal,
  createRemoveSkillProposal
} from "../src/server/services/project-repository-proposals.js";

test("bootstrap proposals require explicit write permissions and only contain reviewed Harhub files", () => {
  const base = proposalBase();
  const proposal = createBootstrapProposal(base);
  assert.equal(proposal.files.length, 1);
  assert.equal(proposal.files[0]?.path, ".harhub/project.json");
  assert.equal(proposal.files.some((file) => file.path.startsWith(".github/")), false);
  assert.match(proposal.files[0]?.content ?? "", /"mode": "github-app"/);

  assert.throws(
    () => createBootstrapProposal({
      ...base,
      connection: { ...base.connection, permissionMode: "read" }
    }),
    /Contents: write/
  );
});

test("Library Skill proposals copy complete text and binary packages into the existing Skill root", () => {
  const base = proposalBase();
  base.snapshot.artifacts = [inventorySkill(".agents/skills/research", "binding-research")];
  const proposal = createAddLibrarySkillsProposal({
    ...base,
    skills: [{
      asset: librarySkill("release-notes", "Release Notes"),
      files: [
        { path: "SKILL.md", content: Buffer.from("---\nname: release-notes\ndescription: Write releases.\n---\n") },
        { path: "assets/icon.png", content: Buffer.from([0, 1, 2, 255]) }
      ]
    }]
  });

  assert.equal(proposal.kind, "add-library-skills");
  assert.equal(proposal.baseSha, "a".repeat(40));
  assert.deepEqual(proposal.files.map((file) => file.path), [
    ".agents/skills/release-notes/assets/icon.png",
    ".agents/skills/release-notes/SKILL.md"
  ]);
  assert.equal(proposal.files[0]?.encoding, "base64");
  assert.equal(proposal.files[0]?.content, Buffer.from([0, 1, 2, 255]).toString("base64"));
  assert.equal(proposal.files[1]?.encoding, "utf-8");

  assert.throws(() => createAddLibrarySkillsProposal({
    ...base,
    skills: [{
      asset: librarySkill("research", "Research"),
      files: [{ path: "SKILL.md", content: Buffer.from("research") }]
    }]
  }), /already contains a Skill/);
});

test("Skill removal proposals delete only files captured under the latest inventory root", () => {
  const base = proposalBase();
  const binding: ProjectBinding = {
    id: "binding-research",
    kind: "skill",
    name: "Research",
    path: ".agents/skills/research",
    source: "library",
    status: "synced",
    assetId: "asset-research"
  };
  base.project.bindings = [binding];
  base.snapshot.artifacts = [inventorySkill(binding.path, binding.id)];
  const proposal = createRemoveSkillProposal({
    ...base,
    binding,
    filePaths: [
      ".agents/skills/research/SKILL.md",
      ".agents/skills/research/references/checklist.md"
    ]
  });

  assert.equal(proposal.kind, "remove-skill");
  assert.ok(proposal.files.every((file) => file.status === "deleted"));
  assert.ok(proposal.files.every((file) => file.content === undefined));
  assert.throws(() => createRemoveSkillProposal({
    ...base,
    binding,
    filePaths: [".agents/skills/other/SKILL.md"]
  }), /outside its Skill root/);
});

function proposalBase() {
  return {
    project: {
      id: "project-12345678",
      workspaceId: "ws_demo",
      name: "Product",
      slug: "product",
      description: "Product repository",
      status: "active" as const,
      repository: {
        provider: "github" as const,
        id: "99",
        nodeId: "R_99",
        owner: "acme",
        name: "product",
        url: "https://github.com/acme/product",
        defaultBranch: "main"
      },
      bindings: [] as ProjectBinding[],
      sync: { status: "synced" as const, revision: 1 },
      syncTokenConfigured: false,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z"
    },
    connection: {
      workspaceId: "ws_demo",
      projectId: "project-12345678",
      repositoryId: "99",
      repositoryNodeId: "R_99",
      owner: "acme",
      name: "product",
      defaultBranch: "main",
      mode: "github-app" as const,
      status: "active" as const,
      installationId: "42",
      permissionMode: "write" as const,
      connectedAt: "2026-07-22T00:00:00.000Z"
    },
    installation: {
      id: "42",
      workspaceId: "ws_demo",
      accountLogin: "acme",
      accountType: "Organization" as const,
      repositorySelection: "selected" as const,
      permissions: { contents: "write", pull_requests: "write" },
      linkedByAccountId: "acct_demo",
      linkedAt: "2026-07-22T00:00:00.000Z"
    },
    snapshot: {
      id: "snapshot",
      workspaceId: "ws_demo",
      projectId: "project-12345678",
      commitSha: "a".repeat(40),
      detectorVersion: "repository-harness-v1",
      trigger: "initial" as const,
      artifacts: [] as ProjectInventoryArtifact[],
      createdAt: "2026-07-22T00:00:00.000Z"
    },
    policies: [],
    accountId: "acct_demo"
  };
}

function librarySkill(slug: string, displayName: string): AssetRecord {
  return {
    id: `asset-${slug}`,
    kind: "skill",
    name: slug,
    displayName,
    slug,
    description: `${displayName} Skill`,
    health: "valid",
    validation: { errors: 0, warnings: 0 },
    storage: {
      provider: "s3",
      layout: "files",
      bucket: "skills",
      key: `skills/${slug}`,
      size: 10,
      fileCount: 1,
      contentType: "application/vnd.harhub.skill-directory",
      checksum: "b".repeat(64),
      uploadedAt: "2026-07-22T00:00:00.000Z"
    }
  };
}

function inventorySkill(path: string, bindingId: string): ProjectInventoryArtifact {
  return {
    id: `artifact-${bindingId}`,
    kind: "skill",
    format: "agent-skill",
    path,
    name: path.split("/").at(-1) ?? path,
    description: "Project Skill",
    digest: "a".repeat(64),
    fileCount: 1,
    size: 10,
    health: "valid",
    validation: { errors: 0, warnings: 0 },
    issues: [],
    relationship: "library-synced",
    bindingId
  };
}
