import {
  describeWorkspaceCatalogStorage
} from "../../state/index.js";
import { getStorageStatus } from "../../storage/index.js";
import type { AssetRecord, SkillRecord, WorkspaceRecord } from "../../shared/types.js";

export function assetListPayload(
  workspace: WorkspaceRecord,
  generatedAt: string,
  assets: AssetRecord[],
  skills: SkillRecord[] = []
) {
  const issues = assets.flatMap((asset) => asset.validationIssues ?? []);
  const summaries = assets.map(({ versionHistory: _versionHistory, ...asset }) => asset);

  return {
    workspace,
    catalogStorage: describeWorkspaceCatalogStorage(workspace.id),
    generatedAt,
    storage: getStorageStatus(),
    issues,
    assets: summaries,
    skills
  };
}
