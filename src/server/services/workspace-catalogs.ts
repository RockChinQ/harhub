import {
  assetCatalogToSkillCatalog,
  createAssetCatalog
} from "../../features/assets/index.js";
import {
  createCatalog,
  scanSkills,
  validateSkills
} from "../../features/skills/index.js";
import {
  describeWorkspaceCatalogStorage,
  readWorkspaceAssetCatalog,
  readWorkspaceSkillCatalog,
  writeWorkspaceAssetCatalog,
  writeWorkspaceSkillCatalog
} from "../../state/index.js";
import { getStorageStatus } from "../../storage/index.js";
import type {
  AssetCatalog,
  SkillCatalog,
  WorkspaceRecord
} from "../../shared/types.js";

export async function loadOrCreateWorkspaceCatalog(workspace: WorkspaceRecord): Promise<SkillCatalog> {
  const assetCatalog = await readWorkspaceAssetCatalog(workspace.id);
  if (assetCatalog) {
    return assetCatalogToSkillCatalog(assetCatalog);
  }

  const catalog = await readWorkspaceSkillCatalog(workspace.id);
  if (catalog) {
    const needsRefresh =
      catalog.workspaceId !== workspace.id ||
      catalog.skills.some((skill) => !skill.displayName || !skill.source);
    if (!needsRefresh) return catalog;
  }

  return (await scanAndPersistWorkspace(workspace, workspace.defaultScanPaths)).catalog;
}

export async function loadOrCreateWorkspaceAssetCatalog(workspace: WorkspaceRecord): Promise<AssetCatalog> {
  const catalog = await readWorkspaceAssetCatalog(workspace.id);
  if (catalog) {
    const needsRefresh =
      catalog.workspaceId !== workspace.id ||
      catalog.assets.some((asset) => !asset.displayName || !asset.kind);
    if (!needsRefresh) return catalog;
  }

  return (await scanAndPersistWorkspace(workspace, workspace.defaultScanPaths)).assetCatalog;
}

export async function scanAndPersistWorkspace(workspace: WorkspaceRecord, roots: string[]) {
  const previousAssetCatalog = await readWorkspaceAssetCatalog(workspace.id);
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const catalog = {
    ...createCatalog(skills),
    workspaceId: workspace.id
  };
  const storedAssets = previousAssetCatalog?.assets.filter((asset) => asset.storage) ?? [];
  const scannedAssetCatalog = createAssetCatalog(skills, issues);
  const assetCatalog = {
    ...scannedAssetCatalog,
    workspaceId: workspace.id,
    assets: [
      ...scannedAssetCatalog.assets,
      ...storedAssets.filter(
        (storedAsset) =>
          !scannedAssetCatalog.assets.some((scannedAsset) => scannedAsset.id === storedAsset.id)
      )
    ].sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeWorkspaceSkillCatalog(workspace.id, catalog);
  await writeWorkspaceAssetCatalog(workspace.id, assetCatalog);

  return {
    workspace,
    catalog,
    assetCatalog,
    catalogStorage: describeWorkspaceCatalogStorage(workspace.id),
    assetCatalogStorage: describeWorkspaceCatalogStorage(workspace.id),
    generatedAt: catalog.generatedAt,
    storage: getStorageStatus(),
    assets: assetCatalog.assets,
    skills,
    issues
  };
}
