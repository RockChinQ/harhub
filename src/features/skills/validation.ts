import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseMarkdown, stringValue } from "../../shared/markdown.js";
import type { SkillRecord, ValidationIssue } from "../../shared/types.js";
import {
  OFFICIAL_SKILL_NAME_PATTERN,
  RESERVED_SKILL_NAME_WORDS,
  SECRET_PATTERNS,
  STANDARD_FRONTMATTER_KEYS,
  XML_TAG_PATTERN
} from "./constants.js";

export interface SkillMarkdownValidationInput {
  content: string;
  path?: string;
  skillId?: string;
  assetId?: string;
  skillDirName?: string;
  linkExists?: (link: string) => boolean;
}

export function validateSkills(records: SkillRecord[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, string>();

  if (records.length === 0) {
    issues.push({
      severity: "error",
      code: "no-skills-found",
      message: "No SKILL.md files were found in the provided paths."
    });
  }

  for (const record of records) {
    issues.push(...validateSkillRecord(record, ids));
  }

  return issues;
}

function validateSkillRecord(
  record: SkillRecord,
  ids: Map<string, string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const content = readFileSync(record.source.absolutePath, "utf8");
  const skillDirName = path.basename(path.dirname(record.source.absolutePath));

  if (ids.has(record.id)) {
    issues.push(issue(record, "error", "duplicate-skill-id", `Duplicate skill id "${record.id}".`));
  }
  ids.set(record.id, record.source.absolutePath);

  issues.push(...validateSkillMarkdown({
    content,
    path: record.source.absolutePath,
    skillId: record.id,
    skillDirName,
    linkExists: (link) => localLinkExists(record.source.absolutePath, link)
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
  } else if (hasReservedNameWord(standardName)) {
    issues.push(markdownIssue(
      context,
      "warning",
      "reserved-name",
      'Skill name contains "anthropic" or "claude", which can be rejected by some Claude Platform upload surfaces.'
    ));
  } else if (XML_TAG_PATTERN.test(standardName)) {
    issues.push(markdownIssue(context, "error", "name-contains-xml", "Skill name must not contain XML tags."));
  } else if (input.skillDirName && standardName !== input.skillDirName) {
    issues.push(markdownIssue(
      context,
      "warning",
      "name-directory-mismatch",
      `Skill name "${standardName}" should match its parent directory "${input.skillDirName}".`
    ));
  }

  addDescriptionIssues(context, parsed.frontmatter.description, issues);
  addFrontmatterIssues(context, parsed.frontmatter, frontmatterKeys, issues);
  addBodyIssues(context, parsed.headings, input.content, issues);

  for (const broken of findBrokenLocalLinks(input.content, input.linkExists)) {
    issues.push(markdownIssue(context, "error", "broken-local-link", `Referenced local path does not exist: ${broken}`));
  }

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
  } else if (XML_TAG_PATTERN.test(description)) {
    issues.push(markdownIssue(context, "error", "description-contains-xml", "Skill description must not contain XML tags."));
  } else if (description.length < 24) {
    issues.push(markdownIssue(
      context,
      "warning",
      "thin-description",
      "Skill description should clearly explain what the skill does and when to use it."
    ));
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
        "non-standard-frontmatter",
        `Frontmatter field "${key}" is non-standard for this MVP.`
      ));
    }
  }

  if (
    Object.hasOwn(frontmatter, "compatibility") &&
    typeof frontmatter.compatibility === "string" &&
    frontmatter.compatibility.length > 500
  ) {
    issues.push(markdownIssue(context, "warning", "compatibility-too-long", "Skill compatibility should be 500 characters or fewer."));
  }

  if (
    Object.hasOwn(frontmatter, "metadata") &&
    (typeof frontmatter.metadata !== "object" || Array.isArray(frontmatter.metadata) || frontmatter.metadata === null)
  ) {
    issues.push(markdownIssue(context, "warning", "invalid-metadata", "Skill metadata should be a YAML mapping."));
  }

  if (
    Object.hasOwn(frontmatter, "allowed-tools") &&
    typeof frontmatter["allowed-tools"] !== "string"
  ) {
    issues.push(markdownIssue(context, "warning", "invalid-allowed-tools", "Skill allowed-tools should be a space-separated string."));
  }
}

function addBodyIssues(
  context: Pick<ValidationIssue, "path" | "skillId" | "assetId">,
  headings: string[],
  content: string,
  issues: ValidationIssue[]
): void {
  if (!headings[0]) {
    issues.push(markdownIssue(context, "warning", "missing-title", "Skill body should have an H1 title for human readers."));
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(markdownIssue(context, "error", "possible-secret", "Skill content appears to contain a secret or credential."));
    }
  }
}

function findBrokenLocalLinks(
  content: string,
  linkExists: SkillMarkdownValidationInput["linkExists"]
): string[] {
  if (!linkExists) return [];
  const parsed = parseMarkdown(content);
  const broken: string[] = [];

  for (const link of parsed.links) {
    if (!link || link.startsWith("#") || /^[a-z]+:\/\//i.test(link) || link.startsWith("mailto:")) {
      continue;
    }

    const cleanLink = link.split("#")[0]?.trim();
    if (!cleanLink) continue;

    if (!linkExists(decodeURIComponent(cleanLink))) {
      broken.push(cleanLink);
    }
  }

  return broken;
}

function localLinkExists(skillPath: string, link: string): boolean {
  const skillDir = path.dirname(skillPath);
  const target = path.resolve(skillDir, link);
  return existsSync(target);
}

function hasReservedNameWord(value: string): boolean {
  return RESERVED_SKILL_NAME_WORDS.some((word) => value.includes(word));
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

function issue(
  record: SkillRecord,
  severity: ValidationIssue["severity"],
  code: string,
  message: string
): ValidationIssue {
  return {
    severity,
    code,
    message,
    path: record.source.absolutePath,
    skillId: record.id
  };
}
