import { randomUUID } from "node:crypto";

import {
  detectRepositoryInventory,
  discoverRepositorySkillPackages,
  repositorySkillSourcePath,
  REPOSITORY_DETECTOR_VERSION,
  type RepositorySourceFile
} from "../../features/repository-inventory/index.js";
import {
  analyzeStoredSkillFiles,
  canonicalSkillFilesChecksumForStorage
} from "../../features/skills/index.js";
import type {
  AssetCatalog,
  GitHubRepositorySummary,
  HarhubProject,
  ProjectBindingPolicy,
  ProjectInventoryArtifact,
  ProjectInventorySnapshot,
  ProjectInventoryTrigger,
  ProjectScanJob,
  WorkspaceRecord
} from "../../shared/types.js";
import {
  completeProjectScan,
  connectProjectGitHubAppRepository,
  createGitHubAppProject,
  createProjectScanJob,
  deleteProjectRepositoryConnection,
  failProjectScan,
  getProjectInventoryStateInternal,
  getProjectRepositoryConnectionInternal,
  findProjectRepositoryConnection,
  listRecoverableProjectScanJobs,
  markProjectScanRunning,
  removeFailedGitHubAppProjectImport,
  recordWorkspaceAuditEvent,
  saveProjectRepositoryConnection,
  supersedeQueuedProjectScans,
  updateProjectConnectionObservation,
  updateProjectGitHubRepositoryMetadata
} from "../../state/index.js";
import { type ProjectRepositoryConnectionRecord } from "../../state/types.js";
import { GitHubAppError, readRepositoryInventorySource } from "./github-app.js";
import { syncProjectRepositoryFiles } from "./project-skill-forks.js";
import { resolveExplicitLibraryAsset } from "./project-repository-ownership.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";

const MAX_SCAN_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;
const scheduledJobs = new Set<string>();
let recoveryStarted = false;

export async function importGitHubRepository(input: {
  accountId: string;
  workspaceId: string;
  installationId: string;
  repository: GitHubRepositorySummary;
  permissionMode: "read" | "write";
}): Promise<{ project: HarhubProject; scan: ProjectScanJob }> {
  if (input.repository.archived) throw new Error("Archived repositories cannot be imported.");
  if (await findProjectRepositoryConnection(input.installationId, input.repository.id)) {
    throw new Error("This repository is already imported as an active Project.");
  }
  const project = await createGitHubAppProject({
    accountId: input.accountId,
    workspaceId: input.workspaceId,
    name: input.repository.name,
    description: input.repository.description || `Harness inventory for ${input.repository.fullName}.`,
    repository: {
      provider: "github",
      id: input.repository.id,
      nodeId: input.repository.nodeId,
      owner: input.repository.owner,
      name: input.repository.name,
      url: input.repository.url,
      defaultBranch: input.repository.defaultBranch
    }
  });
  const connection: ProjectRepositoryConnectionRecord = {
    workspaceId: input.workspaceId,
    projectId: project.id,
    mode: "github-app",
    status: "active",
    installationId: input.installationId,
    permissionMode: input.permissionMode,
    repositoryId: input.repository.id,
    repositoryNodeId: input.repository.nodeId,
    owner: input.repository.owner,
    name: input.repository.name,
    defaultBranch: input.repository.defaultBranch,
    connectedAt: new Date().toISOString()
  };
  try {
    await saveProjectRepositoryConnection(connection);
    const scan = await queueProjectRepositoryScan({
      workspaceId: input.workspaceId,
      projectId: project.id,
      trigger: "initial",
      actorAccountId: input.accountId
    });
    return { project, scan };
  } catch (error) {
    await deleteProjectRepositoryConnection(project.id).catch(() => undefined);
    await removeFailedGitHubAppProjectImport(input.accountId, input.workspaceId, project.id)
      .catch(() => undefined);
    throw error;
  }
}

