import {
  createUploadedSkillAsset,
  findAsset,
  upsertAsset,
  writeAssetCatalog
} from "../../features/assets/index.js";
import type { AssetCatalog, AssetRecord, WorkspaceRecord } from "../../shared/types.js";
import { getWorkspaceAssetCatalogPath } from "../../state/index.js";
import { readStoredObject } from "../../storage/index.js";
import { assetListPayload } from "./asset-responses.js";
import {
  loadOrCreateWorkspaceAssetCatalog,
  scanAndPersistWorkspace
} from "./workspace-catalogs.js";

export async function validateWorkspaceAssets(
  workspace: WorkspaceRecord,
  roots: string[]
) {
  const scanned = scanAndPersistWorkspace(workspace, roots);
  let catalog: AssetCatalog = scanned.assetCatalog;

  for (const asset of catalog.assets) {
    if (!asset.storage) continue;
    const refreshed = await validateStoredAsset(workspace, asset);
    catalog = upsertAsset(catalog, refreshed);
  }

  writeAssetCatalog(getWorkspaceAssetCatalogPath(workspace.id), catalog);
  return {
    ...assetListPayload(workspace, catalog.generatedAt, catalog.assets),
    assetCatalogPath: getWorkspaceAssetCatalogPath(workspace.id)
  };
}

export async function validateWorkspaceAsset(
  workspace: WorkspaceRecord,
  query: string
) {
  const catalog = loadOrCreateWorkspaceAssetCatalog(workspace);
  const asset = findAsset(catalog, query);
  if (!asset) {
    throw new Error("Asset not found.");
  }

  if (!asset.storage) {
    const refreshed = scanAndPersistWorkspace(workspace, [
      workspace.skillRoot,
      ...workspace.defaultScanPaths
    ]);
    const validated = findAsset(refreshed.assetCatalog, query);
    return {
      ...assetListPayload(workspace, refreshed.assetCatalog.generatedAt, refreshed.assetCatalog.assets),
      assetCatalogPath: getWorkspaceAssetCatalogPath(workspace.id),
      validated,
      validatedIssues: validated?.validationIssues ?? []
    };
  }

  const nextAsset = await validateStoredAsset(workspace, asset);
  const nextCatalog = upsertAsset(catalog, nextAsset);
  writeAssetCatalog(getWorkspaceAssetCatalogPath(workspace.id), nextCatalog);
  return {
    ...assetListPayload(workspace, nextCatalog.generatedAt, nextCatalog.assets),
    assetCatalogPath: getWorkspaceAssetCatalogPath(workspace.id),
    validated: nextAsset,
    validatedIssues: nextAsset.validationIssues ?? []
  };
}

async function validateStoredAsset(
  workspace: WorkspaceRecord,
  asset: AssetRecord
): Promise<AssetRecord> {
  if (!asset.storage) return asset;

  const buffer = await readStoredObject(asset.storage);
  const refreshed = await createUploadedSkillAsset({
    workspaceId: workspace.id,
    fileName: asset.storage.originalName ?? `${asset.name}.zip`,
    buffer,
    storage: asset.storage,
    name: asset.name,
    description: asset.description,
    owner: asset.owner,
    tags: asset.tags,
    rejectInvalid: false
  });

  return {
    ...asset,
    contentHash: refreshed.contentHash,
    health: refreshed.health,
    validation: refreshed.validation,
    validationIssues: refreshed.validationIssues,
    metadata: {
      ...asset.metadata,
      ...refreshed.metadata
    },
    updatedAt: new Date().toISOString()
  };
}
