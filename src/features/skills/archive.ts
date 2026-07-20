import path from "node:path";
import JSZip, { type JSZipObject } from "jszip";

import {
  contentHash,
  parseMarkdown,
  slugify,
  stringValue
} from "../../shared/markdown.js";
import {
  SKILL_FILES_CHECKSUM_ALGORITHM,
  type AssetHealth,
  type SkillImportCandidate,
  type StoredObject
} from "../../shared/types.js";
export { SKILL_FILES_CHECKSUM_ALGORITHM } from "../../shared/types.js";
import { displayNameFromSkillFrontmatter } from "./utils.js";
import { validateSkillMarkdown } from "./validation.js";

const MAX_ARCHIVE_FILES = 1000;
const MAX_ARCHIVE_UNPACKED_BYTES = 50 * 1024 * 1024;
const MAX_LEGACY_CHECKSUM_ORDERS = 1024;
const ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");
// Node 20 full-ICU base locales plus script/region variants whose default collation can differ.
// Unversioned checksums were produced with String.localeCompare, so migration has to recognize
// the producer's locale rather than assume the upgraded server's current locale.
const LEGACY_CHECKSUM_LOCALES = Intl.Collator.supportedLocalesOf([
  new Intl.Collator().resolvedOptions().locale,
  "af", "am", "ar", "as", "az", "be", "bg", "bn", "bo", "br", "bs", "ca", "cs", "cy",
  "da", "de", "dz", "ee", "el", "en", "eo", "es", "et", "fa", "ff", "fi", "fo", "fr",
  "fy", "ga", "gl", "gu", "ha", "he", "hi", "hr", "hu", "hy", "id", "ig", "is", "it",
  "ja", "yi", "ka", "kk", "kl", "km", "kn", "ko", "ku", "ky", "lb", "ln", "lo", "lt",
  "lv", "mk", "ml", "mn", "ro", "mr", "ms", "mt", "my", "nb", "ne", "nl", "nn", "no",
  "om", "or", "pa", "pl", "ps", "pt", "ru", "sa", "se", "si", "sk", "sl", "sq", "sr",
  "st", "sv", "sw", "ta", "te", "th", "tk", "fil", "tn", "to", "tr", "ug", "uk", "ur",
  "uz", "vi", "wo", "xh", "yo", "zh", "zu", "blo", "ceb", "chr", "dsb", "kok", "haw",
  "hsb", "lij", "lkt", "nso", "smn", "wae", "az-Cyrl", "az-Latn", "bs-Cyrl", "bs-Latn",
  "ha-Arab", "ku-Arab", "mn-Mong", "pa-Arab", "pa-Guru", "sr-Cyrl", "sr-Latn", "uz-Cyrl",
  "uz-Latn", "zh-CN", "zh-Hans", "zh-Hant", "zh-HK", "zh-TW"
]);

export interface SkillPackageFile {
  path: string;
  content: Buffer;
}

export interface DiscoveredSkill extends SkillImportCandidate {
  checksum: string;
  files: SkillPackageFile[];
}

export interface ValidatedSkillArchive {
  buffer: Buffer;
  checksum: string;
}

/**
 * Scan an arbitrary source zip and extract each directory containing SKILL.md
 * as an independent Skill. A parent candidate never absorbs a nested Skill.
 */
export async function discoverSkillsInArchive(buffer: Buffer): Promise<DiscoveredSkill[]> {
  if (buffer.byteLength === 0) throw new Error("Zip file is empty.");

  const zip = await JSZip.loadAsync(buffer);
  await JSZip.loadAsync(buffer, { checkCRC32: true });
  const entries = Object.values(zip.files);
  validateArchiveEntries(entries);

  const sourceFiles = await readSourceFiles(entries);
  const skillPaths = sourceFiles
    .filter((file) => path.posix.basename(file.path) === "SKILL.md")
    .map((file) => file.path)
    .sort((left, right) => left.localeCompare(right));

  if (skillPaths.length === 0) {
    throw new Error("No SKILL.md files were found in this zip.");
  }

  const roots = skillPaths.map((skillPath) => rootPathForSkill(skillPath));
  return skillPaths.map((skillPath, index) => {
    const rootPath = roots[index] ?? ".";
    const files = sourceFiles
      .filter((file) => fileBelongsToCandidate(file.path, rootPath, roots))
      .map((file) => ({
        path: relativeCandidatePath(file.path, rootPath),
        content: file.content
      }))
      .sort((left, right) => left.path.localeCompare(right.path));

    return analyzeSkillFiles(files, { skillPath, rootPath });
  });
}

