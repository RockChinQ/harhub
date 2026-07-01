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
import { validateSkillMarkdown } from "../skills/validation.js";

export async function createUploadedSkillAsset(input: {
  workspaceId: string;
  fileName: string;
  buffer: Buffer;
  storage: StoredObject;
  name?: string;
  description?: string;
  owner?: string;
  tags?: string[];
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
      skillDirName: skillEntryDirName(skillEntry.name),
      linkExists: (link) => zipLinkExists(zip, skillEntry.name, link)
    })
  ];
  const errors = validationIssues.filter((issue) => issue.severity === "error").length;
  const warnings = validationIssues.filter((issue) => issue.severity === "warning").length;

  if (errors > 0 && input.rejectInvalid !== false) {
    throw new Error(uploadValidationError(validationIssues));
  }

  const now = new Date().toISOString();

  return {
    id: assetId,
    kind: "skill",
    name,
    displayName: parsed.title ?? titleFromSlug(name),
    slug: name,
    description:
      input.description?.trim() ||
      stringValue(parsed.frontmatter.description) ||
      parsed.description ||
      "Uploaded skill asset.",
    owner: input.owner?.trim() || undefined,
    packageName: "uploaded-skills",
    lifecycleState: "experimental",
    health: errors > 0 ? "error" : warnings > 0 ? "warning" : "valid",
    tags: unique(input.tags ?? []),
    contentHash: zipHash,
    storage: input.storage,
    validation: {
      errors,
      warnings
    },
    validationIssues,
    metadata: {
      skillEntry: skillEntry.name,
      zipEntries: entries.filter((entry) => !entry.dir).length,
      scripts: countZipEntries(zip, "scripts/"),
      references: countZipEntries(zip, "references/"),
      assets: countZipEntries(zip, "assets/"),
      headings: parsed.headings
    },
    discoveredAt: now,
    updatedAt: now
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
    tags: []
  });
}

function countZipEntries(zip: JSZip, pathPart: string): number {
  return Object.values(zip.files).filter((entry) => !entry.dir && entry.name.includes(pathPart)).length;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
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

function zipLinkExists(zip: JSZip, skillEntryName: string, link: string): boolean {
  const skillDir = path.posix.dirname(skillEntryName);
  const base = !skillDir || skillDir === "." ? "" : skillDir;
  const target = path.posix.normalize(path.posix.join(base, link));
  const normalized = target.replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("../") || normalized === "..") return false;

  return Object.values(zip.files).some(
    (entry) => entry.name === normalized || entry.name.startsWith(`${normalized.replace(/\/+$/g, "")}/`)
  );
}

function uploadValidationError(issues: ValidationIssue[]): string {
  const firstError = issues.find((issue) => issue.severity === "error");
  return firstError
    ? `Skill package validation failed: ${firstError.code}: ${firstError.message}`
    : "Skill package validation failed.";
}
