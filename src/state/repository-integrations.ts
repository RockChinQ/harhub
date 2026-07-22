import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import type {
  GitHubInstallation,
  ProjectBindingPolicy,
  ProjectChangeProposal,
  ProjectInventoryArtifact,
  ProjectInventorySnapshot,
  ProjectRepositoryConnection,
  ProjectScanJob
} from "../shared/types.js";
import { serializeStateAccess } from "./access.js";
import {
  isDatabaseStateEnabled,
  queryDatabase,
  withDatabaseTransaction
} from "./database.js";
import { requireWorkspaceAdmin, requireWorkspaceMembership } from "./records.js";
import { loadState, saveState } from "./store.js";
import type {
  GitHubInstallationAuthorizationRecord,
  GitHubWebhookDeliveryRecord,
  ProjectInventoryFileRecord,
  ProjectRepositoryConnectionRecord
} from "./types.js";

const AUTHORIZATION_TTL_MS = 10 * 60 * 1_000;
const LOCAL_SNAPSHOTS_PER_PROJECT = 20;
const LOCAL_JOBS_PER_PROJECT = 50;
const LOCAL_WEBHOOK_DELIVERIES = 1000;
let setupPromise: Promise<void> | undefined;

interface InstallationRow {
  installation_id: string;
  workspace_id: string;
  account_login: string;
  account_type: GitHubInstallation["accountType"];
  repository_selection: GitHubInstallation["repositorySelection"];
  permissions: Record<string, string>;
  linked_by_account_id: string;
  linked_at: Date | string;
  suspended_at: Date | string | null;
}

interface ConnectionRow {
  project_id: string;
  workspace_id: string;
  mode: ProjectRepositoryConnection["mode"];
  status: ProjectRepositoryConnection["status"];
  installation_id: string | null;
  permission_mode: ProjectRepositoryConnection["permissionMode"];
  repository_id: string;
  repository_node_id: string;
  owner: string;
  name: string;
  default_branch: string;
  connected_at: Date | string;
  last_observed_head_sha: string | null;
  last_observed_at: Date | string | null;
}

interface ScanJobRow {
  id: string;
  workspace_id: string;
  project_id: string;
  trigger: ProjectScanJob["trigger"];
  status: ProjectScanJob["status"];
  requested_sha: string | null;
  effective_sha: string | null;
  attempts: number;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  failure: ProjectScanJob["failure"] | null;
}

interface SnapshotRow {
  id: string;
  workspace_id: string;
  project_id: string;
  commit_sha: string;
  tree_sha: string | null;
  detector_version: string;
  trigger: ProjectInventorySnapshot["trigger"];
  created_at: Date | string;
}

interface ArtifactRow {
  snapshot_id: string;
  artifact_id: string;
  kind: ProjectInventoryArtifact["kind"];
  format: ProjectInventoryArtifact["format"];
  path: string;
  name: string;
  description: string;
  digest: string;
  file_count: number;
  size: string | number;
  health: ProjectInventoryArtifact["health"];
  validation_errors: number;
  validation_warnings: number;
  issues: ProjectInventoryArtifact["issues"];
  relationship: ProjectInventoryArtifact["relationship"];
  binding_id: string | null;
  library_asset_id: string | null;
  library_version: number | null;
}

interface PolicyRow {
  project_id: string;
  artifact_path: string;
  ownership: ProjectBindingPolicy["ownership"];
  library_asset_id: string | null;
  pinned_version: number | null;
  decided_by_account_id: string;
  decided_at: Date | string;
}

interface ProposalRow {
  id: string;
  workspace_id: string;
  project_id: string;
  kind: ProjectChangeProposal["kind"];
  status: ProjectChangeProposal["status"];
  base_sha: string;
  branch: string;
  files: ProjectChangeProposal["files"];
  created_by_account_id: string;
  created_at: Date | string;
  updated_at: Date | string;
  pull_number: number | null;
  pull_url: string | null;
  merged_at: Date | string | null;
  failure: string | null;
}

export interface ProjectInventoryFile {
  artifactId: string;
  path: string;
  content: Buffer;
}

export interface ProjectInventoryState {
  connection?: ProjectRepositoryConnectionRecord;
  latestSnapshot?: ProjectInventorySnapshot;
  activeJob?: ProjectScanJob;
  latestJob?: ProjectScanJob;
  policies: ProjectBindingPolicy[];
  proposals: ProjectChangeProposal[];
}

export async function createGitHubInstallationAuthorization(
  accountId: string,
  workspaceId: string,
  redirectPath: string,
  installationId?: string
): Promise<GitHubInstallationAuthorizationRecord> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceAdmin(state, accountId, workspaceId);
    const now = new Date();
    state.githubInstallationAuthorizations = state.githubInstallationAuthorizations.filter(
      (item) => new Date(item.expiresAt).getTime() > now.getTime()
    );
    const authorization: GitHubInstallationAuthorizationRecord = {
      state: randomBytes(32).toString("base64url"),
      accountId,
      workspaceId,
      redirectPath: safeRedirectPath(redirectPath),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + AUTHORIZATION_TTL_MS).toISOString(),
      ...(installationId ? { installationId } : {})
    };
    state.githubInstallationAuthorizations.push(authorization);
    await saveState(state);
    return authorization;
  });
}

