import {
  createImportedSkillAsset,
  findAsset,
  upsertAsset
} from "../../features/assets/index.js";
import type { AssetCatalog, AssetRecord, WorkspaceRecord } from "../../shared/types.js";
import {
  describeWorkspaceCatalogStorage,
  writeWorkspaceAssetCatalog
} from "../../state/index.js";
import { assetListPayload } from "./asset-responses.js";
import { loadStoredSkill } from "./skill-packages.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";

export async function validateWorkspaceAssets(
  workspace: WorkspaceRecord
) {
  let catalog: AssetCatalog = await loadOrCreateWorkspaceAssetCatalog(workspace);

  for (const asset of catalog.assets) {
    if (!asset.storage) continue;
    const refreshed = await validateStoredAsset(workspace, asset);
    catalog = upsertAsset(catalog, refreshed);
  }

  await writeWorkspaceAssetCatalog(workspace.id, catalog);
  return {
    ...assetListPayload(workspace, catalog.generatedAt, catalog.assets),
    assetCatalogStorage: describeWorkspaceCatalogStorage(workspace.id)
  };
}

export async function validateWorkspaceAsset(
  workspace: WorkspaceRecord,
  query: string
) {
  const catalog = await loadOrCreateWorkspaceAssetCatalog(workspace);
  const asset = findAsset(catalog, query);
  if (!asset) {
    throw new Error("Asset not found.");
  }

  if (!asset.storage) {
    throw new Error("Only uploaded skill packages can be validated.");
  }

  const nextAsset = await validateStoredAsset(workspace, asset);
  const nextCatalog = upsertAsset(catalog, nextAsset);
  await writeWorkspaceAssetCatalog(workspace.id, nextCatalog);
  return {
    ...assetListPayload(workspace, nextCatalog.generatedAt, nextCatalog.assets),
    assetCatalogStorage: describeWorkspaceCatalogStorage(workspace.id),
    validated: nextAsset,
    validatedIssues: nextAsset.validationIssues ?? []
  };
}

export async function validateWorkspaceAssetBatch(
  workspace: WorkspaceRecord,
  queries: string[]
) {
  let catalog = await loadOrCreateWorkspaceAssetCatalog(workspace);
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const query of uniqueQueries(queries)) {
    const asset = findAsset(catalog, query);
    if (!asset) {
      failed.push({ id: query, error: "Asset not found." });
      continue;
    }

    if (!asset.storage) {
      failed.push({ id: query, error: "Only uploaded skill packages can be bulk validated." });
      continue;
    }

    try {
      const nextAsset = await validateStoredAsset(workspace, asset);
      catalog = upsertAsset(catalog, nextAsset);
      succeeded.push(asset.id);
    } catch (error) {
      failed.push({
        id: asset.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (succeeded.length > 0) {
    await writeWorkspaceAssetCatalog(workspace.id, catalog);
  }

  return {
    ...assetListPayload(workspace, catalog.generatedAt, catalog.assets),
    assetCatalogStorage: describeWorkspaceCatalogStorage(workspace.id),
    bulk: {
      action: "validate" as const,
      requested: queries.length,
      succeeded,
      failed
    }
  };
}

async function validateStoredAsset(
  workspace: WorkspaceRecord,
  asset: AssetRecord
): Promise<AssetRecord> {
  if (!asset.storage) return asset;

  const { skill } = await loadStoredSkill(asset.storage);
  const refreshed = createImportedSkillAsset({
    workspaceId: workspace.id,
    skill,
    storage: asset.storage,
    rejectInvalid: false
  });

  return {
    ...asset,
    health: refreshed.health,
    validation: refreshed.validation,
    validationIssues: refreshed.validationIssues
  };
}

function uniqueQueries(queries: string[]): string[] {
  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}
