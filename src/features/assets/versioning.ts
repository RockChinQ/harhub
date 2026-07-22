import type {
  AssetRecord,
  AssetVersionRecord,
  AssetVersionSource,
  StoredObject
} from "../../shared/types.js";

const LEGACY_TIMESTAMP = "1970-01-01T00:00:00.000Z";
export const MAX_RETAINED_ASSET_VERSIONS = 5;

export function recordAssetVersion(input: {
  asset: AssetRecord;
  previous?: AssetRecord;
  source: Exclude<AssetVersionSource, "migration">;
  createdByAccountId?: string;
  summary?: string;
  createdAt?: string;
}): AssetRecord {
  const previous = input.previous
    ? normalizeAssetVersioning(input.previous)
    : undefined;

  if (
    previous?.storage?.checksum &&
    previous.storage.checksum === input.asset.storage?.checksum
  ) {
    return {
      ...input.asset,
      storage: previous.storage,
      version: previous.version,
      createdAt: previous.createdAt,
      updatedAt: previous.updatedAt,
      versionHistory: previous.versionHistory
    };
  }

  const createdAt = input.createdAt ?? input.asset.storage?.uploadedAt ?? new Date().toISOString();
  const version = (previous?.version ?? 0) + 1;
  const entry: AssetVersionRecord = {
    version,
    createdAt,
    source: input.source,
    ...(input.createdByAccountId
      ? { createdByAccountId: input.createdByAccountId }
      : {}),
    summary: input.summary ?? defaultVersionSummary(input.source, Boolean(previous)),
    changes: describeChanges(previous, input.asset),
    ...(input.asset.storage?.checksum
      ? { checksum: input.asset.storage.checksum }
      : {}),
    ...(input.asset.storage
      ? {
          fileCount: input.asset.storage.fileCount,
          size: input.asset.storage.size
        }
      : {}),
    displayName: input.asset.displayName,
    description: input.asset.description,
    health: input.asset.health,
    validation: input.asset.validation,
    ...(input.asset.storage ? { storage: { ...input.asset.storage } } : {})
  };

  const versionHistory = [...(previous?.versionHistory ?? []), entry]
    .slice(-MAX_RETAINED_ASSET_VERSIONS);

  return {
    ...input.asset,
    version,
    createdAt: previous?.createdAt ?? createdAt,
    updatedAt: createdAt,
    versionHistory
  };
}

export function normalizeAssetVersioning(asset: AssetRecord): AssetRecord {
  const history = normalizeHistory(asset.versionHistory);
  const fallbackCreatedAt =
    asset.createdAt ??
    asset.storage?.uploadedAt ??
    asset.updatedAt ??
    history[0]?.createdAt ??
    LEGACY_TIMESTAMP;
  const fallbackVersion = Math.max(
    1,
    asset.version ?? 0,
    ...history.map((entry) => entry.version)
  );
  let normalizedHistory = history.length > 0
    ? history
    : [legacyVersion(asset, fallbackVersion, fallbackCreatedAt)];
  if (asset.storage) {
    let currentIndex = -1;
    for (let index = normalizedHistory.length - 1; index >= 0; index -= 1) {
      const entry = normalizedHistory[index]!;
      if (
        entry.version === fallbackVersion ||
        Boolean(entry.checksum && entry.checksum === asset.storage.checksum)
      ) {
        currentIndex = index;
        break;
      }
    }
    if (currentIndex >= 0 && !normalizedHistory[currentIndex]?.storage) {
      normalizedHistory[currentIndex] = {
        ...normalizedHistory[currentIndex]!,
        storage: { ...asset.storage }
      };
    }
  }
  normalizedHistory = normalizedHistory.slice(-MAX_RETAINED_ASSET_VERSIONS);

  return {
    ...asset,
    version: fallbackVersion,
    createdAt: fallbackCreatedAt,
    updatedAt:
      asset.updatedAt ??
      normalizedHistory.at(-1)?.createdAt ??
      fallbackCreatedAt,
    versionHistory: normalizedHistory
  };
}

export function assetStorageObjects(asset: AssetRecord): StoredObject[] {
  const storage = [
    asset.storage,
    ...(asset.versionHistory ?? []).map((entry) => entry.storage)
  ].filter((item): item is StoredObject => Boolean(item));
  return Array.from(new Map(storage.map((item) => [storageIdentity(item), item])).values());
}

export function obsoleteAssetStorageObjects(
  previousAssets: AssetRecord[],
  retainedAssets: AssetRecord[]
): StoredObject[] {
  const retained = new Set(
    retainedAssets.flatMap(assetStorageObjects).map(storageIdentity)
  );
  return Array.from(new Map(
    previousAssets
      .flatMap(assetStorageObjects)
      .filter((item) => !retained.has(storageIdentity(item)))
      .map((item) => [storageIdentity(item), item])
  ).values());
}

function normalizeHistory(value: AssetVersionRecord[] | undefined): AssetVersionRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => Number.isInteger(entry.version) && entry.version > 0)
    .map((entry) => ({
      ...entry,
      changes: Array.isArray(entry.changes) ? entry.changes : [],
      validation: entry.validation ?? { errors: 0, warnings: 0 }
    }))
    .sort((left, right) => left.version - right.version);
}

function legacyVersion(
  asset: AssetRecord,
  version: number,
  createdAt: string
): AssetVersionRecord {
  return {
    version,
    createdAt,
    source: "migration",
    summary: "Version history initialized from an existing Skill",
    changes: ["Existing package registered as the initial tracked version"],
    ...(asset.storage?.checksum ? { checksum: asset.storage.checksum } : {}),
    ...(asset.storage
      ? { fileCount: asset.storage.fileCount, size: asset.storage.size }
      : {}),
    displayName: asset.displayName,
    description: asset.description,
    health: asset.health,
    validation: asset.validation,
    ...(asset.storage ? { storage: { ...asset.storage } } : {})
  };
}

function defaultVersionSummary(
  source: Exclude<AssetVersionSource, "migration">,
  isUpdate: boolean
): string {
  if (source === "project-sync") {
    return isUpdate
      ? "Published Project changes to the Library Skill"
      : "Published a Project Skill to the Library";
  }
  if (source === "rollback") return "Restored a retained Skill version";
  if (source === "scan") return isUpdate ? "Rescanned the local Skill" : "Indexed the local Skill";
  return isUpdate ? "Uploaded an updated Skill package" : "Imported the Skill package";
}

function storageIdentity(storage: StoredObject): string {
  return [
    storage.provider,
    storage.endpoint ?? "aws",
    storage.bucket,
    storage.key
  ].join(":");
}

function describeChanges(previous: AssetRecord | undefined, asset: AssetRecord): string[] {
  if (!previous) return ["Initial version"];

  const changes: string[] = [];
  if (previous.storage?.checksum !== asset.storage?.checksum) {
    changes.push("Package contents changed");
  }
  if (previous.displayName !== asset.displayName) changes.push("Display name changed");
  if (previous.description !== asset.description) changes.push("Description changed");
  if (previous.storage?.fileCount !== asset.storage?.fileCount) {
    changes.push(
      `File count changed from ${previous.storage?.fileCount ?? 0} to ${asset.storage?.fileCount ?? 0}`
    );
  }
  if (
    previous.validation.errors !== asset.validation.errors ||
    previous.validation.warnings !== asset.validation.warnings
  ) {
    changes.push("Validation result changed");
  }
  return changes.length > 0 ? changes : ["Package metadata refreshed"];
}