export async function consumeGitHubInstallationAuthorization(
  stateValue: string
): Promise<GitHubInstallationAuthorizationRecord> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const index = state.githubInstallationAuthorizations.findIndex(
      (item) => item.state === stateValue
    );
    const authorization = state.githubInstallationAuthorizations[index];
    if (!authorization || new Date(authorization.expiresAt).getTime() <= Date.now()) {
      throw new Error("GitHub installation authorization expired or is invalid.");
    }
    state.githubInstallationAuthorizations.splice(index, 1);
    await saveState(state);
    return authorization;
  });
}

export async function upsertGitHubInstallation(
  installation: GitHubInstallation
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await queryDatabase(
      `insert into harhub_github_installations (
         installation_id, workspace_id, account_login, account_type,
         repository_selection, permissions, linked_by_account_id, linked_at, suspended_at
       ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       on conflict (workspace_id, installation_id) do update set
         account_login = excluded.account_login,
         account_type = excluded.account_type,
         repository_selection = excluded.repository_selection,
         permissions = excluded.permissions,
         linked_by_account_id = excluded.linked_by_account_id,
         suspended_at = excluded.suspended_at`,
      [
        installation.id,
        installation.workspaceId,
        installation.accountLogin,
        installation.accountType,
        installation.repositorySelection,
        JSON.stringify(installation.permissions),
        installation.linkedByAccountId,
        installation.linkedAt,
        installation.suspendedAt ?? null
      ]
    );
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    state.githubInstallations = [
      ...state.githubInstallations.filter((item) =>
        !(item.workspaceId === installation.workspaceId && item.id === installation.id)
      ),
      structuredClone(installation)
    ];
    await saveState(state);
  });
}

export async function listGitHubInstallations(
  accountId: string,
  workspaceId: string
): Promise<GitHubInstallation[]> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  return listGitHubInstallationsInternal(workspaceId);
}

export async function listGitHubInstallationsInternal(
  workspaceId: string
): Promise<GitHubInstallation[]> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<InstallationRow>(
      `select installation_id, workspace_id, account_login, account_type,
              repository_selection, permissions, linked_by_account_id, linked_at, suspended_at
       from harhub_github_installations
       where workspace_id = $1
       order by linked_at desc`,
      [workspaceId]
    );
    return rows.map(installationFromRow);
  }
  const state = await loadState();
  return state.githubInstallations
    .filter((item) => item.workspaceId === workspaceId)
    .sort((left, right) => right.linkedAt.localeCompare(left.linkedAt));
}

export async function getGitHubInstallationInternal(
  workspaceId: string,
  installationId: string
): Promise<GitHubInstallation | undefined> {
  return (await listGitHubInstallationsInternal(workspaceId))
    .find((item) => item.id === installationId);
}

export async function saveProjectRepositoryConnection(
  connection: ProjectRepositoryConnectionRecord
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await queryDatabase(
      `insert into harhub_project_repository_connections (
         project_id, workspace_id, mode, status, installation_id, permission_mode,
         repository_id, repository_node_id, owner, name, default_branch, connected_at,
         last_observed_head_sha, last_observed_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (project_id) do update set
         mode = excluded.mode,
         status = excluded.status,
         installation_id = excluded.installation_id,
         permission_mode = excluded.permission_mode,
         repository_id = excluded.repository_id,
         repository_node_id = excluded.repository_node_id,
         owner = excluded.owner,
         name = excluded.name,
         default_branch = excluded.default_branch,
         last_observed_head_sha = excluded.last_observed_head_sha,
         last_observed_at = excluded.last_observed_at`,
      connectionValues(connection)
    );
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    const conflicting = state.projectRepositoryConnections.find((item) =>
      item.workspaceId === connection.workspaceId &&
      item.repositoryId === connection.repositoryId &&
      item.projectId !== connection.projectId &&
      item.status === "active"
    );
    if (conflicting) throw new Error("This repository is already connected to an active Project.");
    state.projectRepositoryConnections = [
      ...state.projectRepositoryConnections.filter((item) => item.projectId !== connection.projectId),
      structuredClone(connection)
    ];
    await saveState(state);
  });
}

export async function deleteProjectRepositoryConnection(projectId: string): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await queryDatabase("delete from harhub_project_repository_connections where project_id = $1", [projectId]);
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    state.projectRepositoryConnections = state.projectRepositoryConnections
      .filter((connection) => connection.projectId !== projectId);
    await saveState(state);
  });
}

export async function getProjectRepositoryConnectionInternal(
  projectId: string
): Promise<ProjectRepositoryConnectionRecord | undefined> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<ConnectionRow>(
      `select project_id, workspace_id, mode, status, installation_id, permission_mode,
              repository_id, repository_node_id, owner, name, default_branch, connected_at,
              last_observed_head_sha, last_observed_at
       from harhub_project_repository_connections where project_id = $1`,
      [projectId]
    );
    return rows[0] ? connectionFromRow(rows[0]) : undefined;
  }
  return (await loadState()).projectRepositoryConnections.find((item) => item.projectId === projectId);
}

