import { existsSync } from "node:fs";
import {
  readAssetCatalog,
  writeAssetCatalog
} from "../features/assets/index.js";
import {
  readCatalog,
  writeCatalog
} from "../features/skills/index.js";
import type { AssetCatalog, SkillCatalog } from "../shared/types.js";
import {
  getCatalogStorageLabel,
  isDatabaseStateEnabled,
  readDatabaseAssetCatalog,
  readDatabaseSkillCatalog,
  writeDatabaseAssetCatalog,
  writeDatabaseSkillCatalog
} from "./database.js";
import {
  getWorkspaceAssetCatalogPath,
  getWorkspaceCatalogPath
} from "./paths.js";

export async function readWorkspaceSkillCatalog(
  workspaceId: string
): Promise<SkillCatalog | undefined> {
  if (isDatabaseStateEnabled()) {
    return readDatabaseSkillCatalog(workspaceId);
  }

  const catalogPath = getWorkspaceCatalogPath(workspaceId);
  return existsSync(catalogPath) ? readCatalog(catalogPath) : undefined;
}

export async function readWorkspaceAssetCatalog(
  workspaceId: string
): Promise<AssetCatalog | undefined> {
  if (isDatabaseStateEnabled()) {
    return readDatabaseAssetCatalog(workspaceId);
  }

  const catalogPath = getWorkspaceAssetCatalogPath(workspaceId);
  return existsSync(catalogPath) ? readAssetCatalog(catalogPath) : undefined;
}

export async function writeWorkspaceSkillCatalog(
  workspaceId: string,
  catalog: SkillCatalog
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await writeDatabaseSkillCatalog(workspaceId, catalog);
    return;
  }

  writeCatalog(getWorkspaceCatalogPath(workspaceId), catalog);
}

export async function writeWorkspaceAssetCatalog(
  workspaceId: string,
  catalog: AssetCatalog
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await writeDatabaseAssetCatalog(workspaceId, catalog);
    return;
  }

  writeAssetCatalog(getWorkspaceAssetCatalogPath(workspaceId), catalog);
}

export function describeWorkspaceCatalogStorage(workspaceId: string): string {
  return isDatabaseStateEnabled()
    ? getCatalogStorageLabel(workspaceId)
    : getWorkspaceAssetCatalogPath(workspaceId);
}
