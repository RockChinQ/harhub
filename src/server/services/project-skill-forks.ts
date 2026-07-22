import { createHash } from "node:crypto";

import {
  createImportedSkillAsset,
  obsoleteAssetStorageObjects,
  removeCatalogAsset,
  upsertAsset
} from "../../features/assets/index.js";
import {
  canonicalSkillFilesChecksumForStorage,
  discoverSkillsInArchive,
  analyzeStoredSkillFiles,
  SKILL_FILES_CHECKSUM_ALGORITHM,
  type DiscoveredSkill,
  type SkillPackageFile
} from "../../features/skills/index.js";
import type {
  AssetCatalog,
  AssetRecord,
  ProjectBinding,
  ProjectSkillDiffFile,
  ProjectSkillDiffResponse,
  ProjectSkillPublishResponse,
  ProjectSyncRequest,
  ProjectSyncResponse,
  StoredObject,
  WorkspaceRecord
} from "../../shared/types.js";
import {
  authorizeProjectSync,
  authorizeGitHubAppProjectSync,
  getProjectSkillFork,
  recordProjectSkillPublished,
  syncProjectFromRepository,
  syncProjectFromGitHubApp,
  writeWorkspaceAssetCatalog,
  type ProjectBindingBaselineUpdate,
  type ProjectSkillForkUpdate
} from "../../state/index.js";
import {
  deleteStoredObject,
  uploadSkillFiles
} from "../../storage/index.js";
import { loadStoredSkill } from "./skill-packages.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";

const MAX_DIFF_PREVIEW_BYTES = 256 * 1024;