export async function findProjectRepositoryConnection(
  installationId: string,
  repositoryId: string
): Promise<ProjectRepositoryConnectionRecord | undefined> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<ConnectionRow>(
      `select project_id, workspace_id, mode, status, installation_id, permission_mode,
              repository_id, repository_node_id, owner, name, default_branch, connected_at,
              last_observed_head_sha, last_observed_at
       from harhub_project_repository_connections
       where installation_id = $1 and repository_id = $2 and status = 'active'`,
      [installationId, repositoryId]
    );
    return rows[0] ? connectionFromRow(rows[0]) : undefined;
  }
  return (await loadState()).projectRepositoryConnections.find((item) =>
    item.installationId === installationId &&
    item.repositoryId === repositoryId &&
    item.status === "active"
  );
}

export async function listProjectRepositoryConnectionsForInstallation(
  installationId: string
): Promise<ProjectRepositoryConnectionRecord[]> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<ConnectionRow>(
      `select project_id, workspace_id, mode, status, installation_id, permission_mode,
              repository_id, repository_node_id, owner, name, default_branch, connected_at,
              last_observed_head_sha, last_observed_at
       from harhub_project_repository_connections
       where installation_id = $1`,
      [installationId]
    );
    return rows.map(connectionFromRow);
  }
  return (await loadState()).projectRepositoryConnections
    .filter((item) => item.installationId === installationId);
}

export async function updateProjectConnectionObservation(
  projectId: string,
  input: { headSha: string; observedAt: string; owner?: string; name?: string; defaultBranch?: string }
): Promise<void> {
  const connection = await getProjectRepositoryConnectionInternal(projectId);
  if (!connection) throw new Error("Project repository connection not found.");
  await saveProjectRepositoryConnection({
    ...connection,
    ...(input.owner ? { owner: input.owner } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.defaultBranch ? { defaultBranch: input.defaultBranch } : {}),
    lastObservedHeadSha: input.headSha,
    lastObservedAt: input.observedAt
  });
}

export async function updateProjectRepositoryConnectionStatus(
  projectId: string,
  status: ProjectRepositoryConnection["status"]
): Promise<void> {
  const connection = await getProjectRepositoryConnectionInternal(projectId);
  if (!connection) return;
  await saveProjectRepositoryConnection({ ...connection, status });
}

export async function createProjectScanJob(input: {
  workspaceId: string;
  projectId: string;
  trigger: ProjectScanJob["trigger"];
  requestedSha?: string;
  attempts?: number;
}): Promise<ProjectScanJob> {
  const job: ProjectScanJob = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    trigger: input.trigger,
    status: "queued",
    ...(input.requestedSha ? { requestedSha: input.requestedSha } : {}),
    attempts: input.attempts ?? 0,
    createdAt: new Date().toISOString()
  };
  await writeScanJob(job);
  return job;
}

export async function markProjectScanRunning(jobId: string): Promise<ProjectScanJob> {
  const job = await getProjectScanJob(jobId);
  if (!job) throw new Error("Project scan job not found.");
  if (job.status !== "queued" && job.status !== "running") return job;
  const updated: ProjectScanJob = {
    ...job,
    status: "running",
    attempts: job.attempts + 1,
    startedAt: new Date().toISOString()
  };
  delete updated.completedAt;
  delete updated.failure;
  await writeScanJob(updated);
  return updated;
}

export async function failProjectScan(
  jobId: string,
  failure: NonNullable<ProjectScanJob["failure"]>
): Promise<ProjectScanJob> {
  const job = await getProjectScanJob(jobId);
  if (!job) throw new Error("Project scan job not found.");
  const updated: ProjectScanJob = {
    ...job,
    status: "failed",
    completedAt: new Date().toISOString(),
    failure
  };
  await writeScanJob(updated);
  return updated;
}

export async function supersedeQueuedProjectScans(
  projectId: string,
  exceptJobId: string
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await queryDatabase(
      `update harhub_project_scan_jobs
       set status = 'superseded', completed_at = now()
       where project_id = $1 and id <> $2 and status = 'queued'`,
      [projectId, exceptJobId]
    );
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    const now = new Date().toISOString();
    state.projectScanJobs = state.projectScanJobs.map((job) =>
      job.projectId === projectId && job.id !== exceptJobId && job.status === "queued"
        ? { ...job, status: "superseded", completedAt: now }
        : job
    );
    await saveState(state);
  });
}

export async function completeProjectScan(
  jobId: string,
  snapshot: ProjectInventorySnapshot,
  files: ProjectInventoryFile[]
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await withDatabaseTransaction(async (client) => {
      await insertSnapshot(client, snapshot, files);
      await client.query(
        `update harhub_project_scan_jobs
         set status = 'succeeded', effective_sha = $2, completed_at = $3, failure = null
         where id = $1`,
        [jobId, snapshot.commitSha, snapshot.createdAt]
      );
      await pruneDatabaseProjectHistory(client, snapshot.projectId);
    });
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    const job = state.projectScanJobs.find((item) => item.id === jobId);
    if (!job) throw new Error("Project scan job not found.");
    Object.assign(job, {
      status: "succeeded",
      effectiveSha: snapshot.commitSha,
      completedAt: snapshot.createdAt
    });
    delete job.failure;
    state.projectInventorySnapshots.push(structuredClone(snapshot));
    state.projectInventoryFiles.push(...files.map((file) => ({
      snapshotId: snapshot.id,
      artifactId: file.artifactId,
      path: file.path,
      contentBase64: file.content.toString("base64")
    })));
    pruneLocalProjectHistory(state, snapshot.projectId);
    await saveState(state);
  });
}