export async function connectExistingProjectGitHubRepository(input: {
  accountId: string;
  workspaceId: string;
  projectId: string;
  installationId: string;
  repository: GitHubRepositorySummary;
  permissionMode: "read" | "write";
}): Promise<{ project: HarhubProject; scan: ProjectScanJob }> {
  const existing = await findProjectRepositoryConnection(input.installationId, input.repository.id);
  if (existing && existing.projectId !== input.projectId) {
    throw new Error("This repository is already imported as another active Project.");
  }
  const connection: ProjectRepositoryConnectionRecord = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    mode: "github-app",
    status: "active",
    installationId: input.installationId,
    permissionMode: input.permissionMode,
    repositoryId: input.repository.id,
    repositoryNodeId: input.repository.nodeId,
    owner: input.repository.owner,
    name: input.repository.name,
    defaultBranch: input.repository.defaultBranch,
    connectedAt: new Date().toISOString()
  };
  await saveProjectRepositoryConnection(connection);
  try {
    const project = await connectProjectGitHubAppRepository(
      input.accountId,
      input.workspaceId,
      input.projectId,
      {
        provider: "github",
        id: input.repository.id,
        nodeId: input.repository.nodeId,
        owner: input.repository.owner,
        name: input.repository.name,
        url: input.repository.url,
        defaultBranch: input.repository.defaultBranch
      }
    );
    const scan = await queueProjectRepositoryScan({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      trigger: "initial",
      actorAccountId: input.accountId
    });
    return { project, scan };
  } catch (error) {
    await deleteProjectRepositoryConnection(input.projectId).catch(() => undefined);
    throw error;
  }
}

export async function queueProjectRepositoryScan(input: {
  workspaceId: string;
  projectId: string;
  trigger: ProjectInventoryTrigger;
  requestedSha?: string;
  actorAccountId?: string;
}): Promise<ProjectScanJob> {
  const connection = await getProjectRepositoryConnectionInternal(input.projectId);
  if (!connection || connection.workspaceId !== input.workspaceId || connection.status !== "active") {
    throw new Error("Project GitHub repository connection is not active.");
  }
  const job = await createProjectScanJob(input);
  await supersedeQueuedProjectScans(input.projectId, job.id);
  await recordWorkspaceAuditEvent({
    workspaceId: input.workspaceId,
    eventType: "project.repository.scan.requested",
    entityType: "project",
    entityId: input.projectId,
    ...(input.actorAccountId ? { actorAccountId: input.actorAccountId } : {}),
    source: input.trigger === "push" ? "github-app" : "api",
    metadata: { jobId: job.id, trigger: input.trigger, ...(input.requestedSha ? { requestedSha: input.requestedSha } : {}) },
    deduplicationKey: `project-scan-requested:${job.id}`
  }).catch((error) => logScan("audit_failed", { jobId: job.id, error: errorMessage(error) }));
  scheduleJob(job);
  return job;
}

export function recoverProjectRepositoryScans(): void {
  if (recoveryStarted) return;
  recoveryStarted = true;
  void listRecoverableProjectScanJobs()
    .then((jobs) => jobs.forEach(scheduleJob))
    .catch((error) => logScan("recovery_failed", { error: errorMessage(error) }));
}

