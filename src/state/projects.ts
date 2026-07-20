import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import {
  addProjectIntegrationFiles,
  frameworkContentDigest
} from "../features/projects/framework.js";
import { slugify } from "../shared/markdown.js";
import type {
  HarhubProject,
  ProjectBinding,
  ProjectListResponse,
  ProjectRepository,
  ProjectSkillForkSummary,
  ProjectSyncRequest,
  ProjectSyncResponse,
  ProjectTokenResponse,
  StoredObject,
  ValidationIssue
} from "../shared/types.js";
import { serializeStateAccess } from "./access.js";
import { requireWorkspaceMembership } from "./records.js";
import { loadState, saveState } from "./store.js";
import type {
  AppState,
  ForgeSessionCacheRecord,
  ProjectSkillForkRecord,
  ProjectStateRecord
} from "./types.js";

const MAX_PROJECTS_PER_WORKSPACE = 500;
const FORGE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export function listProjects(
  accountId: string,
  workspaceId: string
): Promise<ProjectListResponse> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, accountId, workspaceId);
    return {
      projects: state.projects
        .filter((project) => project.workspaceId === workspaceId)
        .sort(projectsNewestFirst)
        .map(toPublicProject)
    };
  });
}

export function getProject(
  accountId: string,
  workspaceId: string,
  projectId: string
): Promise<HarhubProject> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, accountId, workspaceId);
    return toPublicProject(findProject(state, workspaceId, projectId));
  });
}

export function createProject(input: {
  accountId: string;
  workspaceId: string;
  name: string;
  description: string;
  repository?: ProjectRepository;
}): Promise<ProjectTokenResponse> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, input.accountId, input.workspaceId);
    assertProjectCapacity(state, input.workspaceId);
    const created = createProjectRecord(state, input);
    state.projects.push(created.project);
    await saveState(state);
    return {
      project: toPublicProject(created.project),
      syncToken: created.syncToken
    };
  });
}

export function freezeForgeSessionAsProject(input: {
  accountId: string;
  workspaceId: string;
  sessionId: string;
  name: string;
  description?: string;
  apiBaseUrl: string;
  assetDigests: Readonly<Record<string, string>>;
}): Promise<ProjectTokenResponse> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, input.accountId, input.workspaceId);
    const session = findForgeSession(state, input.accountId, input.workspaceId, input.sessionId);
    if (session.status !== "complete" || !session.template) {
      throw new Error("Only a completed Forge session can be frozen as a Project.");
    }
    if (session.frozenProject) {
      const existing = findProject(state, input.workspaceId, session.frozenProject.id);
      return { project: toPublicProject(existing) };
    }

    assertProjectCapacity(state, input.workspaceId);
    const bindings = initialProjectBindings(session, input.assetDigests);
    const created = createProjectRecord(state, {
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description ?? session.template.profile.summary,
      bindings,
      sourceForgeSessionId: session.id
    });
    const syncUrl = `${input.apiBaseUrl.replace(/\/+$/, "")}/api/projects/${created.project.id}/sync`;
    session.template.files = addProjectIntegrationFiles(
      session.template.files,
      session.template.selectedAssets,
      {
        projectId: created.project.id,
        syncUrl,
        bindings: created.project.bindings
      }
    );
    const now = new Date();
    session.frozenProject = {
      id: created.project.id,
      name: created.project.name,
      frozenAt: now.toISOString()
    };
    session.updatedAt = now.toISOString();
    session.expiresAt = new Date(now.getTime() + FORGE_SESSION_TTL_MS).toISOString();
    state.projects.push(created.project);
    await saveState(state);
    return {
      project: toPublicProject(created.project),
      syncToken: created.syncToken
    };
  });
}