export async function listRecoverableProjectScanJobs(): Promise<ProjectScanJob[]> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<ScanJobRow>(
      `select id, workspace_id, project_id, trigger, status, requested_sha, effective_sha,
              attempts, created_at, started_at, completed_at, failure
       from harhub_project_scan_jobs
       where status in ('queued', 'running')
       order by created_at asc`
    );
    return rows.map(scanJobFromRow);
  }
  return (await loadState()).projectScanJobs
    .filter((job) => job.status === "queued" || job.status === "running")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function getProjectInventoryState(
  accountId: string,
  workspaceId: string,
  projectId: string
): Promise<ProjectInventoryState> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  if (!state.projects.some((project) => project.id === projectId && project.workspaceId === workspaceId)) {
    throw new Error("Project not found.");
  }
  return getProjectInventoryStateInternal(workspaceId, projectId);
}

export async function getProjectInventoryStateInternal(
  workspaceId: string,
  projectId: string
): Promise<ProjectInventoryState> {
  const [connection, snapshots, jobs, policies, proposals] = await Promise.all([
    getProjectRepositoryConnectionInternal(projectId),
    listProjectSnapshots(projectId, 1),
    listProjectScanJobs(projectId, 20),
    listProjectBindingPolicies(projectId),
    listProjectChangeProposals(projectId)
  ]);
  if (connection && connection.workspaceId !== workspaceId) throw new Error("Project not found.");
  return {
    ...(connection ? { connection } : {}),
    ...(snapshots[0] ? { latestSnapshot: snapshots[0] } : {}),
    ...(jobs.find((job) => job.status === "queued" || job.status === "running")
      ? { activeJob: jobs.find((job) => job.status === "queued" || job.status === "running") }
      : {}),
    ...(jobs[0] ? { latestJob: jobs[0] } : {}),
    policies,
    proposals
  };
}

export async function readProjectInventoryFile(
  workspaceId: string,
  projectId: string,
  snapshotId: string,
  artifactId: string,
  filePath: string
): Promise<Buffer | undefined> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<{ content: Buffer }>(
      `select file.content
       from harhub_project_inventory_files as file
       join harhub_project_inventory_snapshots as snapshot on snapshot.id = file.snapshot_id
       where snapshot.workspace_id = $1 and snapshot.project_id = $2 and snapshot.id = $3
         and file.artifact_id = $4 and file.path = $5`,
      [workspaceId, projectId, snapshotId, artifactId, filePath]
    );
    return rows[0]?.content;
  }
  const state = await loadState();
  const snapshot = state.projectInventorySnapshots.find((item) =>
    item.id === snapshotId && item.workspaceId === workspaceId && item.projectId === projectId
  );
  if (!snapshot) return undefined;
  const file = state.projectInventoryFiles.find((item) =>
    item.snapshotId === snapshotId && item.artifactId === artifactId && item.path === filePath
  );
  return file ? Buffer.from(file.contentBase64, "base64") : undefined;
}

export async function upsertProjectBindingPolicy(
  policy: ProjectBindingPolicy
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await queryDatabase(
      `insert into harhub_project_binding_policies (
         project_id, artifact_path, ownership, library_asset_id, pinned_version,
         decided_by_account_id, decided_at
       ) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (project_id, artifact_path) do update set
         ownership = excluded.ownership,
         library_asset_id = excluded.library_asset_id,
         pinned_version = excluded.pinned_version,
         decided_by_account_id = excluded.decided_by_account_id,
         decided_at = excluded.decided_at`,
      [
        policy.projectId,
        policy.artifactPath,
        policy.ownership,
        policy.libraryAssetId ?? null,
        policy.pinnedVersion ?? null,
        policy.decidedByAccountId,
        policy.decidedAt
      ]
    );
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    state.projectBindingPolicies = [
      ...state.projectBindingPolicies.filter((item) =>
        !(item.projectId === policy.projectId && item.artifactPath === policy.artifactPath)
      ),
      structuredClone(policy)
    ];
    await saveState(state);
  });
}

export async function saveProjectChangeProposal(proposal: ProjectChangeProposal): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await queryDatabase(
      `insert into harhub_project_change_proposals (
         id, workspace_id, project_id, kind, status, base_sha, branch, files,
         created_by_account_id, created_at, updated_at, pull_number, pull_url, merged_at, failure
       ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do update set
         status = excluded.status,
         updated_at = excluded.updated_at,
         pull_number = excluded.pull_number,
         pull_url = excluded.pull_url,
         merged_at = excluded.merged_at,
         failure = excluded.failure`,
      proposalValues(proposal)
    );
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    state.projectChangeProposals = [
      ...state.projectChangeProposals.filter((item) => item.id !== proposal.id),
      structuredClone(proposal)
    ];
    await saveState(state);
  });
}