/** Analyze a canonical, already separated Skill file tree. */
export function analyzeStoredSkillFiles(files: SkillPackageFile[]): DiscoveredSkill {
  validateCanonicalFiles(files);
  return analyzeSkillFiles(
    files.slice().sort((left, right) => left.path.localeCompare(right.path)),
    { skillPath: "SKILL.md", rootPath: "." }
  );
}

/** Build a deterministic standards-compliant archive with SKILL.md at its root. */
export async function packageSkillFiles(files: SkillPackageFile[]): Promise<ValidatedSkillArchive> {
  validateCanonicalFiles(files);
  const zip = new JSZip();

  for (const file of files.slice().sort((left, right) => compareCanonicalPaths(left.path, right.path))) {
    zip.file(file.path, file.content, {
      createFolders: false,
      date: ZIP_DATE,
      unixPermissions: file.path.endsWith(".sh") ? 0o100755 : 0o100644
    });
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "UNIX"
  });
  return { buffer, checksum: contentHash(buffer) };
}

/** Validate a generated/public archive contract without rewriting it. */
export async function validateSkillArchive(buffer: Buffer): Promise<ValidatedSkillArchive> {
  const candidates = await discoverSkillsInArchive(buffer);
  if (
    candidates.length !== 1 ||
    candidates[0]?.skillPath !== "SKILL.md" ||
    candidates[0]?.rootPath !== "."
  ) {
    throw new Error("Skill zip must contain exactly one SKILL.md file at the archive root.");
  }
  return { buffer, checksum: contentHash(buffer) };
}

export function skillFilesChecksum(files: SkillPackageFile[]): string {
  return orderedSkillFilesChecksum(files, compareCanonicalPaths);
}

/** Reproduce the unversioned checksum for an in-place upgrade on the same runtime locale. */
export function legacySkillFilesChecksum(files: SkillPackageFile[], locale?: string): string {
  return orderedSkillFilesChecksum(files, (left, right) => left.localeCompare(right, locale));
}

/**
 * Validate stored content and return its canonical v2 checksum. Unversioned records may use
 * either the runtime's former default locale or the briefly shipped fixed-English ordering.
 */
export function canonicalSkillFilesChecksumForStorage(
  files: SkillPackageFile[],
  storage: Pick<StoredObject, "checksum" | "checksumAlgorithm">
): string | undefined {
  const entries = skillChecksumEntries(files);
  const canonical = orderedSkillEntriesChecksum(entries, compareCanonicalPaths);
  if (storage.checksumAlgorithm === SKILL_FILES_CHECKSUM_ALGORITHM) {
    return storage.checksum === canonical ? canonical : undefined;
  }
  if (storage.checksumAlgorithm !== undefined) return undefined;

  if (storage.checksum === canonical) return canonical;
  return legacySkillChecksumMatches(entries, storage.checksum) ? canonical : undefined;
}

function orderedSkillFilesChecksum(
  files: SkillPackageFile[],
  comparePaths: (left: string, right: string) => number
): string {
  return orderedSkillEntriesChecksum(skillChecksumEntries(files), comparePaths);
}

function skillChecksumEntries(files: SkillPackageFile[]): Array<{ path: string; manifest: string }> {
  return files.map((file) => ({
    path: file.path,
    manifest: `${Buffer.byteLength(file.path)}:${file.path}:${file.content.byteLength}:${contentHash(file.content)}`
  }));
}

function orderedSkillEntriesChecksum(
  entries: Array<{ path: string; manifest: string }>,
  comparePaths: (left: string, right: string) => number
): string {
  return skillEntriesChecksumInOrder(
    entries.slice().sort((left, right) => comparePaths(left.path, right.path))
  );
}

function skillEntriesChecksumInOrder(entries: Array<{ path: string; manifest: string }>): string {
  return contentHash(entries.map((entry) => entry.manifest).join("\n"));
}