export function connectProjectRepository(
  accountId: string,
  workspaceId: string,
  projectId: string,
  repository: ProjectRepository
): Promise<ProjectTokenResponse> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, accountId, workspaceId);
    const project = findProject(state, workspaceId, projectId);
    if (project.status !== "active") {
      throw new Error("Archived Projects cannot connect repositories.");
    }
    const credential = createSyncCredential();
    project.repository = structuredClone(repository);
    project.bindings = project.bindings.map((binding) => {
      const {
        repositoryDigest: _repositoryDigest,
        lastSeenAt: _lastSeenAt,
        ...retained
      } = binding;
      return { ...retained, status: "pending" };
    });
    project.sync = { status: "awaiting-first-sync", revision: 0 };
    project.syncTokenConfigured = true;
    project.syncTokenLastFour = credential.token.slice(-4);
    project.syncTokenHash = credential.hash;
    project.skillForkGeneration = (project.skillForkGeneration ?? 0) + 1;
    project.updatedAt = new Date().toISOString();
    await saveState(state);
    return {
      project: toPublicProject(project),
      syncToken: credential.token
    };
  });
}

export function rotateProjectSyncToken(
  accountId: string,
  workspaceId: string,
  projectId: string
): Promise<ProjectTokenResponse> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, accountId, workspaceId);
    const project = findProject(state, workspaceId, projectId);
    if (project.status !== "active") throw new Error("Archived Projects cannot rotate tokens.");
    if (!project.repository) throw new Error("Connect a GitHub repository before rotating tokens.");
    const credential = createSyncCredential();
    project.syncTokenHash = credential.hash;
    project.syncTokenLastFour = credential.token.slice(-4);
    project.updatedAt = new Date().toISOString();
    await saveState(state);
    return { project: toPublicProject(project), syncToken: credential.token };
  });
}

export function archiveProject(
  accountId: string,
  workspaceId: string,
  projectId: string
): Promise<HarhubProject> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, accountId, workspaceId);
    const project = findProject(state, workspaceId, projectId);
    if (project.status !== "archived") {
      const now = new Date().toISOString();
      project.status = "archived";
      project.archivedAt = now;
      project.updatedAt = now;
      await saveState(state);
    }
    return toPublicProject(project);
  });
}

export interface ProjectSyncAuthorization {
  workspaceId: string;
  generation: number;
  bindings: ProjectBinding[];
  skillForks: ProjectSkillForkRecord[];
}

export interface ProjectSkillForkUpdate extends ProjectSkillForkSummary {
  path: string;
  storage: StoredObject;
  validationIssues: ValidationIssue[];
}

export interface ProjectBindingBaselineUpdate {
  path: string;
  assetId?: string;
  digest?: string;
}

export function authorizeProjectSync(
  projectId: string,
  token: string,
  repository: string
): Promise<ProjectSyncAuthorization> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const project = requireProjectSyncAccess(state, projectId, token, repository);
    return {
      workspaceId: project.workspaceId,
      generation: project.skillForkGeneration ?? 0,
      bindings: structuredClone(project.bindings),
      skillForks: structuredClone(project.skillForks ?? [])
    };
  });
}

