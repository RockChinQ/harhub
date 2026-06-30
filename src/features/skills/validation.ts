import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseMarkdown, stringValue } from "../../shared/markdown.js";
import type { SkillRecord, ValidationIssue } from "../../shared/types.js";
import {
  OFFICIAL_SKILL_NAME_PATTERN,
  SECRET_PATTERNS,
  STANDARD_FRONTMATTER_KEYS
} from "./constants.js";

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
  const parsed = parseMarkdown(content);
  const skillDirName = path.basename(path.dirname(record.source.absolutePath));
  const frontmatterKeys = Object.keys(parsed.frontmatter);

  if (ids.has(record.id)) {
    issues.push(issue(record, "error", "duplicate-skill-id", `Duplicate skill id "${record.id}".`));
  }
  ids.set(record.id, record.source.absolutePath);

  if (!parsed.hasFrontmatter) {
    issues.push(issue(
      record,
      "error",
      "missing-frontmatter",
      parsed.frontmatterError ??
        "SKILL.md must start with YAML frontmatter containing name and description."
    ));
  }

  const standardName = stringValue(parsed.frontmatter.name);
  if (!standardName) {
    issues.push(issue(record, "error", "missing-name", "Skill frontmatter must include a name field."));
  } else if (!OFFICIAL_SKILL_NAME_PATTERN.test(standardName)) {
    issues.push(issue(
      record,
      "error",
      "invalid-name",
      "Skill name must be a lowercase slug with only letters, numbers, and hyphens, up to 64 characters."
    ));
  } else if (standardName !== skillDirName) {
    issues.push(issue(
      record,
      "warning",
      "name-directory-mismatch",
      `Skill name "${standardName}" should match its parent directory "${skillDirName}".`
    ));
  }

  addDescriptionIssues(record, stringValue(parsed.frontmatter.description), issues);
  addFrontmatterIssues(record, frontmatterKeys, issues);
  addBodyIssues(record, content, issues);
  return issues;
}

function addDescriptionIssues(
  record: SkillRecord,
  description: string | undefined,
  issues: ValidationIssue[]
): void {
  if (!description) {
    issues.push(issue(record, "error", "missing-description", "Skill frontmatter must include a description field."));
  } else if (description.length > 1024) {
    issues.push(issue(record, "error", "description-too-long", "Skill description must be 1024 characters or fewer."));
  } else if (description.length < 24) {
    issues.push(issue(
      record,
      "warning",
      "thin-description",
      "Skill description should clearly explain what the skill does and when to use it."
    ));
  }
}

function addFrontmatterIssues(
  record: SkillRecord,
  frontmatterKeys: string[],
  issues: ValidationIssue[]
): void {
  for (const key of frontmatterKeys) {
    if (!STANDARD_FRONTMATTER_KEYS.has(key)) {
      issues.push(issue(
        record,
        "warning",
        "non-standard-frontmatter",
        `Frontmatter field "${key}" is Harhub-specific or non-standard; prefer harhub.yaml for registry metadata.`
      ));
    }
  }
}

function addBodyIssues(
  record: SkillRecord,
  content: string,
  issues: ValidationIssue[]
): void {
  if (!record.headings[0]) {
    issues.push(issue(record, "warning", "missing-title", "Skill body should have an H1 title for human readers."));
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(issue(record, "error", "possible-secret", "Skill content appears to contain a secret or credential."));
    }
  }

  for (const broken of findBrokenLocalLinks(record.source.absolutePath, content)) {
    issues.push(issue(record, "error", "broken-local-link", `Referenced local path does not exist: ${broken}`));
  }
}

function findBrokenLocalLinks(skillPath: string, content: string): string[] {
  const parsed = parseMarkdown(content);
  const skillDir = path.dirname(skillPath);
  const broken: string[] = [];

  for (const link of parsed.links) {
    if (!link || link.startsWith("#") || /^[a-z]+:\/\//i.test(link) || link.startsWith("mailto:")) {
      continue;
    }

    const cleanLink = link.split("#")[0]?.trim();
    if (!cleanLink) continue;

    const target = path.resolve(skillDir, decodeURIComponent(cleanLink));
    if (!existsSync(target)) {
      broken.push(cleanLink);
    }
  }

  return broken;
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
