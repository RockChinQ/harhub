import JSZip, { type JSZipObject } from "jszip";

import { contentHash } from "../../shared/markdown.js";

const MAX_ARCHIVE_FILES = 1000;
const MAX_ARCHIVE_UNPACKED_BYTES = 50 * 1024 * 1024;

export interface ValidatedSkillArchive {
  buffer: Buffer;
  checksum: string;
}

/** Validate the Agent Skills discovery archive contract without rewriting it. */
export async function validateSkillArchive(buffer: Buffer): Promise<ValidatedSkillArchive> {
  if (buffer.byteLength === 0) throw new Error("Skill zip is empty.");

  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  const files = entries.filter((entry) => !entry.dir);

  if (files.length > MAX_ARCHIVE_FILES) {
    throw new Error(`Skill zip must contain at most ${MAX_ARCHIVE_FILES} files.`);
  }

  let unpackedBytes = 0;
  for (const entry of entries) {
    const originalName = unsafeOriginalName(entry) ?? entry.name;
    if (isUnsafeArchivePath(originalName)) {
      throw new Error(`Skill zip contains an unsafe path: ${originalName}`);
    }
    if (isZipLink(entry)) {
      throw new Error(`Skill zip must not contain links: ${originalName}`);
    }
    if (!entry.dir) {
      unpackedBytes += uncompressedSize(entry);
      if (unpackedBytes > MAX_ARCHIVE_UNPACKED_BYTES) {
        throw new Error("Skill zip exceeds the 50 MB unpacked size limit.");
      }
    }
  }

  const rootSkillFiles = files.filter((entry) => entry.name === "SKILL.md");
  const nestedSkillFiles = files.filter(
    (entry) => entry.name !== "SKILL.md" && entry.name.endsWith("/SKILL.md")
  );
  if (rootSkillFiles.length !== 1 || nestedSkillFiles.length > 0) {
    throw new Error("Skill zip must contain exactly one SKILL.md file at the archive root.");
  }

  await JSZip.loadAsync(buffer, { checkCRC32: true });
  return { buffer, checksum: contentHash(buffer) };
}

function unsafeOriginalName(entry: JSZipObject): string | undefined {
  return (entry as JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName;
}

function uncompressedSize(entry: JSZipObject): number {
  return (entry as JSZipObject & { _data?: { uncompressedSize?: number } })
    ._data?.uncompressedSize ?? 0;
}

function isZipLink(entry: JSZipObject): boolean {
  const rawMode = entry.unixPermissions;
  const mode = typeof rawMode === "string" ? Number.parseInt(rawMode, 8) : rawMode;
  return typeof mode === "number" && (mode & 0o170000) === 0o120000;
}

function isUnsafeArchivePath(entryName: string): boolean {
  const parts = entryName.replace(/\\/g, "/").split("/");
  return (
    !entryName ||
    entryName.startsWith("/") ||
    entryName.startsWith("\\") ||
    /^[A-Za-z]:/.test(entryName) ||
    entryName.includes("\0") ||
    entryName.includes("\\") ||
    parts.includes("..") ||
    parts.includes(".")
  );
}
