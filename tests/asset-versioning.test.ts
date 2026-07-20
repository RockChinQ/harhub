import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAssetCatalog,
  normalizeAssetVersioning,
  recordAssetVersion
} from "../src/features/assets/index.js";
import type { AssetRecord, StoredObject } from "../src/shared/types.js";

test("creates monotonic Skill versions only when package content changes", () => {
  const initial = recordAssetVersion({
    asset: assetWithStorage(storage("checksum-a", "2026-07-20T08:00:00.000Z", 1)),
    source: "upload",
    createdByAccountId: "acct-1"
  });

  assert.equal(initial.version, 1);
  assert.equal(initial.versionHistory?.length, 1);
  assert.equal(initial.versionHistory?.[0]?.source, "upload");
  assert.deepEqual(initial.versionHistory?.[0]?.changes, ["Initial version"]);

  const updated = recordAssetVersion({
    asset: {
      ...assetWithStorage(storage("checksum-b", "2026-07-20T09:00:00.000Z", 2)),
      description: "Prepare verified release notes."
    },
    previous: initial,
    source: "project-sync",
    createdByAccountId: "acct-2"
  });

  assert.equal(updated.version, 2);
  assert.equal(updated.createdAt, "2026-07-20T08:00:00.000Z");
  assert.equal(updated.updatedAt, "2026-07-20T09:00:00.000Z");
  assert.equal(updated.versionHistory?.length, 2);
  assert.equal(updated.versionHistory?.[1]?.source, "project-sync");
  assert.deepEqual(updated.versionHistory?.[1]?.changes, [
    "Package contents changed",
    "Description changed",
    "File count changed from 1 to 2"
  ]);

  const duplicate = recordAssetVersion({
    asset: assetWithStorage({
      ...storage("checksum-b", "2026-07-20T10:00:00.000Z", 2),
      key: "workspaces/ws/skills/release-notes/duplicate/"
    }),
    previous: updated,
    source: "upload"
  });

  assert.equal(duplicate.version, 2);
  assert.equal(duplicate.versionHistory?.length, 2);
  assert.equal(duplicate.storage?.key, updated.storage?.key);
  assert.equal(duplicate.updatedAt, updated.updatedAt);
});

test("normalizes legacy catalogs into a stable initial version", () => {
  const legacy = assetWithStorage(storage("legacy-checksum", "2025-01-02T03:04:05.000Z", 1));
  const normalized = normalizeAssetVersioning(legacy);

  assert.equal(normalized.version, 1);
  assert.equal(normalized.createdAt, "2025-01-02T03:04:05.000Z");
  assert.equal(normalized.versionHistory?.[0]?.source, "migration");

  const catalog = normalizeAssetCatalog({
    schemaVersion: 1,
    generatedAt: "2025-01-02T03:04:05.000Z",
    workspaceId: "ws",
    assets: [legacy],
    skills: []
  });
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.assets[0]?.version, 1);
  assert.equal(catalog.assets[0]?.versionHistory?.length, 1);
});

function assetWithStorage(skillStorage: StoredObject): AssetRecord {
  return {
    id: "asset:skill:ws:release-notes",
    kind: "skill",
    name: "release-notes",
    displayName: "Release Notes",
    slug: "release-notes",
    description: "Prepare release notes.",
    health: "valid",
    storage: skillStorage,
    validation: { errors: 0, warnings: 0 }
  };
}

function storage(checksum: string, uploadedAt: string, fileCount: number): StoredObject {
  return {
    provider: "s3",
    layout: "files",
    bucket: "skills",
    key: `workspaces/ws/skills/release-notes/${checksum}/`,
    size: fileCount * 100,
    fileCount,
    contentType: "application/vnd.harhub.skill-directory",
    checksum,
    uploadedAt
  };
}
