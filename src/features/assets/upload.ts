import type {
  AssetRecord,
  StoredObject,
  ValidationIssue
} from "../../shared/types.js";
import type { DiscoveredSkill } from "../skills/archive.js";

export function createImportedSkillAsset(input: {
  workspaceId: string;
  skill: DiscoveredSkill;
  storage: StoredObject;
  rejectInvalid?: boolean;
}): AssetRecord {
  if (input.skill.validation.errors > 0 && input.rejectInvalid !== false) {
    throw new Error(importValidationError(input.skill.validationIssues));
  }

  const assetId = `asset:skill:${input.workspaceId}:${input.skill.name}`;
  const validationIssues = input.skill.validationIssues.map((issue) => ({
    ...issue,
    assetId
  }));

  return {
    id: assetId,
    kind: "skill",
    name: input.skill.name,
    displayName: input.skill.displayName,
    slug: input.skill.name,
    description: input.skill.description,
    health: input.skill.health,
    storage: input.storage,
    validation: input.skill.validation,
    validationIssues
  };
}

function importValidationError(issues: ValidationIssue[]): string {
  const firstError = issues.find((issue) => issue.severity === "error");
  return firstError
    ? `Skill validation failed: ${firstError.code}: ${firstError.message}`
    : "Skill validation failed.";
}
