import path from "node:path";
import JSZip from "jszip";
import {
  contentHash,
  parseMarkdown,
  slugify,
  stringValue
} from "../../shared/markdown.js";
import type {
  AssetRecord,
  StoredObject
} from "../../shared/types.js";

export async function createUploadedSkillAsset(input: {
  workspaceId: string;
  fileName: string;
  buffer: Buffer;
  storage: StoredObject;
  name?: string;
  description?: string;
  owner?: string;
  tags?: string[];
}): Promise<AssetRecord> {
  if (!input.fileName.toLowerCase().endsWith(".zip")) {
    throw new Error("Only .zip skill uploads are supported.");
  }

  if (input.buffer.byteLength === 0) {
    throw new Error("Uploaded skill zip is empty.");
  }

  const zip = await JSZip.loadAsync(input.buffer);
  const skillEntry = Object.values(zip.files).find(
    (entry) => !entry.dir && entry.name.split("/").pop() === "SKILL.md"
  );

  if (!skillEntry) {
    throw new Error("Skill zip must contain a SKILL.md file.");
  }

  const skillMarkdown = await skillEntry.async("string");
  const parsed = parseMarkdown(skillMarkdown);
  const zipHash = contentHash(input.buffer);
  const name =
    slugify(input.name ?? "") ||
    stringValue(parsed.frontmatter.name) ||
    slugify(path.basename(input.fileName, path.extname(input.fileName))) ||
    `uploaded-${zipHash.slice(0, 8)}`;
  const now = new Date().toISOString();

  return {
    id: `asset:skill:${input.workspaceId}:${name}`,
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
    health: "valid",
    tags: unique(input.tags ?? []),
    contentHash: zipHash,
    storage: input.storage,
    validation: {
      errors: 0,
      warnings: parsed.hasFrontmatter ? 0 : 1
    },
    metadata: {
      skillEntry: skillEntry.name,
      zipEntries: Object.values(zip.files).filter((entry) => !entry.dir).length,
      scripts: countZipEntries(zip, "scripts/"),
      references: countZipEntries(zip, "references/"),
      assets: countZipEntries(zip, "assets/"),
      headings: parsed.headings
    },
    discoveredAt: now,
    updatedAt: now
  };
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
