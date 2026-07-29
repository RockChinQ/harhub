import JSZip from "jszip";

import {
  analyzeStoredSkillFiles,
  canonicalSkillFilesChecksumForStorage,
  packageSkillFiles,
  type DiscoveredSkill,
  type SkillPackageFile
} from "../../features/skills/index.js";
import {
  analyzeMcpConfiguration,
  MCP_CONFIG_FILE_NAME,
  type AnalyzedMcpConfiguration
} from "../../features/mcp/index.js";
import { contentHash } from "../../shared/markdown.js";
import type { AssetRecord, StoredObject } from "../../shared/types.js";
import {
  readStoredAssetFiles,
  readStoredSkillFiles,
  type StoredAssetFile
} from "../../storage/index.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const archiveCache = new Map<string, CachedArchive>();
const pendingArchives = new Map<string, Promise<{ buffer: Buffer; checksum: string }>>();
let cachedBytes = 0;

interface CachedArchive {
  buffer: Buffer;
  checksum: string;
  expiresAt: number;
}

export async function getStoredSkillArchive(asset: AssetRecord): Promise<{
  buffer: Buffer;
  checksum: string;
}> {
  if (!asset.storage) throw new Error("Asset has no stored Skill directory.");

  const key = [
    asset.storage.endpoint ?? "aws",
    asset.storage.bucket,
    asset.storage.key,
    asset.storage.checksum
  ].join(":");
  const cached = archiveCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    archiveCache.delete(key);
    archiveCache.set(key, cached);
    return { buffer: cached.buffer, checksum: cached.checksum };
  }
  if (cached) removeCacheEntry(key, cached);

  const pending = pendingArchives.get(key);
  if (pending) return pending;

  const generation = (async () => {
    const archive = await packageSkillFiles((await loadStoredSkill(asset.storage!)).files);
    cacheArchive(key, archive);
    return archive;
  })();
  pendingArchives.set(key, generation);
  try {
    return await generation;
  } finally {
    pendingArchives.delete(key);
  }
}

export async function getStoredAssetArchive(asset: AssetRecord): Promise<{
  buffer: Buffer;
  checksum: string;
}> {
  if (asset.kind === "skill") return getStoredSkillArchive(asset);
  if (!asset.storage) throw new Error("Asset has no stored files.");
  const { analyzed } = await loadStoredMcp(asset.storage);
  return packageMcpConfiguration(analyzed.content);
}

export async function packageMcpConfiguration(content: Buffer): Promise<{
  buffer: Buffer;
  checksum: string;
}> {
  const zip = new JSZip();
  zip.file(MCP_CONFIG_FILE_NAME, content, {
    createFolders: false,
    date: new Date("1980-01-01T00:00:00.000Z"),
    unixPermissions: 0o100644
  });
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "UNIX"
  });
  return { buffer, checksum: contentHash(buffer) };
}

export async function loadStoredSkill(storage: StoredObject): Promise<{
  files: SkillPackageFile[];
  skill: DiscoveredSkill;
}> {
  const files = await readStoredSkillFiles(storage);
  const skill = analyzeStoredSkillFiles(files);
  if (!canonicalSkillFilesChecksumForStorage(files, storage)) {
    throw new Error("Stored Skill content does not match its catalog checksum.");
  }
  return { files, skill };
}

export async function loadStoredMcp(storage: StoredObject): Promise<{
  files: StoredAssetFile[];
  analyzed: AnalyzedMcpConfiguration;
}> {
  const files = await readStoredAssetFiles(storage);
  const config = files.find((file) => file.path === MCP_CONFIG_FILE_NAME);
  if (!config || files.length !== 1) {
    throw new Error("Stored MCP asset must contain exactly one mcp.json file.");
  }
  const analyzed = analyzeMcpConfiguration(config.content);
  if (analyzed.checksum !== storage.checksum) {
    throw new Error("Stored MCP configuration does not match its catalog checksum.");
  }
  return { files, analyzed };
}

export async function loadStoredAssetFilesForPreview(
  asset: AssetRecord
): Promise<StoredAssetFile[]> {
  if (!asset.storage) throw new Error("Asset has no stored files.");
  return asset.kind === "skill"
    ? (await loadStoredSkill(asset.storage)).files
    : (await loadStoredMcp(asset.storage)).files;
}

function cacheArchive(key: string, archive: CachedArchive | { buffer: Buffer; checksum: string }): void {
  if (archive.buffer.byteLength > MAX_CACHE_BYTES) return;
  const previous = archiveCache.get(key);
  if (previous) removeCacheEntry(key, previous);
  const entry: CachedArchive = {
    buffer: archive.buffer,
    checksum: archive.checksum,
    expiresAt: Date.now() + CACHE_TTL_MS
  };
  archiveCache.set(key, entry);
  cachedBytes += entry.buffer.byteLength;

  for (const [oldestKey, oldest] of archiveCache) {
    if (cachedBytes <= MAX_CACHE_BYTES) break;
    removeCacheEntry(oldestKey, oldest);
  }
}

function removeCacheEntry(key: string, entry: CachedArchive): void {
  if (!archiveCache.delete(key)) return;
  cachedBytes -= entry.buffer.byteLength;
}