export function syncProjectFromRepository(
  projectId: string,
  token: string,
  input: ProjectSyncRequest,
  forkUpdates: ProjectSkillForkUpdate[] = [],
  expectedGeneration?: number,
  baselineUpdates: ProjectBindingBaselineUpdate[] = []
): Promise<ProjectSyncResponse> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const project = requireProjectSyncAccess(state, projectId, token, input.repository);
    if (
      expectedGeneration !== undefined &&
      (project.skillForkGeneration ?? 0) !== expectedGeneration
    ) {
      throw new Error("Project changed while this repository sync was being prepared. Retry the sync.");
    }

    const now = new Date().toISOString();
    const incoming = new Map(input.bindings.map((binding) => [bindingKey(binding), binding]));
    const existingForks = new Map(
      (project.skillForks ?? []).map((fork) => [fork.path, fork])
    );
    const updatedForks = new Map(forkUpdates.map((fork) => [fork.path, fork]));
    const baselines = new Map(baselineUpdates.map((baseline) => [baseline.path, baseline]));
    const nextForks: ProjectSkillForkRecord[] = [];
    const nextBindings: ProjectBinding[] = project.bindings.map((binding) => {
      const observed = incoming.get(bindingKey(binding));
      if (!observed) {
        const { fork: _fork, ...retained } = binding;
        return { ...retained, status: "missing" };
      }
      incoming.delete(bindingKey(binding));
      const forkUpdate = updatedForks.get(binding.path);
      const baseline = baselines.get(binding.path);
      const baselineResolved = baselines.has(binding.path);
      const status = projectBindingStatus(
        binding,
        observed.digest,
        baseline?.digest,
        baselineResolved
      );
      const fork = status === "added" || status === "modified"
        ? forkUpdate ?? existingForks.get(binding.path)
        : undefined;
      if (fork) nextForks.push(structuredClone(fork));
      const retained = { ...binding };
      delete retained.fork;
      if (baselineResolved) {
        delete retained.assetId;
        delete retained.sourceDigest;
        retained.source = baseline?.assetId ? "harhub" : "repository";
      }
      return {
        ...retained,
        name: observed.name,
        status,
        ...(baseline?.assetId ? { assetId: baseline.assetId, source: "harhub" as const } : {}),
        ...(baseline?.digest ? { sourceDigest: baseline.digest } : {}),
        repositoryDigest: observed.digest,
        lastSeenAt: now,
        ...(fork ? { fork: publicForkSummary(fork) } : {})
      };
    });
    for (const observed of incoming.values()) {
      const id = randomUUID();
      const forkUpdate = observed.kind === "skill" ? updatedForks.get(observed.path) : undefined;
      const baseline = observed.kind === "skill" ? baselines.get(observed.path) : undefined;
      const status = observed.kind === "skill"
        ? baseline?.digest === observed.digest
          ? "synced" as const
          : baseline?.digest
            ? "modified" as const
            : "added" as const
        : "synced" as const;
      const fork = status === "added" || status === "modified" ? forkUpdate : undefined;
      if (fork) nextForks.push(structuredClone(fork));
      nextBindings.push({
        id,
        kind: observed.kind,
        name: observed.name,
        path: observed.path,
        source: baseline ? "harhub" : "repository",
        status,
        ...(baseline ? { assetId: baseline.assetId } : {}),
        ...(baseline ? { sourceDigest: baseline.digest } : {}),
        repositoryDigest: observed.digest,
        lastSeenAt: now,
        ...(fork ? { fork: publicForkSummary(fork) } : {})
      });
    }
    project.bindings = nextBindings.sort(bindingsByPath);
    project.skillForks = nextForks.sort((left, right) => left.path.localeCompare(right.path));
    project.skillForkGeneration = (project.skillForkGeneration ?? 0) + 1;
    project.sync = {
      status: "synced",
      revision: project.sync.revision + 1,
      lastSyncedAt: now,
      lastCommitSha: input.commitSha,
      lastRef: input.ref,
      ...(input.runId ? { lastRunId: input.runId } : {})
    };
    project.updatedAt = now;
    await saveState(state);
    return {
      projectId: project.id,
      revision: project.sync.revision,
      syncedAt: now,
      counts: countBindingStatuses(project.bindings)
    };
  });
}

export function getProjectSkillFork(
  accountId: string,
  workspaceId: string,
  projectId: string,
  bindingId: string
): Promise<{
  project: HarhubProject;
  binding: ProjectBinding;
  fork: ProjectSkillForkRecord;
}> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, accountId, workspaceId);
    const project = findProject(state, workspaceId, projectId);
    const binding = project.bindings.find((item) => item.id === bindingId);
    if (!binding || binding.kind !== "skill") throw new Error("Project Skill binding not found.");
    const fork = project.skillForks?.find((item) => item.path === binding.path);
    if (!fork) throw new Error("Project Skill fork not found.");
    return {
      project: toPublicProject(project),
      binding: structuredClone(binding),
      fork: structuredClone(fork)
    };
  });
}

