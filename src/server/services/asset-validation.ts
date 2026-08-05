import {
  createImportedSkillAsset,
  findAsset,
  upsertAsset
} from "../../features/assets/index.js";
import { createImportedMcpAsset } from "../../features/mcp/index.js";
import type { AssetCatalog, AssetRecord, WorkspaceRecord } from "../../shared/types.js";
import { describeWorkspaceCatalogStorage } from "../../state/index.js";
import { assetListPayload } from "./asset-responses.js";
import { loadStoredMcp, loadStoredSkill } from "./skill-packages.js";
import { mutateWorkspaceAssetCatalog } from "./workspace-catalogs.js";

export async function validateWorkspaceAssets(
  workspace: WorkspaceRecord
) {
  const { catalog } = await mutateWorkspaceAssetCatalog(workspace, async (original) => {
    let catalog: AssetCatalog = original;
    for (const asset of catalog.assets) {
      if (!asset.storage) continue;
      catalog = upsertAsset(catalog, await validateStoredAsset(workspace, asset));
    }
    return { catalog, value: undefined };
  });
  return {
    ...assetListPayload(workspace, catalog.generatedAt, catalog.assets),
    assetCatalogStorage: describeWorkspaceCatalogStorage(workspace.id)
  };
}

export async function validateWorkspaceAsset(
  workspace: WorkspaceRecord,
  query: string
) {
  const { catalog: nextCatalog, value: nextAsset } = await mutateWorkspaceAssetCatalog(workspace, async (catalog) => {
    const asset = findAsset(catalog, query);
    if (!asset) throw new Error("Asset not found.");
    if (!asset.storage) throw new Error("Only uploaded assets can be validated.");
    const nextAsset = await validateStoredAsset(workspace, asset);
    return { catalog: upsertAsset(catalog, nextAsset), value: nextAsset };
  });
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
  const { catalog, value: { succeeded, failed } } = await mutateWorkspaceAssetCatalog(workspace, async (original) => {
    let catalog = original;
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const query of uniqueQueries(queries)) {
      const asset = findAsset(catalog, query);
      if (!asset) { failed.push({ id: query, error: "Asset not found." }); continue; }
      if (!asset.storage) { failed.push({ id: query, error: "Only uploaded assets can be bulk validated." }); continue; }
      try {
        catalog = upsertAsset(catalog, await validateStoredAsset(workspace, asset));
        succeeded.push(asset.id);
      } catch (error) {
        failed.push({ id: asset.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { catalog, value: { succeeded, failed } };
  });

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

  const refreshed = asset.kind === "skill"
    ? createImportedSkillAsset({
        workspaceId: workspace.id,
        skill: (await loadStoredSkill(asset.storage)).skill,
        storage: asset.storage,
        previous: asset,
        rejectInvalid: false
      })
    : createImportedMcpAsset({
        workspaceId: workspace.id,
        name: asset.name,
        displayName: asset.displayName,
        description: asset.description,
        analyzed: (await loadStoredMcp(asset.storage)).analyzed,
        storage: asset.storage,
        previous: asset,
        rejectInvalid: false
      });

  return {
    ...asset,
    health: refreshed.health,
    validation: refreshed.validation,
    validationIssues: refreshed.validationIssues,
    ...(refreshed.mcp ? { mcp: refreshed.mcp } : {})
  };
}

function uniqueQueries(queries: string[]): string[] {
  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}
