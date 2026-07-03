import path from "node:path";
import JSZip, { type JSZipObject } from "jszip";
import {
  contentHash,
  parseMarkdown,
  slugify,
  stringValue
} from "../../shared/markdown.js";
import type {
  AssetRecord,
  StoredObject,
  ValidationIssue
} from "../../shared/types.js";
import { displayNameFromSkillFrontmatter } from "../skills/utils.js";
import { validateSkillMarkdown } from "../skills/validation.js";

export async function createUploadedSkillAsset(input: {
  workspaceId: string;
  fileName: string;
  buffer: Buffer;
  storage: StoredObject;
  name?: string;
  rejectInvalid?: boolean;
}): Promise<AssetRecord> {
  if (!input.fileName.toLowerCase().endsWith(".zip")) {
    throw new Error("Only .zip skill uploads are supported.");
  }

  if (input.buffer.byteLength === 0) {
    throw new Error("Uploaded skill zip is empty.");
  }

  const zip = await JSZip.loadAsync(input.buffer);
  const entries = Object.values(zip.files);
  const packageIssues = validateZipStructure(entries);
  const skillEntries = entries.filter(
    (entry) => !entry.dir && entry.name.split("/").pop() === "SKILL.md"
  );
  const skillEntry = skillEntries[0];

  if (!skillEntry) {
    throw new Error("Skill zip must contain a SKILL.md file.");
  }

  const skillMarkdown = await skillEntry.async("string");
  const parsed = parseMarkdown(skillMarkdown);
  const zipHash = contentHash(input.buffer);
  const name =
    stringValue(parsed.frontmatter.name) ||
    slugify(input.name ?? "") ||
    slugify(path.basename(input.fileName, path.extname(input.fileName))) ||
    `uploaded-${zipHash.slice(0, 8)}`;
  const assetId = `asset:skill:${input.workspaceId}:${name}`;
  const validationIssues = [
    ...packageIssues.map((issue) => ({ ...issue, assetId })),
    ...validateSkillMarkdown({
      content: skillMarkdown,
      path: `zip:${skillEntry.name}`,
      assetId,
      skillDirName: skillEntryDirName(skillEntry.name)
    })
  ];
  const errors = validationIssues.filter((issue) => issue.severity === "error").length;
  const warnings = validationIssues.filter((issue) => issue.severity === "warning").length;

  if (errors > 0 && input.rejectInvalid !== false) {
    throw new Error(uploadValidationError(validationIssues));
  }

  return {
    id: assetId,
    kind: "skill",
    name,
    displayName: displayNameFromSkillFrontmatter({
      frontmatter: parsed.frontmatter,
      title: parsed.title,
      slug: name
    }),
    slug: name,
    description:
      stringValue(parsed.frontmatter.description) ||
      parsed.description ||
      "Uploaded skill asset.",
    health: errors > 0 ? "error" : warnings > 0 ? "warning" : "valid",
    storage: input.storage,
    validation: {
      errors,
      warnings
    },
    validationIssues
  };
}

export async function validateUploadedSkillZip(input: {
  workspaceId: string;
  fileName: string;
  buffer: Buffer;
  name?: string;
}): Promise<void> {
  await createUploadedSkillAsset({
    ...input,
    storage: {
      provider: "s3",
      bucket: "validation-only",
      key: "validation-only",
      size: input.buffer.byteLength,
      contentType: "application/zip",
      uploadedAt: new Date().toISOString(),
      originalName: input.fileName
    },
  });
}

function validateZipStructure(entries: JSZipObject[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const skillEntries = entries.filter(
    (entry) => !entry.dir && entry.name.split("/").pop() === "SKILL.md"
  );

  for (const entry of entries) {
    if (isUnsafeZipPath(entry.name)) {
      issues.push({
        severity: "error",
        code: "unsafe-zip-path",
        message: `Zip entry has an unsafe path: ${entry.name}`,
        path: `zip:${entry.name}`
      });
    }
  }

  if (skillEntries.length > 1) {
    issues.push({
      severity: "error",
      code: "multiple-skill-files",
      message: "Skill zip must contain exactly one SKILL.md file.",
      path: "zip:SKILL.md"
    });
  }

  return issues;
}

function isUnsafeZipPath(entryName: string): boolean {
  const parts = entryName.split("/");
  return (
    entryName.startsWith("/") ||
    /^[A-Za-z]:/.test(entryName) ||
    entryName.includes("\0") ||
    parts.includes("..")
  );
}

function skillEntryDirName(entryName: string): string | undefined {
  const dir = path.posix.dirname(entryName);
  if (!dir || dir === ".") return undefined;
  return path.posix.basename(dir);
}

function uploadValidationError(issues: ValidationIssue[]): string {
  const firstError = issues.find((issue) => issue.severity === "error");
  return firstError
    ? `Skill package validation failed: ${firstError.code}: ${firstError.message}`
    : "Skill package validation failed.";
}