function legacySkillChecksumMatches(
  entries: Array<{ path: string; manifest: string }>,
  expected: string
): boolean {
  const indexes = new Map(entries.map((entry, index) => [entry.path, index]));
  const seenOrders = new Set<string>();
  let attempts = 0;
  const matches = (ordered: Array<{ path: string; manifest: string }>): boolean => {
    const signature = ordered.map((entry) => indexes.get(entry.path)).join(",");
    if (seenOrders.has(signature)) return false;
    if (attempts >= MAX_LEGACY_CHECKSUM_ORDERS) return false;
    seenOrders.add(signature);
    attempts += 1;
    return skillEntriesChecksumInOrder(ordered) === expected;
  };

  for (const locale of LEGACY_CHECKSUM_LOCALES) {
    if (attempts >= MAX_LEGACY_CHECKSUM_ORDERS) break;
    const compare = (left: string, right: string): number => left.localeCompare(right, locale);
    const sorted = entries.slice().sort((left, right) => compare(left.path, right.path));
    const groups: Array<Array<{ path: string; manifest: string }>> = [];
    for (const entry of sorted) {
      const group = groups.at(-1);
      if (group && compare(group[0]?.path ?? "", entry.path) === 0) group.push(entry);
      else groups.push([entry]);
    }

    const remaining = MAX_LEGACY_CHECKSUM_ORDERS - attempts;
    if (legacyOrderCount(groups, remaining) <= remaining) {
      for (const ordered of combineLegacyGroups(groups)) {
        if (matches(ordered)) return true;
      }
      continue;
    }

    // Pathological tie groups are bounded to keep untrusted legacy manifests from causing a DoS.
    // Check the observed stable order and deterministic tie-breaks, then fail closed if none match.
    if (matches(sorted)) return true;
    const canonicalTies = groups.flatMap((group) =>
      group.slice().sort((left, right) => compareCanonicalPaths(left.path, right.path))
    );
    if (matches(canonicalTies)) return true;
    const reverseTies = groups.flatMap((group) =>
      group.slice().sort((left, right) => compareCanonicalPaths(right.path, left.path))
    );
    if (matches(reverseTies)) return true;
  }
  return false;
}

function legacyOrderCount<T>(groups: T[][], limit: number): number {
  let count = 1;
  for (const group of groups) {
    for (let factor = 2; factor <= group.length; factor += 1) {
      if (count > Math.floor(limit / factor)) return limit + 1;
      count *= factor;
    }
  }
  return count;
}

function* combineLegacyGroups<T>(groups: T[][], index = 0, prefix: T[] = []): Generator<T[]> {
  if (index >= groups.length) {
    yield prefix;
    return;
  }
  for (const permutation of permutations(groups[index] ?? [])) {
    yield* combineLegacyGroups(groups, index + 1, [...prefix, ...permutation]);
  }
}

function* permutations<T>(items: T[]): Generator<T[]> {
  const values = items.slice();
  function* visit(index: number): Generator<T[]> {
    if (index >= values.length) {
      yield values.slice();
      return;
    }
    for (let candidate = index; candidate < values.length; candidate += 1) {
      [values[index], values[candidate]] = [values[candidate] as T, values[index] as T];
      yield* visit(index + 1);
      [values[index], values[candidate]] = [values[candidate] as T, values[index] as T];
    }
  }
  yield* visit(0);
}

function compareCanonicalPaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function analyzeSkillFiles(
  files: SkillPackageFile[],
  source: { skillPath: string; rootPath: string }
): DiscoveredSkill {
  const skillFile = files.find((file) => file.path === "SKILL.md");
  if (!skillFile) throw new Error(`Skill candidate ${source.skillPath} has no root SKILL.md.`);

  const markdown = skillFile.content.toString("utf8");
  const parsed = parseMarkdown(markdown);
  const fallbackName = slugify(
    source.rootPath === "." ? "uploaded-skill" : path.posix.basename(source.rootPath)
  ) || "uploaded-skill";
  const name = stringValue(parsed.frontmatter.name) ?? fallbackName;
  const issues = validateSkillMarkdown({
    content: markdown,
    path: `zip:${source.skillPath}`
  });
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const health: AssetHealth = errors > 0 ? "error" : warnings > 0 ? "warning" : "valid";

  return {
    ...source,
    name,
    displayName: displayNameFromSkillFrontmatter({
      frontmatter: parsed.frontmatter,
      title: parsed.title,
      slug: name
    }),
    description:
      stringValue(parsed.frontmatter.description) ||
      parsed.description ||
      "Imported skill asset.",
    health,
    validation: { errors, warnings },
    validationIssues: issues,
    fileCount: files.length,
    size: files.reduce((total, file) => total + file.content.byteLength, 0),
    checksum: skillFilesChecksum(files),
    files
  };
}