export async function executeProjectRepositoryScan(job: ProjectScanJob): Promise<void> {
  const startedAt = Date.now();
  let running = job;
  try {
    running = await markProjectScanRunning(job.id);
    if (running.status !== "running") return;
    const connection = await requireConnection(running);
    logScan("started", {
      jobId: running.id,
      projectId: running.projectId,
      attempt: running.attempts,
      trigger: running.trigger
    });
    const source = await readRepositoryInventorySource({
      installationId: connection.installationId!,
      owner: connection.owner,
      name: connection.name,
      ...(running.requestedSha ? { requestedSha: running.requestedSha } : {})
    });
    const inventory = await getProjectInventoryStateInternal(running.workspaceId, running.projectId);
    const catalog = await loadOrCreateWorkspaceAssetCatalog(workspaceRecord(running.workspaceId));
    const detected = detectRepositoryInventory(source.files);
    await updateProjectGitHubRepositoryMetadata(
      running.workspaceId,
      running.projectId,
      connection.repositoryId,
      {
        owner: source.repository.owner,
        name: source.repository.name,
        url: source.repository.url,
        defaultBranch: source.repository.defaultBranch
      }
    );
    const artifacts = resolveRelationships(detected, source.files, catalog, inventory.policies);
    const includedFiles = filesIncludedByPolicies(source.files, artifacts, inventory.policies);
    await syncProjectRepositoryFiles({
      workspaceId: running.workspaceId,
      projectId: running.projectId,
      repository: `${source.repository.owner}/${source.repository.name}`,
      commitSha: source.commitSha,
      defaultBranch: source.repository.defaultBranch,
      files: includedFiles,
      baselineAssetIds: Object.fromEntries(inventory.policies.flatMap((policy) =>
        policy.ownership === "library" && policy.libraryAssetId
          ? [[policy.artifactPath, policy.libraryAssetId]]
          : []
      )),
      baselineVersions: Object.fromEntries(inventory.policies.flatMap((policy) =>
        policy.ownership === "library" && policy.pinnedVersion
          ? [[policy.artifactPath, policy.pinnedVersion]]
          : []
      )),
      repositoryOwnedPaths: new Set(inventory.policies
        .filter((policy) => policy.ownership === "repository")
        .map((policy) => policy.artifactPath))
    });
    const snapshot: ProjectInventorySnapshot = {
      id: randomUUID(),
      workspaceId: running.workspaceId,
      projectId: running.projectId,
      commitSha: source.commitSha,
      treeSha: source.treeSha,
      detectorVersion: REPOSITORY_DETECTOR_VERSION,
      trigger: running.trigger,
      artifacts,
      createdAt: new Date().toISOString()
    };
    await completeProjectScan(
      running.id,
      snapshot,
      inventoryFiles(snapshot.artifacts, source.files)
    );
    await updateProjectConnectionObservation(running.projectId, {
      headSha: source.commitSha,
      observedAt: snapshot.createdAt,
      owner: source.repository.owner,
      name: source.repository.name,
      defaultBranch: source.repository.defaultBranch
    });
    await recordWorkspaceAuditEvent({
      workspaceId: running.workspaceId,
      eventType: "project.repository.scan.succeeded",
      entityType: "project",
      entityId: running.projectId,
      source: "github-app",
      metadata: {
        jobId: running.id,
        commitSha: source.commitSha,
        artifactCount: artifacts.length,
        durationMs: Date.now() - startedAt
      },
      deduplicationKey: `project-scan-succeeded:${running.id}`
    });
    if (inventory.latestSnapshot && inventory.latestSnapshot.commitSha !== source.commitSha) {
      await recordWorkspaceAuditEvent({
        workspaceId: running.workspaceId,
        eventType: "project.inventory.changed",
        entityType: "project",
        entityId: running.projectId,
        source: "github-app",
        metadata: {
          previousCommitSha: inventory.latestSnapshot.commitSha,
          commitSha: source.commitSha,
          artifactCount: artifacts.length
        },
        deduplicationKey: `project-inventory-changed:${running.projectId}:${source.commitSha}`
      });
    }
    logScan("succeeded", {
      jobId: running.id,
      projectId: running.projectId,
      durationMs: Date.now() - startedAt,
      commitSha: source.commitSha,
      artifacts: artifacts.length
    });
  } catch (error) {
    const failure = scanFailure(error);
    await failProjectScan(running.id, failure).catch(() => undefined);
    await recordWorkspaceAuditEvent({
      workspaceId: running.workspaceId,
      eventType: "project.repository.scan.failed",
      entityType: "project",
      entityId: running.projectId,
      source: "github-app",
      metadata: { jobId: running.id, code: failure.code, retryable: failure.retryable },
      deduplicationKey: `project-scan-failed:${running.id}`
    }).catch(() => undefined);
    logScan("failed", {
      jobId: running.id,
      projectId: running.projectId,
      durationMs: Date.now() - startedAt,
      attempt: running.attempts,
      code: failure.code,
      retryable: failure.retryable,
      error: failure.message
    });
    if (failure.retryable && running.attempts < MAX_SCAN_ATTEMPTS) {
      const retry = await createProjectScanJob({
        workspaceId: running.workspaceId,
        projectId: running.projectId,
        trigger: "retry",
        ...(running.requestedSha ? { requestedSha: running.requestedSha } : {}),
        attempts: running.attempts
      });
      setTimeout(() => scheduleJob(retry), RETRY_BASE_MS * 2 ** Math.max(0, running.attempts - 1)).unref();
    }
  }
}

function scheduleJob(job: ProjectScanJob): void {
  if (scheduledJobs.has(job.id)) return;
  scheduledJobs.add(job.id);
  setImmediate(() => {
    void executeProjectRepositoryScan(job).finally(() => scheduledJobs.delete(job.id));
  });
}

async function requireConnection(job: ProjectScanJob): Promise<ProjectRepositoryConnectionRecord> {
  const connection = await getProjectRepositoryConnectionInternal(job.projectId);
  if (
    !connection || connection.workspaceId !== job.workspaceId ||
    connection.status !== "active" || connection.mode !== "github-app" || !connection.installationId
  ) throw new Error("Project GitHub repository connection is unavailable.");
  return connection;
}