export async function getProjectChangeProposal(
  projectId: string,
  proposalId: string
): Promise<ProjectChangeProposal | undefined> {
  return (await listProjectChangeProposals(projectId)).find((item) => item.id === proposalId);
}

export async function claimGitHubWebhookDelivery(
  delivery: GitHubWebhookDeliveryRecord
): Promise<boolean> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<{ delivery_id: string }>(
      `insert into harhub_github_webhook_deliveries (
         delivery_id, event, action, installation_id, repository_id, status, received_at
       ) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (delivery_id) do nothing
       returning delivery_id`,
      [
        delivery.deliveryId,
        delivery.event,
        delivery.action ?? null,
        delivery.installationId ?? null,
        delivery.repositoryId ?? null,
        delivery.status,
        delivery.receivedAt
      ]
    );
    return rows.length === 1;
  }
  return serializeStateAccess(async () => {
    const state = await loadState();
    if (state.githubWebhookDeliveries.some((item) => item.deliveryId === delivery.deliveryId)) {
      return false;
    }
    state.githubWebhookDeliveries.push(structuredClone(delivery));
    state.githubWebhookDeliveries = state.githubWebhookDeliveries.slice(-LOCAL_WEBHOOK_DELIVERIES);
    await saveState(state);
    return true;
  });
}

export async function finishGitHubWebhookDelivery(
  deliveryId: string,
  input: { status: GitHubWebhookDeliveryRecord["status"]; error?: string }
): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await queryDatabase(
      `update harhub_github_webhook_deliveries
       set status = $2, processed_at = now(), error = $3
       where delivery_id = $1`,
      [deliveryId, input.status, input.error ?? null]
    );
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    const delivery = state.githubWebhookDeliveries.find((item) => item.deliveryId === deliveryId);
    if (delivery) {
      delivery.status = input.status;
      delivery.processedAt = new Date().toISOString();
      if (input.error) delivery.error = input.error;
      else delete delivery.error;
      await saveState(state);
    }
  });
}

async function writeScanJob(job: ProjectScanJob): Promise<void> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    await queryDatabase(
      `insert into harhub_project_scan_jobs (
         id, workspace_id, project_id, trigger, status, requested_sha, effective_sha,
         attempts, created_at, started_at, completed_at, failure
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       on conflict (id) do update set
         status = excluded.status,
         effective_sha = excluded.effective_sha,
         attempts = excluded.attempts,
         started_at = excluded.started_at,
         completed_at = excluded.completed_at,
         failure = excluded.failure`,
      scanJobValues(job)
    );
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    state.projectScanJobs = [
      ...state.projectScanJobs.filter((item) => item.id !== job.id),
      structuredClone(job)
    ];
    pruneLocalProjectHistory(state, job.projectId);
    await saveState(state);
  });
}

async function getProjectScanJob(jobId: string): Promise<ProjectScanJob | undefined> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<ScanJobRow>(
      `select id, workspace_id, project_id, trigger, status, requested_sha, effective_sha,
              attempts, created_at, started_at, completed_at, failure
       from harhub_project_scan_jobs where id = $1`,
      [jobId]
    );
    return rows[0] ? scanJobFromRow(rows[0]) : undefined;
  }
  return (await loadState()).projectScanJobs.find((item) => item.id === jobId);
}

async function listProjectScanJobs(projectId: string, limit: number): Promise<ProjectScanJob[]> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<ScanJobRow>(
      `select id, workspace_id, project_id, trigger, status, requested_sha, effective_sha,
              attempts, created_at, started_at, completed_at, failure
       from harhub_project_scan_jobs
       where project_id = $1 order by created_at desc limit $2`,
      [projectId, limit]
    );
    return rows.map(scanJobFromRow);
  }
  return (await loadState()).projectScanJobs
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

async function listProjectSnapshots(
  projectId: string,
  limit: number
): Promise<ProjectInventorySnapshot[]> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const snapshots = await queryDatabase<SnapshotRow>(
      `select id, workspace_id, project_id, commit_sha, tree_sha, detector_version, trigger, created_at
       from harhub_project_inventory_snapshots
       where project_id = $1 order by created_at desc limit $2`,
      [projectId, limit]
    );
    if (snapshots.length === 0) return [];
    const artifacts = await queryDatabase<ArtifactRow>(
      `select snapshot_id, artifact_id, kind, format, path, name, description, digest,
              file_count, size, health, validation_errors, validation_warnings, issues,
              relationship, binding_id, library_asset_id, library_version
       from harhub_project_inventory_artifacts
       where snapshot_id = any($1::text[])
       order by kind, path`,
      [snapshots.map((snapshot) => snapshot.id)]
    );
    const bySnapshot = new Map<string, ProjectInventoryArtifact[]>();
    for (const row of artifacts) {
      const values = bySnapshot.get(row.snapshot_id) ?? [];
      values.push(artifactFromRow(row));
      bySnapshot.set(row.snapshot_id, values);
    }
    return snapshots.map((row) => snapshotFromRow(row, bySnapshot.get(row.id) ?? []));
  }
  return (await loadState()).projectInventorySnapshots
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