function validateArchiveEntries(entries: JSZipObject[]): void {
  const files = entries.filter((entry) => !entry.dir && !isSystemZipEntry(entry.name));
  if (files.length > MAX_ARCHIVE_FILES) {
    throw new Error(`Zip must contain at most ${MAX_ARCHIVE_FILES} files.`);
  }

  let declaredBytes = 0;
  for (const entry of entries) {
    const originalName = unsafeOriginalName(entry) ?? entry.name;
    if (isUnsafeArchivePath(originalName)) {
      throw new Error(`Zip contains an unsafe path: ${originalName}`);
    }
    if (isZipLink(entry)) {
      throw new Error(`Zip must not contain links: ${originalName}`);
    }
    if (!entry.dir) {
      declaredBytes += uncompressedSize(entry);
      if (declaredBytes > MAX_ARCHIVE_UNPACKED_BYTES) {
        throw new Error("Zip exceeds the 50 MB unpacked size limit.");
      }
    }
  }
}

async function readSourceFiles(entries: JSZipObject[]): Promise<SkillPackageFile[]> {
  const files: SkillPackageFile[] = [];
  let unpackedBytes = 0;

  for (const entry of entries) {
    if (entry.dir || isSystemZipEntry(entry.name)) continue;
    const content = await entry.async("nodebuffer");
    unpackedBytes += content.byteLength;
    if (unpackedBytes > MAX_ARCHIVE_UNPACKED_BYTES) {
      throw new Error("Zip exceeds the 50 MB unpacked size limit.");
    }
    files.push({ path: entry.name, content });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function validateCanonicalFiles(files: SkillPackageFile[]): void {
  if (files.length === 0) throw new Error("Stored Skill has no files.");
  if (files.length > MAX_ARCHIVE_FILES) {
    throw new Error(`Stored Skill must contain at most ${MAX_ARCHIVE_FILES} files.`);
  }

  const seen = new Set<string>();
  let size = 0;
  for (const file of files) {
    if (isUnsafeArchivePath(file.path) || file.path.endsWith("/")) {
      throw new Error(`Stored Skill contains an unsafe path: ${file.path}`);
    }
    if (seen.has(file.path)) throw new Error(`Stored Skill contains duplicate path: ${file.path}`);
    seen.add(file.path);
    size += file.content.byteLength;
  }

  if (size > MAX_ARCHIVE_UNPACKED_BYTES) {
    throw new Error("Stored Skill exceeds the 50 MB unpacked size limit.");
  }
  if (!seen.has("SKILL.md")) throw new Error("Stored Skill must contain SKILL.md at its root.");
  if (Array.from(seen).some((filePath) => filePath !== "SKILL.md" && filePath.endsWith("/SKILL.md"))) {
    throw new Error("Stored Skill must not contain another nested SKILL.md.");
  }
}

function fileBelongsToCandidate(filePath: string, rootPath: string, allRoots: string[]): boolean {
  if (!isWithinRoot(filePath, rootPath)) return false;
  return !allRoots.some(
    (otherRoot) =>
      otherRoot !== rootPath &&
      isNestedRoot(otherRoot, rootPath) &&
      isWithinRoot(filePath, otherRoot)
  );
}

function isWithinRoot(filePath: string, rootPath: string): boolean {
  return rootPath === "." || filePath.startsWith(`${rootPath}/`);
}

function isNestedRoot(candidate: string, parent: string): boolean {
  return parent === "." ? candidate !== "." : candidate.startsWith(`${parent}/`);
}

function relativeCandidatePath(filePath: string, rootPath: string): string {
  return rootPath === "." ? filePath : filePath.slice(rootPath.length + 1);
}

function rootPathForSkill(skillPath: string): string {
  const root = path.posix.dirname(skillPath);
  return root && root !== "." ? root : ".";
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

function isSystemZipEntry(entryName: string): boolean {
  return (
    entryName === ".DS_Store" ||
    entryName.endsWith("/.DS_Store") ||
    entryName.startsWith("__MACOSX/")
  );
}