export async function syncProjectRepositoryFiles(input: {
  workspaceId: string;
  projectId: string;
  repository: string;
  commitSha: string;
  defaultBranch: string;
  files: Array<{ path: string; content: Buffer }>;
  baselineAssetIds?: Readonly<Record<string, string>>;
  baselineVersions?: Readonly<Record<string, number>>;
  repositoryOwnedPaths?: ReadonlySet<string>;
}): Promise<ProjectSyncResponse> {
  const authorization = await authorizeGitHubAppProjectSync(
    input.workspaceId,
    input.projectId,
    input.repository
  );
  const candidates = input.files
    .filter((file) => file.path.endsWith("/SKILL.md"))
    .map((metadata) => {
      const rootPath = metadata.path.slice(0, -"/SKILL.md".length);
      const skill = analyzeStoredSkillFiles(
        input.files
          .filter((file) => file.path.startsWith(`${rootPath}/`))
          .map((file) => ({ path: file.path.slice(rootPath.length + 1), content: file.content }))
      );
      return { ...skill, rootPath, skillPath: metadata.path };
    });
  const request: ProjectSyncRequest = {
    schemaVersion: 1,
    repository: input.repository,
    commitSha: input.commitSha,
    ref: input.defaultBranch,
    bindings: [
      ...candidates.map((candidate) => ({
        kind: "skill" as const,
        name: candidate.displayName,
        path: candidate.rootPath,
        digest: candidate.checksum,
        digestAlgorithm: SKILL_FILES_CHECKSUM_ALGORITHM
      })),
      ...input.files
        .filter((file) => !candidates.some((candidate) => file.path.startsWith(`${candidate.rootPath}/`)))
        .map((file) => ({
          kind: bindingKindForRepositoryPath(file.path),
          name: repositoryBindingName(file.path),
          path: file.path,
          digest: createHash("sha256").update(file.content).digest("hex")
        }))
    ]
  };
  const catalog = await loadOrCreateWorkspaceAssetCatalog(workspaceForSync(input.workspaceId));
  const candidatesByPath = validateSkillBundle(request, candidates, true);
  const bindingsByPath = new Map(
    authorization.bindings.filter((binding) => binding.kind === "skill").map((binding) => [binding.path, binding])
  );
  const existingForks = new Map(authorization.skillForks.map((fork) => [fork.path, fork]));
  const newStorage: StoredObject[] = [];
  const forkUpdates: ProjectSkillForkUpdate[] = [];
  const baselineUpdates: ProjectBindingBaselineUpdate[] = [];

  try {
    for (const observed of request.bindings.filter((binding) => binding.kind === "skill")) {
      const existingBinding = bindingsByPath.get(observed.path);
      const candidate = candidatesByPath.get(observed.path);
      const explicitlyBound = input.baselineAssetIds?.[observed.path];
      const baseAsset = input.repositoryOwnedPaths?.has(observed.path)
        ? undefined
        : explicitlyBound
          ? catalog.assets.find((asset) => asset.id === explicitlyBound)
          : findBaseAsset(catalog, existingBinding, candidate);
      const pinnedVersion = input.baselineVersions?.[observed.path];
      const baseVersion = pinnedVersion
        ? baseAsset?.versionHistory?.find((version) => version.version === pinnedVersion)
        : undefined;
      if (pinnedVersion && !baseVersion?.storage) {
        throw new Error(`Pinned Library version ${pinnedVersion} is unavailable for ${observed.path}.`);
      }
      const baseStorage = baseVersion?.storage ?? baseAsset?.storage;
      const baseDigest = baseStorage
        ? canonicalSkillFilesChecksumForStorage(candidate!.files, baseStorage) ?? baseStorage.checksum
        : undefined;
      baselineUpdates.push({
        path: observed.path,
        ...(baseAsset ? { assetId: baseAsset.id } : {}),
        ...(baseDigest ? { digest: baseDigest } : {}),
        ...(baseVersion ? { version: baseVersion.version } : {})
      });
      if (baseDigest === candidate!.checksum) continue;
      const existingFork = existingForks.get(observed.path);
      const existingForkDigest = existingFork
        ? canonicalSkillFilesChecksumForStorage(candidate!.files, existingFork.storage)
        : undefined;
      const storage = existingFork && existingForkDigest === candidate!.checksum
        ? { ...existingFork.storage, checksum: candidate!.checksum, checksumAlgorithm: SKILL_FILES_CHECKSUM_ALGORITHM }
        : await uploadSkillFiles({
            workspaceId: input.workspaceId,
            skillName: `project-${input.projectId}-${candidate!.name}`,
            files: candidate!.files,
            checksum: candidate!.checksum
          });
      if (!existingFork || existingForkDigest !== candidate!.checksum) newStorage.push(storage);
      forkUpdates.push({
        path: observed.path,
        digest: candidate!.checksum,
        fileCount: candidate!.fileCount,
        size: candidate!.size,
        validation: candidate!.validation,
        validationIssues: candidate!.validationIssues,
        updatedAt: new Date().toISOString(),
        storage
      });
    }
    const result = await syncProjectFromGitHubApp(
      input.workspaceId,
      input.projectId,
      request,
      forkUpdates,
      authorization.generation,
      baselineUpdates
    );
    const retained = new Set(forkUpdates.map((fork) => storageKey(fork.storage)));
    await deleteStoredObjectsBestEffort(
      authorization.skillForks.filter((fork) => !retained.has(storageKey(fork.storage))).map((fork) => fork.storage)
    );
    return result;
  } catch (error) {
    await deleteStoredObjectsBestEffort(newStorage);
    throw error;
  }
}

