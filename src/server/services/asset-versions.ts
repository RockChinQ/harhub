import {
  createImportedSkillAsset,
  findAsset,
  obsoleteAssetStorageObjects,
  removeCatalogAsset,
  upsertAsset
} from "../../features/assets/index.js";
import type {
  AssetCatalog,
  AssetRecord,
  AssetVersionRecord,
  WorkspaceRecord
} from "../../shared/types.js";
import { writeWorkspaceAssetCatalog } from "../../state/index.js";
import type { WorkspaceContext } from "../../state/types.js";
import { deleteStoredObject } from "../../storage/index.js";
import { assertWorkspaceAdminContext } from "../authorization.js";
import { getStoredSkillArchive, loadStoredSkill } from "./skill-packages.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";

export async function getWorkspaceAssetVersionArchive(input: {
  workspace: WorkspaceRecord;
  assetQuery: string;
  version: number;
}): Promise<{ buffer: Buffer; checksum: string; fileName: string }> {
  const catalog = await loadOrCreateWorkspaceAssetCatalog(input.workspace);
  const asset = requireAsset(catalog, input.assetQuery);
  const version = requireRetainedVersion(asset, input.version);
  const archive = await getStoredSkillArchive({ ...asset, storage: version.storage });
  return {
    ...archive,
    fileName: `${asset.name}-v${version.version}.zip`
  };
}

export async function rollbackWorkspaceAssetVersion(input: {
  context: WorkspaceContext;
  assetQuery: string;
  version: number;
}): Promise<{ asset: AssetRecord; restoredFromVersion: number }> {
  assertWorkspaceAdminContext(input.context);
  const catalog = await loadOrCreateWorkspaceAssetCatalog(input.context.workspace);
  const previous = requireAsset(catalog, input.assetQuery);
  if (previous.version === input.version) {
    throw new Error(`Skill v${input.version} is already current.`);
  }
  const target = requireRetainedVersion(previous, input.version);
  const { skill } = await loadStoredSkill(target.storage);
  const asset = createImportedSkillAsset({
    workspaceId: input.context.workspace.id,
    skill,
    storage: target.storage,
    previous,
    versionSource: "rollback",
    createdByAccountId: input.context.account.id,
    versionSummary: `Restored the package from v${target.version}`,
    versionCreatedAt: new Date().toISOString()
  });

  let nextCatalog = removeCatalogAsset(catalog, previous.id);
  nextCatalog = upsertAsset(nextCatalog, asset);
  await writeWorkspaceAssetCatalog(input.context.workspace.id, nextCatalog);
  await Promise.all(obsoleteAssetStorageObjects([previous], [asset]).map((storage) =>
    deleteStoredObject(storage).catch(() => undefined)
  ));
  return { asset, restoredFromVersion: target.version };
}

function requireAsset(catalog: AssetCatalog, query: string): AssetRecord {
  const asset = findAsset(catalog, query);
  if (!asset) throw new Error("Asset not found.");
  return asset;
}

function requireRetainedVersion(
  asset: AssetRecord,
  versionNumber: number
): AssetVersionRecord & { storage: NonNullable<AssetVersionRecord["storage"]> } {
  const version = asset.versionHistory?.find((entry) => entry.version === versionNumber);
  if (!version) throw new Error("Asset version not found.");
  if (!version.storage) {
    throw new Error("This version package is no longer retained.");
  }
  return { ...version, storage: version.storage };
}
