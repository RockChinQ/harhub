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
  ProjectSyncRequest,
  ProjectSyncResponse,
  ProjectTokenResponse
} from "../shared/types.js";
import { serializeStateAccess } from "./access.js";
import { requireWorkspaceMembership } from "./records.js";
import { loadState, saveState } from "./store.js";
import type { AppState, ForgeSessionCacheRecord, ProjectStateRecord } from "./types.js";

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
  repository: ProjectRepository;
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
  repository: ProjectRepository;
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
      repository: input.repository,
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
        repository: created.project.repository,
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

export function syncProjectFromRepository(
  projectId: string,
  token: string,
  input: ProjectSyncRequest
): Promise<ProjectSyncResponse> {
  return serializeStateAccess(async () => {
    const state = await loadState();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project || !verifySyncToken(token, project.syncTokenHash)) {
      throw new Error("Project sync credentials are invalid.");
    }
    if (project.status !== "active") throw new Error("Project is archived.");
    const expectedRepository = `${project.repository.owner}/${project.repository.name}`;
    if (input.repository.toLowerCase() !== expectedRepository.toLowerCase()) {
      throw new Error("Project sync repository does not match the tracked repository.");
    }

    const now = new Date().toISOString();
    const incoming = new Map(input.bindings.map((binding) => [bindingKey(binding), binding]));
    const nextBindings: ProjectBinding[] = project.bindings.map((binding) => {
      const observed = incoming.get(bindingKey(binding));
      if (!observed) return { ...binding, status: "missing" };
      incoming.delete(bindingKey(binding));
      return {
        ...binding,
        name: observed.name,
        status: binding.sourceDigest && binding.sourceDigest !== observed.digest
          ? "modified"
          : "synced",
        repositoryDigest: observed.digest,
        lastSeenAt: now
      };
    });
    for (const observed of incoming.values()) {
      nextBindings.push({
        id: randomUUID(),
        kind: observed.kind,
        name: observed.name,
        path: observed.path,
        source: "repository",
        status: "synced",
        repositoryDigest: observed.digest,
        lastSeenAt: now
      });
    }
    project.bindings = nextBindings.sort(bindingsByPath);
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

function createProjectRecord(
  state: AppState,
  input: {
    workspaceId: string;
    name: string;
    description: string;
    repository: ProjectRepository;
    bindings?: ProjectBinding[];
    sourceForgeSessionId?: string;
  }
): { project: ProjectStateRecord; syncToken: string } {
  const now = new Date().toISOString();
  const credential = createSyncCredential();
  return {
    project: {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      slug: uniqueProjectSlug(state, input.workspaceId, input.name),
      description: input.description.trim(),
      status: "active",
      repository: structuredClone(input.repository),
      bindings: structuredClone(input.bindings ?? []).sort(bindingsByPath),
      sync: { status: "awaiting-first-sync", revision: 0 },
      ...(input.sourceForgeSessionId
        ? { sourceForgeSessionId: input.sourceForgeSessionId }
        : {}),
      syncTokenConfigured: true,
      syncTokenLastFour: credential.token.slice(-4),
      syncTokenHash: credential.hash,
      createdAt: now,
      updatedAt: now
    },
    syncToken: credential.token
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
  const { syncTokenHash: _syncTokenHash, ...publicProject } = structuredClone(project);
  return publicProject;
}

function createSyncCredential(): { token: string; hash: string } {
  const token = `hhp_${randomBytes(32).toString("base64url")}`;
  return { token, hash: syncTokenHash(token) };
}

function verifySyncToken(token: string, storedHash: string): boolean {
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
  const counts = { pending: 0, synced: 0, modified: 0, missing: 0 };
  for (const binding of bindings) counts[binding.status] += 1;
  return counts;
}
