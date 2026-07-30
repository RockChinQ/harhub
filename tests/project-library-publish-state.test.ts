import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("publishing a repository Skill updates its Library relationship and pinned version", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-library-publish-"));
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");

  try {
    const state = await import("../src/state/index.js");
    const project = await state.createGitHubAppProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      name: "Library publish state",
      description: "Tracks a changed Library Skill.",
      repository: {
        provider: "github",
        id: "99",
        nodeId: "R_99",
        owner: "acme",
        name: "product",
        url: "https://github.com/acme/product",
        defaultBranch: "main"
      }
    });
    const job = await state.createProjectScanJob({
      workspaceId: "ws_demo",
      projectId: project.id,
      trigger: "initial"
    });
    await state.markProjectScanRunning(job.id);
    const digest = "b".repeat(64);
    await state.completeProjectScan(job.id, {
      id: "snapshot-1",
      workspaceId: "ws_demo",
      projectId: project.id,
      commitSha: "a".repeat(40),
      detectorVersion: "repository-harness-v1",
      trigger: "initial",
      artifacts: [{
        id: "artifact-1",
        kind: "skill",
        format: "agent-skill",
        path: ".harness/skills/release-notes",
        name: "release-notes",
        description: "Prepare release notes.",
        digest,
        fileCount: 1,
        size: 20,
        health: "valid",
        validation: { errors: 0, warnings: 0 },
        issues: [],
        relationship: "library-modified",
        libraryAssetId: "asset-release-notes",
        libraryVersion: 1
      }, {
        id: "artifact-2",
        kind: "skill",
        format: "agent-skill",
        path: ".harness/skills/roadmap-review",
        name: "roadmap-review",
        description: "Review roadmap decisions.",
        digest: "c".repeat(64),
        fileCount: 1,
        size: 20,
        health: "valid",
        validation: { errors: 0, warnings: 0 },
        issues: [],
        relationship: "repository-owned"
      }],
      createdAt: "2026-07-30T00:01:00.000Z"
    }, []);
    await state.upsertProjectBindingPolicy({
      projectId: project.id,
      artifactPath: ".harness/skills/release-notes",
      ownership: "library",
      libraryAssetId: "asset-release-notes",
      pinnedVersion: 1,
      decidedByAccountId: "acct_demo",
      decidedAt: "2026-07-30T00:00:00.000Z"
    });

    await state.recordProjectArtifactPublishedToLibrary({
      workspaceId: "ws_demo",
      projectId: project.id,
      artifactPath: ".harness/skills/release-notes",
      digest,
      libraryAssetId: "asset-release-notes",
      libraryVersion: 2,
      decidedByAccountId: "acct_demo"
    });
    await state.recordProjectArtifactPublishedToLibrary({
      workspaceId: "ws_demo",
      projectId: project.id,
      artifactPath: ".harness/skills/roadmap-review",
      digest: "c".repeat(64),
      libraryAssetId: "asset-roadmap-review",
      libraryVersion: 1,
      decidedByAccountId: "acct_demo"
    });

    const inventory = await state.getProjectInventoryStateInternal("ws_demo", project.id);
    assert.equal(
      inventory.policies.find((policy) => policy.artifactPath.endsWith("/release-notes"))?.pinnedVersion,
      2
    );
    assert.equal(
      inventory.policies.find((policy) => policy.artifactPath.endsWith("/roadmap-review"))?.ownership,
      "library"
    );
    assert.deepEqual(
      inventory.latestSnapshot?.artifacts.map((artifact) => [artifact.relationship, artifact.libraryVersion]),
      [["library-synced", 2], ["library-synced", 1]]
    );
  } finally {
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
