import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldDeleteUncommittedObject,
  storedObjectReferenceState
} from "../src/server/services/asset-storage-compensation.js";
import type { AssetCatalog, AssetRecord, StoredObject } from "../src/shared/types.js";

test("recognizes references in both current and retained historical versions", () => {
  const current: StoredObject = {
    provider: "s3",
    layout: "files",
    bucket: "bucket",
    key: "current.zip",
    size: 1,
    fileCount: 1,
    contentType: "application/vnd.harhub.skill-directory",
    checksum: "a",
    uploadedAt: "2026-08-05T00:00:00.000Z"
  };
  const historical: StoredObject = {
    provider: "s3",
    layout: "files",
    bucket: "bucket",
    key: "historical.zip",
    size: 1,
    fileCount: 1,
    contentType: "application/vnd.harhub.skill-directory",
    checksum: "b",
    uploadedAt: "2026-08-04T00:00:00.000Z"
  };
  const asset = {
    id: "asset:skill:workspace:demo",
    kind: "skill",
    name: "demo",
    displayName: "Demo",
    slug: "demo",
    description: "Demo",
    version: 2,
    storage: current,
    health: "valid",
    validation: { errors: 0, warnings: 0 },
    validationIssues: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    versionHistory: [{
      version: 1,
      displayName: "Demo",
      description: "Demo",
      summary: "Initial version",
      changes: ["Initial version"],
      health: "valid",
      validation: { errors: 0, warnings: 0 },
      source: "upload",
      storage: historical,
      createdAt: "2026-08-04T00:00:00.000Z"
    }]
  } satisfies AssetRecord;
  const catalog: AssetCatalog = {
    schemaVersion: 2,
    generatedAt: "2026-08-05T00:00:00.000Z",
    workspaceId: "workspace",
    assets: [asset],
    skills: []
  };

  assert.equal(storedObjectReferenceState(catalog, current), "referenced");
  assert.equal(storedObjectReferenceState(catalog, historical), "referenced");
  assert.equal(storedObjectReferenceState(catalog, { ...current, key: "orphan.zip" }), "unreferenced");
});

test("deletes a newly uploaded object only when catalog state proves it is unreferenced", () => {
  assert.equal(shouldDeleteUncommittedObject({ status: "unreferenced" }), true);
  assert.equal(shouldDeleteUncommittedObject({ status: "referenced" }), false);
  assert.equal(shouldDeleteUncommittedObject({ status: "unknown" }), false);
});