export function recordProjectSkillPublished(input: {
  accountId: string;
  workspaceId: string;
  projectId: string;
  bindingId: string;
  assetId: string;
  digest: string;
  name?: string;
}): Promise<HarhubProject> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    requireWorkspaceMembership(state, input.accountId, input.workspaceId);
    const project = findProject(state, input.workspaceId, input.projectId);
    if (project.status !== "active") throw new Error("Archived Projects cannot publish Skills.");
    const binding = project.bindings.find((item) => item.id === input.bindingId);
    if (!binding || binding.kind !== "skill") throw new Error("Project Skill binding not found.");
    const fork = project.skillForks?.find((item) => item.path === binding.path);
    if (!fork || fork.digest !== input.digest) {
      throw new Error("Project Skill fork changed before it could be published.");
    }
    binding.assetId = input.assetId;
    if (input.name) binding.name = input.name;
    binding.source = "harhub";
    binding.sourceDigest = input.digest;
    binding.repositoryDigest = input.digest;
    binding.status = "synced";
    delete binding.fork;
    project.skillForks = (project.skillForks ?? []).filter((item) => item.path !== binding.path);
    project.skillForkGeneration = (project.skillForkGeneration ?? 0) + 1;
    project.updatedAt = new Date().toISOString();
    await saveState(state);
    return toPublicProject(project);
  });
}

function createProjectRecord(
  state: AppState,
  input: {
    workspaceId: string;
    name: string;
    description: string;
    repository?: ProjectRepository;
    bindings?: ProjectBinding[];
    sourceForgeSessionId?: string;
  }
): { project: ProjectStateRecord; syncToken?: string } {
  const now = new Date().toISOString();
  const credential = input.repository ? createSyncCredential() : undefined;
  return {
    project: {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      slug: uniqueProjectSlug(state, input.workspaceId, input.name),
      description: input.description.trim(),
      status: "active",
      ...(input.repository ? { repository: structuredClone(input.repository) } : {}),
      bindings: structuredClone(input.bindings ?? []).sort(bindingsByPath),
      sync: { status: "awaiting-first-sync", revision: 0 },
      ...(input.sourceForgeSessionId
        ? { sourceForgeSessionId: input.sourceForgeSessionId }
        : {}),
      syncTokenConfigured: Boolean(credential),
      skillForkGeneration: 0,
      ...(credential
        ? {
            syncTokenLastFour: credential.token.slice(-4),
            syncTokenHash: credential.hash
          }
        : {}),
      createdAt: now,
      updatedAt: now
    },
    ...(credential ? { syncToken: credential.token } : {})
  };
}

function initialProjectBindings(
  session: ForgeSessionCacheRecord,
  assetDigests: Readonly<Record<string, string>>
): ProjectBinding[] {
  const template = session.template;
  if (!template) return [];
  const rule = template.files.find((file) => file.path === ".harness/rules/engineering.md");
  return [
    ...template.selectedAssets.map((asset) => ({
      id: randomUUID(),
      kind: "skill" as const,
      name: asset.displayName,
      path: asset.installPath,
      source: "harhub" as const,
      status: "pending" as const,
      assetId: asset.id,
      ...(assetDigests[asset.id] ? { sourceDigest: assetDigests[asset.id] } : {})
    })),
    ...(rule
      ? [{
          id: randomUUID(),
          kind: "rule" as const,
          name: "Engineering rules",
          path: rule.path,
          source: "framework" as const,
          status: "pending" as const,
          sourceDigest: frameworkContentDigest(rule.content)
        }]
      : [])
  ];
}

function findProject(state: AppState, workspaceId: string, projectId: string): ProjectStateRecord {
  const project = state.projects.find(
    (item) => item.id === projectId && item.workspaceId === workspaceId
  );
  if (!project) throw new Error("Project not found.");
  return project;
}