async function listProjectBindingPolicies(projectId: string): Promise<ProjectBindingPolicy[]> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<PolicyRow>(
      `select project_id, artifact_path, ownership, library_asset_id, pinned_version,
              decided_by_account_id, decided_at
       from harhub_project_binding_policies where project_id = $1 order by artifact_path`,
      [projectId]
    );
    return rows.map(policyFromRow);
  }
  return (await loadState()).projectBindingPolicies
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => left.artifactPath.localeCompare(right.artifactPath));
}

async function listProjectChangeProposals(projectId: string): Promise<ProjectChangeProposal[]> {
  if (isDatabaseStateEnabled()) {
    await ensureRepositoryDatabase();
    const rows = await queryDatabase<ProposalRow>(
      `select id, workspace_id, project_id, kind, status, base_sha, branch, files,
              created_by_account_id, created_at, updated_at, pull_number, pull_url, merged_at, failure
       from harhub_project_change_proposals where project_id = $1 order by created_at desc`,
      [projectId]
    );
    return rows.map(proposalFromRow);
  }
  return (await loadState()).projectChangeProposals
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function ensureRepositoryDatabase(): Promise<void> {
  setupPromise ??= setupRepositoryDatabase();
  return setupPromise;
}

async function setupRepositoryDatabase(): Promise<void> {
  const statements = [
    `create table if not exists harhub_github_installations (
      installation_id text not null,
      workspace_id text not null,
      account_login text not null,
      account_type text not null,
      repository_selection text not null,
      permissions jsonb not null default '{}'::jsonb,
      linked_by_account_id text not null,
      linked_at timestamptz not null,
      suspended_at timestamptz,
      primary key (workspace_id, installation_id)
    )`,
    `create table if not exists harhub_project_repository_connections (
      project_id text primary key,
      workspace_id text not null,
      mode text not null,
      status text not null,
      installation_id text,
      permission_mode text not null,
      repository_id text not null,
      repository_node_id text not null,
      owner text not null,
      name text not null,
      default_branch text not null,
      connected_at timestamptz not null,
      last_observed_head_sha text,
      last_observed_at timestamptz
    )`,
    `create unique index if not exists harhub_project_repository_active_idx
     on harhub_project_repository_connections (workspace_id, repository_id)
     where status = 'active'`,
    `create index if not exists harhub_project_repository_installation_idx
     on harhub_project_repository_connections (installation_id, repository_id)`,
    `create table if not exists harhub_project_scan_jobs (
      id text primary key,
      workspace_id text not null,
      project_id text not null,
      trigger text not null,
      status text not null,
      requested_sha text,
      effective_sha text,
      attempts integer not null default 0,
      created_at timestamptz not null,
      started_at timestamptz,
      completed_at timestamptz,
      failure jsonb
    )`,
    `create index if not exists harhub_project_scan_jobs_project_time_idx
     on harhub_project_scan_jobs (project_id, created_at desc)`,
    `create table if not exists harhub_project_inventory_snapshots (
      id text primary key,
      workspace_id text not null,
      project_id text not null,
      commit_sha text not null,
      tree_sha text,
      detector_version text not null,
      trigger text not null,
      created_at timestamptz not null,
      unique (project_id, commit_sha, detector_version)
    )`,
    `create index if not exists harhub_project_inventory_project_time_idx
     on harhub_project_inventory_snapshots (project_id, created_at desc)`,
    `create table if not exists harhub_project_inventory_artifacts (
      snapshot_id text not null,
      artifact_id text not null,
      kind text not null,
      format text not null,
      path text not null,
      name text not null,
      description text not null,
      digest text not null,
      file_count integer not null,
      size bigint not null,
      health text not null,
      validation_errors integer not null,
      validation_warnings integer not null,
      issues jsonb not null default '[]'::jsonb,
      relationship text not null,
      binding_id text,
      library_asset_id text,
      library_version integer,
      primary key (snapshot_id, artifact_id)
    )`,
    `create index if not exists harhub_project_inventory_artifact_digest_idx
     on harhub_project_inventory_artifacts (digest)`,
    `create table if not exists harhub_project_inventory_files (
      snapshot_id text not null,
      artifact_id text not null,
      path text not null,
      content bytea not null,
      primary key (snapshot_id, artifact_id, path)
    )`,
    `create table if not exists harhub_project_binding_policies (
      project_id text not null,
      artifact_path text not null,
      ownership text not null,
      library_asset_id text,
      pinned_version integer,
      decided_by_account_id text not null,
      decided_at timestamptz not null,
      primary key (project_id, artifact_path)
    )`,
    `create table if not exists harhub_project_change_proposals (
      id text primary key,
      workspace_id text not null,
      project_id text not null,
      kind text not null,
      status text not null,
      base_sha text not null,
      branch text not null,
      files jsonb not null default '[]'::jsonb,
      created_by_account_id text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      pull_number integer,
      pull_url text,
      merged_at timestamptz,
      failure text
    )`,
    `create index if not exists harhub_project_change_proposals_project_time_idx
     on harhub_project_change_proposals (project_id, created_at desc)`,
    `create table if not exists harhub_github_webhook_deliveries (
      delivery_id text primary key,
      event text not null,
      action text,
      installation_id text,
      repository_id text,
      status text not null,
      received_at timestamptz not null,
      processed_at timestamptz,
      error text
    )`
  ];
  for (const statement of statements) await queryDatabase(statement);
}

async function insertSnapshot(
  client: PoolClient,
  snapshot: ProjectInventorySnapshot,
  files: ProjectInventoryFile[]
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `select id from harhub_project_inventory_snapshots
     where project_id = $1 and commit_sha = $2 and detector_version = $3
     for update`,
    [snapshot.projectId, snapshot.commitSha, snapshot.detectorVersion]
  );
  const replacedId = existing.rows[0]?.id;
  if (replacedId && replacedId !== snapshot.id) {
    await client.query("delete from harhub_project_inventory_artifacts where snapshot_id = $1", [replacedId]);
    await client.query("delete from harhub_project_inventory_files where snapshot_id = $1", [replacedId]);
    await client.query("delete from harhub_project_inventory_snapshots where id = $1", [replacedId]);
  }
  await client.query(
    `insert into harhub_project_inventory_snapshots (
       id, workspace_id, project_id, commit_sha, tree_sha, detector_version, trigger, created_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (project_id, commit_sha, detector_version) do update set
       tree_sha = excluded.tree_sha,
       trigger = excluded.trigger,
       created_at = excluded.created_at`,
    [
      snapshot.id,
      snapshot.workspaceId,
      snapshot.projectId,
      snapshot.commitSha,
      snapshot.treeSha ?? null,
      snapshot.detectorVersion,
      snapshot.trigger,
      snapshot.createdAt
    ]
  );
  await client.query("delete from harhub_project_inventory_artifacts where snapshot_id = $1", [snapshot.id]);
  await client.query("delete from harhub_project_inventory_files where snapshot_id = $1", [snapshot.id]);
  for (const artifact of snapshot.artifacts) {
    await client.query(
      `insert into harhub_project_inventory_artifacts (
         snapshot_id, artifact_id, kind, format, path, name, description, digest,
         file_count, size, health, validation_errors, validation_warnings, issues,
         relationship, binding_id, library_asset_id, library_version
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18)`,
      [
        snapshot.id,
        artifact.id,
        artifact.kind,
        artifact.format,
        artifact.path,
        artifact.name,
        artifact.description,
        artifact.digest,
        artifact.fileCount,
        artifact.size,
        artifact.health,
        artifact.validation.errors,
        artifact.validation.warnings,
        JSON.stringify(artifact.issues),
        artifact.relationship,
        artifact.bindingId ?? null,
        artifact.libraryAssetId ?? null,
        artifact.libraryVersion ?? null
      ]
    );
  }
  for (const file of files) {
    await client.query(
      `insert into harhub_project_inventory_files (snapshot_id, artifact_id, path, content)
       values ($1,$2,$3,$4)`,
      [snapshot.id, file.artifactId, file.path, file.content]
    );
  }
}

