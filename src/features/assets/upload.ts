import type {
  AssetRecord,
  AssetProvenance,
  StoredObject,
  ValidationIssue
} from "../../shared/types.js";
import type { DiscoveredSkill } from "../skills/archive.js";
import { recordAssetVersion } from "./versioning.js";

export function createImportedSkillAsset(input: {
  workspaceId: string;
  skill: DiscoveredSkill;
  storage: StoredObject;
  rejectInvalid?: boolean;
  previous?: AssetRecord;
  versionSource?: "upload" | "manual-edit" | "project-sync" | "rollback";
  createdByAccountId?: string;
  versionSummary?: string;
  versionCreatedAt?: string;
  provenance?: AssetProvenance;
}): AssetRecord {
  if (input.skill.validation.errors > 0 && input.rejectInvalid !== false) {
    throw new Error(importValidationError(input.skill.validationIssues));
  }

  const assetId = `asset:skill:${input.workspaceId}:${input.skill.name}`;
  const validationIssues = input.skill.validationIssues.map((issue) => ({
    ...issue,
    assetId
  }));

  const asset: AssetRecord = {
    id: assetId,
    kind: "skill",
    name: input.skill.name,
    displayName: input.skill.displayName,
    slug: input.skill.name,
    description: input.skill.description,
    health: input.skill.health,
    storage: input.storage,
    validation: input.skill.validation,
    validationIssues,
    ...(input.provenance ? { provenance: input.provenance } : {})
  };

  return recordAssetVersion({
    asset,
    previous: input.previous,
    source: input.versionSource ?? "upload",
    ...(input.createdByAccountId
      ? { createdByAccountId: input.createdByAccountId }
      : {}),
    ...(input.versionSummary ? { summary: input.versionSummary } : {}),
    ...(input.versionCreatedAt ? { createdAt: input.versionCreatedAt } : {})
  });
}

function importValidationError(issues: ValidationIssue[]): string {
  const firstError = issues.find((issue) => issue.severity === "error");
  return firstError
    ? `Skill validation failed: ${firstError.code}: ${firstError.message}`
    : "Skill validation failed.";
}
