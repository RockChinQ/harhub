import {
  assetCatalogToSkillCatalog,
  createAssetCatalog
} from "../../features/assets/index.js";
import {
  readWorkspaceAssetCatalog,
  writeWorkspaceAssetCatalog
} from "../../state/index.js";
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
    const emptyCatalog = {
      ...createAssetCatalog([]),
      workspaceId: workspace.id
    };
    await writeWorkspaceAssetCatalog(workspace.id, emptyCatalog);
    return emptyCatalog;
  }

  const assets = catalog.assets.filter((asset) => Boolean(asset.storage));
  const needsMigration =
    catalog.workspaceId !== workspace.id ||
    assets.length !== catalog.assets.length ||
    catalog.skills.length > 0;
  const cloudCatalog: AssetCatalog = {
    ...catalog,
    workspaceId: workspace.id,
    assets,
    skills: []
  };

  if (needsMigration) {
    cloudCatalog.generatedAt = new Date().toISOString();
    await writeWorkspaceAssetCatalog(workspace.id, cloudCatalog);
  }

  return cloudCatalog;
}
