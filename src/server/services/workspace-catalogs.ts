import { existsSync } from "node:fs";
import {
  assetCatalogToSkillCatalog,
  createAssetCatalog,
  readAssetCatalog,
  writeAssetCatalog
} from "../../features/assets/index.js";
import {
  createCatalog,
  readCatalog,
  scanSkills,
  validateSkills,
  writeCatalog
} from "../../features/skills/index.js";
import {
  getWorkspaceAssetCatalogPath,
  getWorkspaceCatalogPath
} from "../../state/index.js";
import { getStorageStatus } from "../../storage/index.js";
import type {
  AssetCatalog,
  SkillCatalog,
  WorkspaceRecord
} from "../../shared/types.js";

export function loadOrCreateWorkspaceCatalog(workspace: WorkspaceRecord): SkillCatalog {
  const assetPath = getWorkspaceAssetCatalogPath(workspace.id);
  if (existsSync(assetPath)) {
    return assetCatalogToSkillCatalog(readAssetCatalog(assetPath));
  }

  const catalogPath = getWorkspaceCatalogPath(workspace.id);
  if (existsSync(catalogPath)) {
    const catalog = readCatalog(catalogPath);
    const needsRefresh =
      catalog.workspaceId !== workspace.id ||
      catalog.skills.some((skill) => !skill.displayName || !skill.resources);
    if (!needsRefresh) return catalog;
  }

  return scanAndPersistWorkspace(workspace, workspace.defaultScanPaths).catalog;
}

export function loadOrCreateWorkspaceAssetCatalog(workspace: WorkspaceRecord): AssetCatalog {
  const catalogPath = getWorkspaceAssetCatalogPath(workspace.id);
  if (existsSync(catalogPath)) {
    const catalog = readAssetCatalog(catalogPath);
    const needsRefresh =
      catalog.workspaceId !== workspace.id ||
      catalog.assets.some((asset) => !asset.displayName || !asset.kind);
    if (!needsRefresh) return catalog;
  }

  return scanAndPersistWorkspace(workspace, workspace.defaultScanPaths).assetCatalog;
}

export function scanAndPersistWorkspace(workspace: WorkspaceRecord, roots: string[]) {
  const previousAssetCatalog = existsSync(getWorkspaceAssetCatalogPath(workspace.id))
    ? readAssetCatalog(getWorkspaceAssetCatalogPath(workspace.id))
    : undefined;
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

  writeCatalog(getWorkspaceCatalogPath(workspace.id), catalog);
  writeAssetCatalog(getWorkspaceAssetCatalogPath(workspace.id), assetCatalog);

  return {
    workspace,
    catalog,
    assetCatalog,
    catalogPath: getWorkspaceCatalogPath(workspace.id),
    assetCatalogPath: getWorkspaceAssetCatalogPath(workspace.id),
    generatedAt: catalog.generatedAt,
    storage: getStorageStatus(),
    assets: assetCatalog.assets,
    skills,
    issues
  };
}