async function pruneDatabaseProjectHistory(client: PoolClient, projectId: string): Promise<void> {
  const removedSnapshots = await client.query<{ id: string }>(
    `select id from harhub_project_inventory_snapshots
     where project_id = $1
     order by created_at desc
     offset $2`,
    [projectId, LOCAL_SNAPSHOTS_PER_PROJECT]
  );
  const removedIds = removedSnapshots.rows.map((row) => row.id);
  if (removedIds.length > 0) {
    await client.query(
      "delete from harhub_project_inventory_artifacts where snapshot_id = any($1::text[])",
      [removedIds]
    );
    await client.query(
      "delete from harhub_project_inventory_files where snapshot_id = any($1::text[])",
      [removedIds]
    );
    await client.query(
      "delete from harhub_project_inventory_snapshots where id = any($1::text[])",
      [removedIds]
    );
  }
  await client.query(
    `delete from harhub_project_scan_jobs
     where id in (
       select id from harhub_project_scan_jobs
       where project_id = $1
       order by created_at desc
       offset $2
     )`,
    [projectId, LOCAL_JOBS_PER_PROJECT]
  );
}

function pruneLocalProjectHistory(
  state: Awaited<ReturnType<typeof loadState>>,
  projectId: string
): void {
  const retainedSnapshots = state.projectInventorySnapshots
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, LOCAL_SNAPSHOTS_PER_PROJECT);
  const retainedSnapshotIds = new Set(retainedSnapshots.map((item) => item.id));
  state.projectInventorySnapshots = [
    ...state.projectInventorySnapshots.filter((item) => item.projectId !== projectId),
    ...retainedSnapshots
  ];
  state.projectInventoryFiles = state.projectInventoryFiles.filter((item) =>
    retainedSnapshotIds.has(item.snapshotId) ||
    state.projectInventorySnapshots.some((snapshot) => snapshot.id === item.snapshotId)
  );
  const retainedJobs = state.projectScanJobs
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, LOCAL_JOBS_PER_PROJECT);
  state.projectScanJobs = [
    ...state.projectScanJobs.filter((item) => item.projectId !== projectId),
    ...retainedJobs
  ];
}

function installationFromRow(row: InstallationRow): GitHubInstallation {
  return {
    id: row.installation_id,
    workspaceId: row.workspace_id,
    accountLogin: row.account_login,
    accountType: row.account_type,
    repositorySelection: row.repository_selection,
    permissions: row.permissions ?? {},
    linkedByAccountId: row.linked_by_account_id,
    linkedAt: timestamp(row.linked_at),
    ...(row.suspended_at ? { suspendedAt: timestamp(row.suspended_at) } : {})
  };
}