export async function syncProjectRepositoryBundle(input: {
  projectId: string;
  token: string;
  request: ProjectSyncRequest;
  skillArchive?: Buffer;
}): Promise<ProjectSyncResponse> {
  const authorization = await authorizeProjectSync(
    input.projectId,
    input.token,
    input.request.repository
  );
  const workspace = workspaceForSync(authorization.workspaceId);
  const catalog = await loadOrCreateWorkspaceAssetCatalog(workspace);
  const candidates = input.skillArchive
    ? await discoverSkillsInArchive(input.skillArchive)
    : [];
  const candidatesByPath = validateSkillBundle(input.request, candidates, Boolean(input.skillArchive));
  const bindingsByPath = new Map(
    authorization.bindings
      .filter((binding) => binding.kind === "skill")
      .map((binding) => [binding.path, binding])
  );
  const existingForks = new Map(authorization.skillForks.map((fork) => [fork.path, fork]));
  const newStorage: StoredObject[] = [];
  const forkUpdates: ProjectSkillForkUpdate[] = [];
  const baselineUpdates: ProjectBindingBaselineUpdate[] = [];

  try {
    for (const observed of input.request.bindings.filter((binding) => binding.kind === "skill")) {
      const existingBinding = bindingsByPath.get(observed.path);
      const candidate = candidatesByPath.get(observed.path);
      const baseAsset = findBaseAsset(catalog, existingBinding, candidate);
      if (
        baseAsset?.storage?.checksumAlgorithm !== undefined &&
        baseAsset.storage.checksumAlgorithm !== SKILL_FILES_CHECKSUM_ALGORITHM
      ) {
        throw new Error(
          `Stored Skill ${baseAsset.id} uses an unsupported checksum algorithm.`
        );
      }
      const baseDigest = baseAsset?.storage
        ? candidate
          ? canonicalSkillFilesChecksumForStorage(candidate.files, baseAsset.storage) ??
            baseAsset.storage.checksum
          : baseAsset.storage.checksum
        : input.skillArchive
          ? undefined
          : existingBinding?.sourceDigest;
      if (baseAsset?.storage) {
        baselineUpdates.push({
          path: observed.path,
          assetId: baseAsset.id,
          digest: baseDigest
        });
      } else if (input.skillArchive) {
        baselineUpdates.push({ path: observed.path });
      }

      const observedDigest = candidate?.checksum ?? observed.digest;
      const needsFork = baseDigest !== observedDigest;
      if (!needsFork) continue;
      if (!candidate) {
        throw new Error(
          `A complete Skill bundle is required for added or modified Skill ${observed.path}.`
        );
      }

      const existingFork = existingForks.get(observed.path);
      const existingForkDigest = existingFork
        ? canonicalSkillFilesChecksumForStorage(candidate.files, existingFork.storage)
        : undefined;
      let storage: StoredObject;
      if (existingFork && existingForkDigest === observedDigest) {
        storage = {
          ...existingFork.storage,
          checksum: observedDigest,
          checksumAlgorithm: SKILL_FILES_CHECKSUM_ALGORITHM
        };
      } else {
        storage = await uploadSkillFiles({
          workspaceId: authorization.workspaceId,
          skillName: `project-${input.projectId}-${candidate.name}`,
          files: candidate.files,
          checksum: candidate.checksum
        });
        newStorage.push(storage);
      }
      forkUpdates.push({
        path: observed.path,
        digest: candidate.checksum,
        fileCount: candidate.fileCount,
        size: candidate.size,
        validation: candidate.validation,
        validationIssues: candidate.validationIssues,
        updatedAt: new Date().toISOString(),
        storage
      });
    }

    const requestForState: ProjectSyncRequest = {
      ...input.request,
      bindings: input.request.bindings.map((binding) => {
        const candidate = binding.kind === "skill" ? candidatesByPath.get(binding.path) : undefined;
        return candidate
          ? {
              ...binding,
              name: candidate.displayName,
              digest: candidate.checksum,
              digestAlgorithm: SKILL_FILES_CHECKSUM_ALGORITHM
            }
          : binding;
      })
    };
    const result = await syncProjectFromRepository(
      input.projectId,
      input.token,
      requestForState,
      forkUpdates,
      authorization.generation,
      baselineUpdates
    );
    const retainedKeys = new Set(forkUpdates.map((fork) => storageKey(fork.storage)));
    const staleStorage = authorization.skillForks
      .filter((fork) => !retainedKeys.has(storageKey(fork.storage)))
      .map((fork) => fork.storage);
    await deleteStoredObjectsBestEffort(staleStorage);
    return result;
  } catch (error) {
    await deleteStoredObjectsBestEffort(newStorage);
    throw error;
  }
}

export async function getProjectSkillDiff(input: {
  accountId: string;
  workspace: WorkspaceRecord;
  projectId: string;
  bindingId: string;
  selectedPath?: string;
}): Promise<ProjectSkillDiffResponse> {
  const { binding, fork } = await getProjectSkillFork(
    input.accountId,
    input.workspace.id,
    input.projectId,
    input.bindingId
  );
  if (binding.status !== "added" && binding.status !== "modified") {
    throw new Error("This Project Skill has no unpublished repository changes.");
  }

  const forkFiles = (await loadStoredSkill(fork.storage)).files;
  const catalog = await loadOrCreateWorkspaceAssetCatalog(input.workspace);
  const baseAsset = binding.assetId
    ? catalog.assets.find((asset) => asset.id === binding.assetId)
    : undefined;
  const baseStorage = binding.sourceVersion
    ? baseAsset?.versionHistory?.find((version) => version.version === binding.sourceVersion)?.storage
    : baseAsset?.storage;
  const baseFiles = baseStorage
    ? (await loadStoredSkill(baseStorage)).files
    : [];
  const files = compareSkillFiles(baseFiles, forkFiles);
  const selected = input.selectedPath
    ? selectedFileDiff(input.selectedPath, files, baseFiles, forkFiles)
    : undefined;

  return {
    bindingId: binding.id,
    name: binding.name,
    path: binding.path,
    status: binding.status,
    ...(baseAsset ? { baseAssetId: baseAsset.id } : {}),
    fork: {
      digest: fork.digest,
      fileCount: fork.fileCount,
      size: fork.size,
      validation: fork.validation,
      updatedAt: fork.updatedAt
    },
    files,
    ...(selected ? { selectedFile: selected } : {})
  };
}