function requireProjectSyncAccess(
  state: AppState,
  projectId: string,
  token: string,
  repository: string
): ProjectStateRecord {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || !verifySyncToken(token, project.syncTokenHash)) {
    throw new Error("Project sync credentials are invalid.");
  }
  if (project.status !== "active") throw new Error("Project is archived.");
  if (!project.repository) throw new Error("Project does not have a connected repository.");
  const expectedRepository = `${project.repository.owner}/${project.repository.name}`;
  if (repository.toLowerCase() !== expectedRepository.toLowerCase()) {
    throw new Error("Project sync repository does not match the tracked repository.");
  }
  return project;
}

function findForgeSession(
  state: AppState,
  accountId: string,
  workspaceId: string,
  sessionId: string
): ForgeSessionCacheRecord {
  const session = state.forgeSessions.find((item) =>
    item.id === sessionId && item.accountId === accountId && item.workspaceId === workspaceId
  );
  if (!session) throw new Error("Forge session not found.");
  return session;
}

function toPublicProject(project: ProjectStateRecord): HarhubProject {
  const {
    syncTokenHash: _syncTokenHash,
    skillForkGeneration: _skillForkGeneration,
    skillForks: _skillForks,
    ...publicProject
  } = structuredClone(project);
  return publicProject;
}

function projectBindingStatus(
  binding: ProjectBinding,
  repositoryDigest: string,
  discoveredBaseDigest?: string,
  baselineResolved = false
): ProjectBinding["status"] {
  if (binding.kind !== "skill") {
    return binding.sourceDigest && binding.sourceDigest !== repositoryDigest
      ? "modified"
      : "synced";
  }
  const baseDigest = baselineResolved ? discoveredBaseDigest : binding.sourceDigest;
  if (!baseDigest) return "added";
  return baseDigest === repositoryDigest ? "synced" : "modified";
}

function publicForkSummary(fork: ProjectSkillForkRecord): ProjectSkillForkSummary {
  return {
    digest: fork.digest,
    fileCount: fork.fileCount,
    size: fork.size,
    validation: structuredClone(fork.validation),
    updatedAt: fork.updatedAt
  };
}

function createSyncCredential(): { token: string; hash: string } {
  const token = `hhp_${randomBytes(32).toString("base64url")}`;
  return { token, hash: syncTokenHash(token) };
}

function verifySyncToken(token: string, storedHash?: string): boolean {
  if (!storedHash) return false;
  const actual = Buffer.from(syncTokenHash(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function syncTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function uniqueProjectSlug(state: AppState, workspaceId: string, name: string): string {
  const base = slugify(name) || "project";
  let candidate = base;
  let suffix = 2;
  const used = new Set(
    state.projects.filter((item) => item.workspaceId === workspaceId).map((item) => item.slug)
  );
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function assertProjectCapacity(state: AppState, workspaceId: string): void {
  if (state.projects.filter((item) => item.workspaceId === workspaceId).length >= MAX_PROJECTS_PER_WORKSPACE) {
    throw new Error(`A workspace can track at most ${MAX_PROJECTS_PER_WORKSPACE} Projects.`);
  }
}

function bindingKey(binding: { kind: string; path: string }): string {
  return `${binding.kind}\u0000${binding.path}`;
}

function bindingsByPath(left: ProjectBinding, right: ProjectBinding): number {
  return bindingKey(left).localeCompare(bindingKey(right));
}

function projectsNewestFirst(left: ProjectStateRecord, right: ProjectStateRecord): number {
  if (left.status !== right.status) return left.status === "active" ? -1 : 1;
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function countBindingStatuses(bindings: ProjectBinding[]): Record<ProjectBinding["status"], number> {
  const counts = { pending: 0, synced: 0, added: 0, modified: 0, missing: 0 };
  for (const binding of bindings) counts[binding.status] += 1;
  return counts;
}
