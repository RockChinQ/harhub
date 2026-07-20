import {
  analyzeStoredSkillFiles,
  canonicalSkillFilesChecksumForStorage,
  packageSkillFiles,
  type DiscoveredSkill,
  type SkillPackageFile
} from "../../features/skills/index.js";
import type { AssetRecord, StoredObject } from "../../shared/types.js";
import { readStoredSkillFiles } from "../../storage/index.js";

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