function connectionFromRow(row: ConnectionRow): ProjectRepositoryConnectionRecord {
  return {
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    mode: row.mode,
    status: row.status,
    ...(row.installation_id ? { installationId: row.installation_id } : {}),
    permissionMode: row.permission_mode,
    repositoryId: row.repository_id,
    repositoryNodeId: row.repository_node_id,
    owner: row.owner,
    name: row.name,
    defaultBranch: row.default_branch,
    connectedAt: timestamp(row.connected_at),
    ...(row.last_observed_head_sha ? { lastObservedHeadSha: row.last_observed_head_sha } : {}),
    ...(row.last_observed_at ? { lastObservedAt: timestamp(row.last_observed_at) } : {})
  };
}

function scanJobFromRow(row: ScanJobRow): ProjectScanJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    trigger: row.trigger,
    status: row.status,
    ...(row.requested_sha ? { requestedSha: row.requested_sha } : {}),
    ...(row.effective_sha ? { effectiveSha: row.effective_sha } : {}),
    attempts: row.attempts,
    createdAt: timestamp(row.created_at),
    ...(row.started_at ? { startedAt: timestamp(row.started_at) } : {}),
    ...(row.completed_at ? { completedAt: timestamp(row.completed_at) } : {}),
    ...(row.failure ? { failure: row.failure } : {})
  };
}

function snapshotFromRow(
  row: SnapshotRow,
  artifacts: ProjectInventoryArtifact[]
): ProjectInventorySnapshot {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    commitSha: row.commit_sha,
    ...(row.tree_sha ? { treeSha: row.tree_sha } : {}),
    detectorVersion: row.detector_version,
    trigger: row.trigger,
    artifacts,
    createdAt: timestamp(row.created_at)
  };
}

function artifactFromRow(row: ArtifactRow): ProjectInventoryArtifact {
  return {
    id: row.artifact_id,
    kind: row.kind,
    format: row.format,
    path: row.path,
    name: row.name,
    description: row.description,
    digest: row.digest,
    fileCount: row.file_count,
    size: Number(row.size),
    health: row.health,
    validation: { errors: row.validation_errors, warnings: row.validation_warnings },
    issues: row.issues ?? [],
    relationship: row.relationship,
    ...(row.binding_id ? { bindingId: row.binding_id } : {}),
    ...(row.library_asset_id ? { libraryAssetId: row.library_asset_id } : {}),
    ...(row.library_version ? { libraryVersion: row.library_version } : {})
  };
}

function policyFromRow(row: PolicyRow): ProjectBindingPolicy {
  return {
    projectId: row.project_id,
    artifactPath: row.artifact_path,
    ownership: row.ownership,
    ...(row.library_asset_id ? { libraryAssetId: row.library_asset_id } : {}),
    ...(row.pinned_version ? { pinnedVersion: row.pinned_version } : {}),
    decidedByAccountId: row.decided_by_account_id,
    decidedAt: timestamp(row.decided_at)
  };
}

function proposalFromRow(row: ProposalRow): ProjectChangeProposal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    kind: row.kind,
    status: row.status,
    baseSha: row.base_sha,
    branch: row.branch,
    files: row.files ?? [],
    createdByAccountId: row.created_by_account_id,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    ...(row.pull_number ? { pullNumber: row.pull_number } : {}),
    ...(row.pull_url ? { pullUrl: row.pull_url } : {}),
    ...(row.merged_at ? { mergedAt: timestamp(row.merged_at) } : {}),
    ...(row.failure ? { failure: row.failure } : {})
  };
}

function connectionValues(connection: ProjectRepositoryConnectionRecord): unknown[] {
  return [
    connection.projectId,
    connection.workspaceId,
    connection.mode,
    connection.status,
    connection.installationId ?? null,
    connection.permissionMode,
    connection.repositoryId,
    connection.repositoryNodeId,
    connection.owner,
    connection.name,
    connection.defaultBranch,
    connection.connectedAt,
    connection.lastObservedHeadSha ?? null,
    connection.lastObservedAt ?? null
  ];
}

function scanJobValues(job: ProjectScanJob): unknown[] {
  return [
    job.id,
    job.workspaceId,
    job.projectId,
    job.trigger,
    job.status,
    job.requestedSha ?? null,
    job.effectiveSha ?? null,
    job.attempts,
    job.createdAt,
    job.startedAt ?? null,
    job.completedAt ?? null,
    job.failure ? JSON.stringify(job.failure) : null
  ];
}

function proposalValues(proposal: ProjectChangeProposal): unknown[] {
  return [
    proposal.id,
    proposal.workspaceId,
    proposal.projectId,
    proposal.kind,
    proposal.status,
    proposal.baseSha,
    proposal.branch,
    JSON.stringify(proposal.files),
    proposal.createdByAccountId,
    proposal.createdAt,
    proposal.updatedAt,
    proposal.pullNumber ?? null,
    proposal.pullUrl ?? null,
    proposal.mergedAt ?? null,
    proposal.failure ?? null
  ];
}

function safeRedirectPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/projects";
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
