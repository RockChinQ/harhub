import {
  assetCatalogToSkillCatalog,
  createAssetCatalog
} from "../../features/assets/index.js";
import {
  readWorkspaceAssetCatalog,
  writeWorkspaceAssetCatalog
} from "../../state/index.js";
import { serializeStateAccess } from "../../state/access.js";
import type {
  AssetCatalog,
  SkillCatalog,
  WorkspaceRecord
} from "../../shared/types.js";

export async function loadOrCreateWorkspaceCatalog(workspace: WorkspaceRecord): Promise<SkillCatalog> {
  return assetCatalogToSkillCatalog(await loadOrCreateWorkspaceAssetCatalog(workspace));
}

export async function loadOrCreateWorkspaceAssetCatalog(workspace: WorkspaceRecord): Promise<AssetCatalog> {
  const catalog = await readWorkspaceAssetCatalog(workspace.id);
  if (!catalog) {
    return {
      ...createAssetCatalog([]),
      workspaceId: workspace.id
    };
  }

  const assets = catalog.assets.filter((asset) => Boolean(asset.storage));
  return {
    ...catalog,
    schemaVersion: 2,
    workspaceId: workspace.id,
    assets,
    skills: []
  };
}

export function mutateWorkspaceAssetCatalog<T>(
  workspace: WorkspaceRecord,
  mutation: (catalog: AssetCatalog) => Promise<{ catalog: AssetCatalog; value: T }>
): Promise<{ catalog: AssetCatalog; value: T }> {
  return serializeStateAccess(async () => {
    const result = await mutation(await loadOrCreateWorkspaceAssetCatalog(workspace));
    await writeWorkspaceAssetCatalog(workspace.id, result.catalog);
    return result;
  });
}
