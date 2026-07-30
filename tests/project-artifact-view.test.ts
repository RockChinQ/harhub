import assert from "node:assert/strict";
import test from "node:test";
import type {
  ProjectBinding,
  ProjectBindingPolicy,
  ProjectInventoryArtifact
} from "../src/shared/types.js";
import { withCurrentLibraryBaseline } from "../src/web/src/views/project-artifact-view.js";

const artifact = {
  id: "artifact-filesystem-context",
  kind: "skill",
  format: "agent-skill",
  path: ".harness/skills/filesystem-context",
  name: "Filesystem Context",
  description: "Read filesystem context.",
  digest: "sha256:repository",
  fileCount: 1,
  size: 20,
  health: "valid",
  validation: { errors: 0, warnings: 0 },
  issues: [],
  relationship: "repository-owned",
  bindingId: "binding-filesystem-context"
} satisfies ProjectInventoryArtifact;

const binding = {
  id: "binding-filesystem-context",
  kind: "skill",
  name: "Filesystem Context",
  path: artifact.path,
  status: "synced",
  source: "harhub",
  sourceDigest: artifact.digest,
  sourceVersion: 3,
  repositoryDigest: artifact.digest,
  assetId: "asset-filesystem-context"
} satisfies ProjectBinding;

function policy(overrides: Partial<ProjectBindingPolicy> = {}): ProjectBindingPolicy {
  return {
    projectId: "project-1",
    artifactPath: artifact.path,
    ownership: "library",
    libraryAssetId: "asset-filesystem-context",
    pinnedVersion: 3,
    decidedByAccountId: "acct_demo",
    decidedAt: "2026-07-30T00:00:00.000Z",
    ...overrides
  };
}

test("uses the current policy baseline for an immutable repository snapshot", () => {
  const resolved = withCurrentLibraryBaseline(artifact, [policy()], [binding]);

  assert.equal(resolved.libraryAssetId, "asset-filesystem-context");
  assert.equal(resolved.libraryVersion, 3);
});

test("falls back to the published binding when a repository-owned policy lacks baseline metadata", () => {
  const resolved = withCurrentLibraryBaseline(
    artifact,
    [policy({ ownership: "repository", libraryAssetId: undefined, pinnedVersion: undefined })],
    [binding]
  );

  assert.equal(resolved.libraryAssetId, "asset-filesystem-context");
  assert.equal(resolved.libraryVersion, 3);
});

test("ignores stale Library metadata on a repository-owned policy", () => {
  const resolved = withCurrentLibraryBaseline(
    artifact,
    [policy({
      ownership: "repository",
      libraryAssetId: "asset-stale",
      pinnedVersion: 1
    })],
    [binding]
  );

  assert.equal(resolved.libraryAssetId, "asset-filesystem-context");
  assert.equal(resolved.libraryVersion, 3);
});

test("prefers current policy metadata over stale snapshot and binding metadata", () => {
  const resolved = withCurrentLibraryBaseline(
    { ...artifact, libraryAssetId: "asset-old", libraryVersion: 1 },
    [policy({ libraryAssetId: "asset-current", pinnedVersion: 4 })],
    [{ ...binding, assetId: "asset-binding", sourceVersion: 2 }]
  );

  assert.equal(resolved.libraryAssetId, "asset-current");
  assert.equal(resolved.libraryVersion, 4);
});

test("does not attach a stale snapshot version to a newer policy asset", () => {
  const resolved = withCurrentLibraryBaseline(
    { ...artifact, libraryAssetId: "asset-old", libraryVersion: 1 },
    [policy({ libraryAssetId: "asset-current", pinnedVersion: undefined })],
    [{ ...binding, assetId: "asset-current", sourceVersion: 5 }]
  );

  assert.equal(resolved.libraryAssetId, "asset-current");
  assert.equal(resolved.libraryVersion, 5);
});

test("clears a stale snapshot version when a newer policy asset has no resolved version", () => {
  const resolved = withCurrentLibraryBaseline(
    { ...artifact, libraryAssetId: "asset-old", libraryVersion: 1 },
    [policy({ libraryAssetId: "asset-current", pinnedVersion: undefined })],
    [{ ...binding, assetId: "asset-binding", sourceVersion: 2 }]
  );

  assert.equal(resolved.libraryAssetId, "asset-current");
  assert.equal(resolved.libraryVersion, undefined);
});
