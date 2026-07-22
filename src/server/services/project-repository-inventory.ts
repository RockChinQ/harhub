import { randomUUID } from "node:crypto";

import {
  detectRepositoryInventory,
  REPOSITORY_DETECTOR_VERSION,
  type RepositorySourceFile
} from "../../features/repository-inventory/index.js";
import { analyzeStoredSkillFiles } from "../../features/skills/index.js";
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
  createGitHubAppProject,
  createProjectScanJob,
  failProjectScan,
  getProjectInventoryStateInternal,
  getProjectRepositoryConnectionInternal,
  listRecoverableProjectScanJobs,
  markProjectScanRunning,
  saveProjectRepositoryConnection,
  supersedeQueuedProjectScans,
  updateProjectConnectionObservation
} from "../../state/index.js";
import { type ProjectRepositoryConnectionRecord } from "../../state/types.js";
import { GitHubAppError, readRepositoryInventorySource } from "./github-app.js";
import { syncProjectRepositoryFiles } from "./project-skill-forks.js";
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
}): Promise<{ project: HarhubProject; scan: ProjectScanJob }> {
  if (input.repository.archived) throw new Error("Archived repositories cannot be imported.");
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
    permissionMode: input.repository.permissions.push ? "write" : "read",
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
      trigger: "initial"
    });
    return { project, scan };
  } catch (error) {
    // The Project remains visible if the provider changed between selection and import.
    // Its failed scan explains the recoverable state instead of silently losing user work.
    throw error;
  }
}

export async function queueProjectRepositoryScan(input: {
  workspaceId: string;
  projectId: string;
  trigger: ProjectInventoryTrigger;
  requestedSha?: string;
}): Promise<ProjectScanJob> {
  const connection = await getProjectRepositoryConnectionInternal(input.projectId);
  if (!connection || connection.workspaceId !== input.workspaceId || connection.status !== "active") {
    throw new Error("Project GitHub repository connection is not active.");
  }
  const job = await createProjectScanJob(input);
  await supersedeQueuedProjectScans(input.projectId, job.id);
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
    const artifacts = resolveRelationships(detected, source.files, catalog, inventory.policies);
    const includedFiles = filesIncludedByPolicies(source.files, artifacts, inventory.policies);
    await syncProjectRepositoryFiles({
      workspaceId: running.workspaceId,
      projectId: running.projectId,
      repository: `${source.repository.owner}/${source.repository.name}`,
      commitSha: source.commitSha,
      defaultBranch: source.repository.defaultBranch,
      files: includedFiles
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
        ...(running.requestedSha ? { requestedSha: running.requestedSha } : {})
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
    if (artifact.kind !== "skill") return { ...artifact, relationship: "repository-owned" };
    const skill = skillAtPath(files, artifact.path);
    const base = policy?.libraryAssetId
      ? catalog.assets.find((asset) => asset.id === policy.libraryAssetId)
      : catalog.assets.find((asset) => asset.kind === "skill" && asset.name === skill?.name);
    const version = policy?.pinnedVersion
      ? base?.versionHistory?.find((candidate) => candidate.version === policy.pinnedVersion)
      : undefined;
    const digest = version?.checksum ?? base?.storage?.checksum;
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
  const ignoredArtifacts = artifacts.filter((artifact) => ignored.has(artifact.path));
  return files.filter((file) => !ignoredArtifacts.some((artifact) =>
    artifact.kind === "skill" ? file.path.startsWith(`${artifact.path}/`) : file.path === artifact.path
  ));
}

function inventoryFiles(artifacts: ProjectInventoryArtifact[], files: RepositorySourceFile[]) {
  return artifacts.flatMap((artifact) => files
    .filter((file) => artifact.kind === "skill"
      ? file.path.startsWith(`${artifact.path}/`)
      : file.path === artifact.path)
    .map((file) => ({ artifactId: artifact.id, path: file.path, content: file.content }))
  );
}

function skillAtPath(files: RepositorySourceFile[], root: string) {
  try {
    return analyzeStoredSkillFiles(files
      .filter((file) => file.path.startsWith(`${root}/`))
      .map((file) => ({ path: file.path.slice(root.length + 1), content: file.content }))
    );
  } catch {
    return undefined;
  }
}

function scanFailure(error: unknown): NonNullable<ProjectScanJob["failure"]> {
  if (error instanceof GitHubAppError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return { code: "scan_failed", message: errorMessage(error), retryable: false };
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
