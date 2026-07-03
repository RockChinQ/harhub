import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMarkdown, stringValue } from "../../shared/markdown.js";
import type { SkillRecord, ValidationIssue } from "../../shared/types.js";
import {
  OFFICIAL_SKILL_NAME_PATTERN,
  STANDARD_FRONTMATTER_KEYS
} from "./constants.js";

export interface SkillMarkdownValidationInput {
  content: string;
  path?: string;
  skillId?: string;
  assetId?: string;
  skillDirName?: string;
}

export function validateSkills(records: SkillRecord[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (records.length === 0) {
    issues.push({
      severity: "error",
      code: "no-skills-found",
      message: "No SKILL.md files were found in the provided paths."
    });
  }

  for (const record of records) {
    issues.push(...validateSkillRecord(record));
  }

  return issues;
}

function validateSkillRecord(record: SkillRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const content = readFileSync(record.source.absolutePath, "utf8");
  const skillDirName = path.basename(path.dirname(record.source.absolutePath));

  issues.push(...validateSkillMarkdown({
    content,
    path: record.source.absolutePath,
    skillId: record.id,
    skillDirName
  }));
  return issues;
}

export function validateSkillMarkdown(input: SkillMarkdownValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const parsed = parseMarkdown(input.content);
  const frontmatterKeys = Object.keys(parsed.frontmatter);
  const context = {
    path: input.path,
    skillId: input.skillId,
    assetId: input.assetId
  };

  if (!parsed.hasFrontmatter) {
    issues.push(markdownIssue(
      context,
      "error",
      "missing-frontmatter",
      parsed.frontmatterError ??
        "SKILL.md must start with YAML frontmatter containing name and description."
    ));
  }

  const standardName = stringValue(parsed.frontmatter.name);
  if (!standardName) {
    issues.push(markdownIssue(context, "error", "missing-name", "Skill frontmatter must include a name field."));
  } else if (!OFFICIAL_SKILL_NAME_PATTERN.test(standardName)) {
    issues.push(markdownIssue(
      context,
      "error",
      "invalid-name",
      "Skill name must be 1-64 lowercase letters, numbers, and hyphens, with no leading, trailing, or consecutive hyphens."
    ));
  } else if (input.skillDirName && standardName !== input.skillDirName) {
    issues.push(markdownIssue(
      context,
      "error",
      "name-directory-mismatch",
      `Skill name "${standardName}" must match its parent directory "${input.skillDirName}".`
    ));
  }

  addDescriptionIssues(context, parsed.frontmatter.description, issues);
  addFrontmatterIssues(context, parsed.frontmatter, frontmatterKeys, issues);

  return issues;
}

function addDescriptionIssues(
  context: Pick<ValidationIssue, "path" | "skillId" | "assetId">,
  rawDescription: unknown,
  issues: ValidationIssue[]
): void {
  const description = stringValue(rawDescription);
  if (!description) {
    issues.push(markdownIssue(context, "error", "missing-description", "Skill frontmatter must include a description field."));
  } else if (description.length > 1024) {
    issues.push(markdownIssue(context, "error", "description-too-long", "Skill description must be 1024 characters or fewer."));
  }
}

function addFrontmatterIssues(
  context: Pick<ValidationIssue, "path" | "skillId" | "assetId">,
  frontmatter: Record<string, unknown>,
  frontmatterKeys: string[],
  issues: ValidationIssue[]
): void {
  for (const key of frontmatterKeys) {
    if (!STANDARD_FRONTMATTER_KEYS.has(key)) {
      issues.push(markdownIssue(
        context,
        "warning",
        "non-standard-frontmatter-field",
        `Frontmatter field "${key}" is not part of the Agent Skills spec and may be ignored by other runtimes.`
      ));
    }
  }

  if (Object.hasOwn(frontmatter, "license") && typeof frontmatter.license !== "string") {
    issues.push(markdownIssue(context, "error", "invalid-license", "Skill license must be a string if provided."));
  }

  if (Object.hasOwn(frontmatter, "compatibility")) {
    const compatibility = stringValue(frontmatter.compatibility);
    if (!compatibility) {
      issues.push(markdownIssue(context, "error", "invalid-compatibility", "Skill compatibility must be a non-empty string if provided."));
    } else if (compatibility.length > 500) {
      issues.push(markdownIssue(context, "error", "compatibility-too-long", "Skill compatibility must be 500 characters or fewer."));
    }
  }

  if (
    Object.hasOwn(frontmatter, "metadata") &&
    !isStringMetadataMap(frontmatter.metadata)
  ) {
    issues.push(markdownIssue(context, "error", "invalid-metadata", "Skill metadata must be a mapping from string keys to string values."));
  }

  if (
    Object.hasOwn(frontmatter, "allowed-tools") &&
    !stringValue(frontmatter["allowed-tools"])
  ) {
    issues.push(markdownIssue(context, "error", "invalid-allowed-tools", "Skill allowed-tools must be a non-empty space-separated string if provided."));
  }
}

function isStringMetadataMap(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || Array.isArray(value) || value === null) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function markdownIssue(
  context: Pick<ValidationIssue, "path" | "skillId" | "assetId">,
  severity: ValidationIssue["severity"],
  code: string,
  message: string
): ValidationIssue {
  return {
    severity,
    code,
    message,
    path: context.path,
    skillId: context.skillId,
    assetId: context.assetId
  };
}