function resolveRelationships(
  artifacts: ProjectInventoryArtifact[],
  files: RepositorySourceFile[],
  catalog: AssetCatalog,
  policies: ProjectBindingPolicy[]
): ProjectInventoryArtifact[] {
  const policyByPath = new Map(policies.map((policy) => [policy.artifactPath, policy]));
  return artifacts.map((artifact) => {
    if (artifact.validation.errors > 0) return { ...artifact, relationship: "blocked" };
    const policy = policyByPath.get(artifact.path);
    if (policy?.ownership === "ignored") return { ...artifact, relationship: "ignored" };
    if (policy?.ownership === "repository" || artifact.kind !== "skill") {
      return { ...artifact, relationship: "repository-owned" };
    }
    const skill = skillAtPath(files, artifact.path);
    const base = resolveExplicitLibraryAsset(catalog, {
      libraryAssetId: policy?.ownership === "library" ? policy.libraryAssetId : undefined
    });
    const version = policy?.pinnedVersion
      ? base?.versionHistory?.find((candidate) => candidate.version === policy.pinnedVersion)
      : undefined;
    const baseStorage = version?.storage ?? base?.storage;
    const digest = baseStorage && skill
      ? canonicalSkillFilesChecksumForStorage(skill.files, baseStorage) ?? baseStorage.checksum
      : version?.checksum ?? base?.storage?.checksum;
    if (!base || !digest) return { ...artifact, relationship: "repository-owned" };
    return {
      ...artifact,
      relationship: digest === artifact.digest ? "library-synced" : "library-modified",
      libraryAssetId: base.id,
      libraryVersion: version?.version ?? base.version
    };
  });
}

function filesIncludedByPolicies(
  files: RepositorySourceFile[],
  artifacts: ProjectInventoryArtifact[],
  policies: ProjectBindingPolicy[]
): RepositorySourceFile[] {
  const ignored = new Set(
    policies.filter((policy) => policy.ownership === "ignored").map((policy) => policy.artifactPath)
  );
  const packagesByPath = repositorySkillPackagesByPath(files);
  const excludedPaths = new Set<string>();
  for (const artifact of artifacts) {
    if (!ignored.has(artifact.path) && artifact.relationship !== "blocked") continue;
    if (artifact.kind !== "skill") {
      excludedPaths.add(artifact.path);
      continue;
    }
    for (const file of packagesByPath.get(artifact.path)?.files ?? []) {
      excludedPaths.add(repositorySkillSourcePath(artifact.path, file.path));
    }
  }
  return files.filter((file) => !excludedPaths.has(file.path));
}

function inventoryFiles(artifacts: ProjectInventoryArtifact[], files: RepositorySourceFile[]) {
  const packagesByPath = repositorySkillPackagesByPath(files);
  return artifacts.flatMap((artifact) => {
    if (artifact.kind !== "skill") {
      return files
        .filter((file) => file.path === artifact.path)
        .map((file) => ({ artifactId: artifact.id, path: file.path, content: file.content }));
    }
    return (packagesByPath.get(artifact.path)?.files ?? []).map((file) => ({
      artifactId: artifact.id,
      path: repositorySkillSourcePath(artifact.path, file.path),
      content: file.content
    }));
  });
}

function skillAtPath(files: RepositorySourceFile[], root: string) {
  try {
    const skillPackage = repositorySkillPackagesByPath(files).get(root);
    return skillPackage ? analyzeStoredSkillFiles(skillPackage.files) : undefined;
  } catch {
    return undefined;
  }
}

function repositorySkillPackagesByPath(files: RepositorySourceFile[]) {
  return new Map(discoverRepositorySkillPackages(files).map((candidate) => [candidate.rootPath, candidate]));
}

function scanFailure(error: unknown): NonNullable<ProjectScanJob["failure"]> {
  if (error instanceof GitHubAppError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  const message = errorMessage(error);
  const terminal = /archived|not active|unavailable|does not match|invalid|exceeds/i.test(message);
  return { code: "scan_failed", message, retryable: !terminal };
}

function workspaceRecord(workspaceId: string): WorkspaceRecord {
  return { id: workspaceId, slug: workspaceId, name: workspaceId, createdAt: new Date(0).toISOString() };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logScan(event: string, details: Record<string, unknown>): void {
  console.info(JSON.stringify({ component: "project_repository_scan", event, ...details }));
}
