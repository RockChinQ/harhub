import {
  getWorkspaceAssetCatalogPath
} from "../../state/index.js";
import { getStorageStatus } from "../../storage/index.js";
import type { AssetRecord, WorkspaceRecord } from "../../shared/types.js";

export function assetListPayload(
  workspace: WorkspaceRecord,
  generatedAt: string,
  assets: AssetRecord[]
) {
  const issues = assets.flatMap((asset) => asset.validationIssues ?? []);

  return {
    workspace,
    catalogPath: getWorkspaceAssetCatalogPath(workspace.id),
    generatedAt,
    storage: getStorageStatus(),
    issues,
    assets,
    skills: assets
      .map((asset) => asset.skill)
      .filter((skill): skill is NonNullable<AssetRecord["skill"]> => Boolean(skill))
  };
}
