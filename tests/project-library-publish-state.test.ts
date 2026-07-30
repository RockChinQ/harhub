import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const artifactPath = ".harness/skills/release-notes";
const repositoryDigest = "b".repeat(64);

test("publishing a repository Skill atomically advances its binding and Library policy without rewriting its scan snapshot", async () => {
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
    await state.syncProjectFromGitHubApp(
      "ws_demo",
      project.id,
      {
        schemaVersion: 1,
        repository: "acme/product",
        commitSha: "a".repeat(40),
        ref: "main",
        bindings: [{
          kind: "skill",
          name: "Release notes",
          path: artifactPath,
          digest: repositoryDigest
        }]
      },
      [{
        path: artifactPath,
        digest: repositoryDigest,
        fileCount: 1,
        size: 20,
        validation: { errors: 0, warnings: 0 },
        validationIssues: [],
        updatedAt: "2026-07-30T00:00:00.000Z",
        storage: {
          provider: "s3",
          layout: "files",
          bucket: "skills",
          key: "project-forks/release-notes/",
          size: 20,
          checksum: repositoryDigest,
          checksumAlgorithm: "skill-files-v3"
        }
      }],
      0,
      [{ path: artifactPath, assetId: "asset-release-notes", digest: "c".repeat(64), version: 1 }]
    );
    const changedProject = await state.getProject("acct_demo", "ws_demo", project.id);
    const binding = changedProject.bindings.find((candidate) => candidate.path === artifactPath);
    assert.equal(binding?.status, "modified");

    const job = await state.createProjectScanJob({
      workspaceId: "ws_demo",
      projectId: project.id,
      trigger: "initial"
    });
    await state.markProjectScanRunning(job.id);
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
        path: artifactPath,
        name: "release-notes",
        description: "Prepare release notes.",
        digest: repositoryDigest,
        fileCount: 1,
        size: 20,
        health: "valid",
        validation: { errors: 0, warnings: 0 },
        issues: [],
        relationship: "library-modified",
        bindingId: binding!.id,
        libraryAssetId: "asset-release-notes",
        libraryVersion: 1
      }],
      createdAt: "2026-07-30T00:01:00.000Z"
    }, []);
    await state.upsertProjectBindingPolicy({
      projectId: project.id,
      artifactPath,
      ownership: "library",
      libraryAssetId: "asset-release-notes",
      pinnedVersion: 1,
      decidedByAccountId: "acct_demo",
      decidedAt: "2026-07-30T00:00:00.000Z"
    });

    const published = await state.recordProjectSkillPublished({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      projectId: project.id,
      bindingId: binding!.id,
      artifactPath,
      assetId: "asset-release-notes",
      assetVersion: 2,
      digest: repositoryDigest,
      name: "Release notes"
    });

    const publishedBinding = published.bindings.find((candidate) => candidate.id === binding!.id);
    assert.equal(publishedBinding?.status, "synced");
    assert.equal(publishedBinding?.sourceVersion, 2);
    assert.equal(publishedBinding?.fork, undefined);

    const inventory = await state.getProjectInventoryStateInternal("ws_demo", project.id);
    assert.equal(inventory.policies[0]?.ownership, "library");
    assert.equal(inventory.policies[0]?.libraryAssetId, "asset-release-notes");
    assert.equal(inventory.policies[0]?.pinnedVersion, 2);
    assert.equal(inventory.policies[0]?.decidedByAccountId, "acct_demo");
    assert.deepEqual(
      inventory.latestSnapshot?.artifacts.map((artifact) => [artifact.relationship, artifact.libraryVersion]),
      [["library-modified", 1]],
      "repository scan snapshots are immutable historical observations"
    );
  } finally {
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
