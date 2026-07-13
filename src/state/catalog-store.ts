import { existsSync } from "node:fs";
import {
  readAssetCatalog,
  writeAssetCatalog
} from "../features/assets/index.js";
import type { AssetCatalog } from "../shared/types.js";
import {
  getCatalogStorageLabel,
  isDatabaseStateEnabled,
  readDatabaseAssetCatalog,
  writeDatabaseAssetCatalog
} from "./database.js";
import { getWorkspaceAssetCatalogPath } from "./paths.js";

export async function readWorkspaceAssetCatalog(
  workspaceId: string
): Promise<AssetCatalog | undefined> {
  if (isDatabaseStateEnabled()) {
    return readDatabaseAssetCatalog(workspaceId);
  }

  const catalogPath = getWorkspaceAssetCatalogPath(workspaceId);
  return existsSync(catalogPath) ? readAssetCatalog(catalogPath) : undefined;
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
