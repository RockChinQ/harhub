import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createAssetCatalog, upsertAsset } from "../src/features/assets/index.js";
import type { AssetRecord, WorkspaceRecord } from "../src/shared/types.js";
import { readWorkspaceAssetCatalog } from "../src/state/index.js";
import { mutateWorkspaceAssetCatalog } from "../src/server/services/workspace-catalogs.js";

const workspace: WorkspaceRecord = {
  id: "ws-catalog-mutation",
  name: "Catalog mutation",
  slug: "catalog-mutation",
  createdAt: "2026-08-05T00:00:00.000Z"
};

test("keeps direct catalog writes inside the canonical mutation boundary", () => {
  const services = path.resolve("src/server/services");
  const allowed = new Set(["workspace-catalogs.ts", "project-skill-forks.ts"]);
  const offenders = readdirSync(services)
    .filter((file) => file.endsWith(".ts") && !allowed.has(file))
    .filter((file) => readFileSync(path.join(services, file), "utf8").includes("writeWorkspaceAssetCatalog"));
  assert.deepEqual(offenders, []);
});

test("serializes complete catalog read-modify-write operations without losing concurrent assets", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "harhub-catalog-mutation-"));
  const previousCwd = process.cwd();
  process.chdir(directory);

  try {
    await Promise.all([
      mutateWorkspaceAssetCatalog(workspace, async (catalog) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { catalog: upsertAsset(catalog, asset("first")), value: undefined };
      }),
      mutateWorkspaceAssetCatalog(workspace, async (catalog) => ({
        catalog: upsertAsset(catalog, asset("second")),
        value: undefined
      }))
    ]);

    const catalog = await readWorkspaceAssetCatalog(workspace.id);
    assert.deepEqual(catalog?.assets.map((item) => item.name).sort(), ["first", "second"]);
  } finally {
    process.chdir(previousCwd);
    rmSync(directory, { recursive: true, force: true });
  }
});

function asset(name: string): AssetRecord {
  return {
    id: `asset:skill:${workspace.id}:${name}`,
    kind: "skill",
    name,
    displayName: name,
    slug: name,
    description: `${name} Skill`,
    health: "valid",
    validation: { errors: 0, warnings: 0 },
    storage: {
      provider: "s3",
      layout: "files",
      bucket: "test",
      key: `workspaces/${workspace.id}/skills/${name}/digest/`,
      size: 1,
      fileCount: 1,
      contentType: "application/vnd.harhub.skill-directory",
      checksum: name.padEnd(64, "0"),
      uploadedAt: "2026-08-05T00:00:00.000Z"
    }
  };
}