export async function publishProjectSkillFork(input: {
  accountId: string;
  workspace: WorkspaceRecord;
  projectId: string;
  bindingId: string;
}): Promise<ProjectSkillPublishResponse> {
  const { binding, fork } = await getProjectSkillFork(
    input.accountId,
    input.workspace.id,
    input.projectId,
    input.bindingId
  );
  if (fork.validation.errors > 0) {
    throw new Error("Fix all Project Skill validation errors before syncing it to the Library.");
  }

  const { files, skill } = await loadStoredSkill(fork.storage);
  const originalCatalog = await loadOrCreateWorkspaceAssetCatalog(input.workspace);
  const targetId = `asset:skill:${input.workspace.id}:${skill.name}`;
  const replacedAssets = originalCatalog.assets.filter((asset) =>
    asset.id === targetId || asset.id === binding.assetId
  );
  const previous =
    replacedAssets.find((candidate) => candidate.id === targetId) ??
    replacedAssets.find((candidate) => candidate.id === binding.assetId);
  const hasSamePackage = previous?.storage?.checksum === skill.checksum;
  const storage = hasSamePackage && previous.storage
    ? previous.storage
    : await uploadSkillFiles({
        workspaceId: input.workspace.id,
        skillName: skill.name,
        files,
        checksum: skill.checksum
      });
  const asset = createImportedSkillAsset({
    workspaceId: input.workspace.id,
    skill,
    storage,
    previous,
    versionSource: "project-sync",
    createdByAccountId: input.accountId
  });
  let catalog = originalCatalog;
  for (const replaced of replacedAssets) catalog = removeCatalogAsset(catalog, replaced.id);
  catalog = upsertAsset(catalog, asset);

  try {
    await writeWorkspaceAssetCatalog(input.workspace.id, catalog);
    const project = await recordProjectSkillPublished({
      accountId: input.accountId,
      workspaceId: input.workspace.id,
      projectId: input.projectId,
      bindingId: input.bindingId,
      assetId: asset.id,
      digest: skill.checksum,
      name: asset.displayName
    });
    await deleteStoredObjectsBestEffort([
      fork.storage,
      ...obsoleteAssetStorageObjects(replacedAssets, [asset])
    ]);
    return { project, asset };
  } catch (error) {
    let restored = false;
    try {
      await writeWorkspaceAssetCatalog(input.workspace.id, originalCatalog);
      restored = true;
    } catch {
      // Keep the newly stored object when the catalog rollback fails so its current reference works.
    }
    if (restored && !hasSamePackage) await deleteStoredObjectsBestEffort([storage]);
    throw error;
  }
}

function validateSkillBundle(
  request: ProjectSyncRequest,
  candidates: DiscoveredSkill[],
  hasArchive: boolean
): Map<string, DiscoveredSkill> {
  const expectedPaths = new Set(
    request.bindings.filter((binding) => binding.kind === "skill").map((binding) => binding.path)
  );
  const candidatesByPath = new Map(candidates.map((candidate) => [candidate.rootPath, candidate]));
  if (hasArchive) {
    const names = new Set<string>();
    for (const candidate of candidates) {
      if (names.has(candidate.name)) {
        throw new Error(`Skill bundle contains duplicate Skill name "${candidate.name}".`);
      }
      names.add(candidate.name);
    }
    const unexpected = candidates.find((candidate) => !expectedPaths.has(candidate.rootPath));
    if (unexpected) throw new Error(`Skill bundle contains an unreported Skill: ${unexpected.rootPath}`);
    const missing = Array.from(expectedPaths).find((skillPath) => !candidatesByPath.has(skillPath));
    if (missing) throw new Error(`Skill bundle is missing the reported Skill: ${missing}`);
  }
  for (const binding of request.bindings.filter((item) => item.kind === "skill")) {
    const candidate = candidatesByPath.get(binding.path);
    if (
      candidate &&
      canonicalSkillFilesChecksumForStorage(candidate.files, {
        checksum: binding.digest,
        checksumAlgorithm: binding.digestAlgorithm
      }) !== candidate.checksum
    ) {
      throw new Error(`Skill bundle digest does not match the manifest for ${binding.path}.`);
    }
  }
  return candidatesByPath;
}

function findBaseAsset(
  catalog: AssetCatalog,
  binding: ProjectBinding | undefined,
  candidate: DiscoveredSkill | undefined
): AssetRecord | undefined {
  const bound = binding?.assetId
    ? catalog.assets.find((asset) => asset.id === binding.assetId)
    : undefined;
  if (bound) return bound;
  return candidate
    ? catalog.assets.find((asset) => asset.kind === "skill" && asset.name === candidate.name)
    : undefined;
}

function compareSkillFiles(
  baseFiles: SkillPackageFile[],
  forkFiles: SkillPackageFile[]
): ProjectSkillDiffFile[] {
  const base = new Map(baseFiles.map((file) => [file.path, file.content]));
  const fork = new Map(forkFiles.map((file) => [file.path, file.content]));
  const paths = new Set([...base.keys(), ...fork.keys()]);
  const result: ProjectSkillDiffFile[] = [];
  for (const path of Array.from(paths).sort()) {
    const before = base.get(path);
    const after = fork.get(path);
    if (!before) result.push({ path, status: "added" });
    else if (!after) result.push({ path, status: "removed" });
    else if (!before.equals(after)) result.push({ path, status: "modified" });
  }
  return result;
}

function selectedFileDiff(
  selectedPath: string,
  files: ProjectSkillDiffFile[],
  baseFiles: SkillPackageFile[],
  forkFiles: SkillPackageFile[]
): NonNullable<ProjectSkillDiffResponse["selectedFile"]> {
  const file = files.find((item) => item.path === selectedPath);
  if (!file) throw new Error("Selected Skill diff file was not found.");
  const before = baseFiles.find((item) => item.path === selectedPath)?.content;
  const after = forkFiles.find((item) => item.path === selectedPath)?.content;
  const binary = [before, after].some((content) => content?.includes(0));
  const truncated = [before, after].some((content) => (content?.byteLength ?? 0) > MAX_DIFF_PREVIEW_BYTES);
  return {
    path: selectedPath,
    status: file.status,
    ...(binary || !before ? {} : { baseContent: previewText(before) }),
    ...(binary || !after ? {} : { forkContent: previewText(after) }),
    binary,
    truncated
  };
}

function previewText(content: Buffer): string {
  return content.subarray(0, MAX_DIFF_PREVIEW_BYTES).toString("utf8");
}

function storageKey(storage: StoredObject): string {
  return `${storage.provider}:${storage.bucket}:${storage.key}`;
}

async function deleteStoredObjectsBestEffort(storage: StoredObject[]): Promise<void> {
  const unique = new Map(storage.map((item) => [storageKey(item), item]));
  await Promise.all(Array.from(unique.values()).map((item) =>
    deleteStoredObject(item).catch(() => undefined)
  ));
}

function workspaceForSync(workspaceId: string): WorkspaceRecord {
  return {
    id: workspaceId,
    slug: workspaceId,
    name: workspaceId,
    createdAt: new Date(0).toISOString()
  };
}

function bindingKindForRepositoryPath(filePath: string): "instruction" | "rule" | "mcp" {
  if (
    /(^|\/)AGENTS\.md$/.test(filePath) ||
    /(^|\/)CLAUDE\.md$/.test(filePath) ||
    filePath.startsWith(".github/")
  ) return "instruction";
  if (filePath.endsWith(".json") || filePath.startsWith(".harness/mcp/")) return "mcp";
  return "rule";
}

function repositoryBindingName(filePath: string): string {
  return filePath.split("/").pop()?.replace(/\.(?:md|mdc|json)$/i, "") || filePath;
}
