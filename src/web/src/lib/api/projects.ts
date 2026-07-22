import type {
  ForgeSessionDetail,
  HarhubProject,
  GitHubInstallation,
  GitHubIntegrationStatus,
  GitHubRepositorySummary,
  ProjectBindingOwnership,
  ProjectBindingPolicy,
  ProjectChangeProposal,
  ProjectInventoryResponse,
  ProjectScanJob,
  ProjectListResponse,
  ProjectSkillDiffResponse,
  ProjectSkillPublishResponse,
  ProjectTokenResponse
} from "../../../../shared/types";
import { JSON_HEADERS, request } from "./request";

export function listProjects(token: string, workspaceId: string): Promise<ProjectListResponse> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, {
    cache: "no-store",
    token
  });
}

export function getProject(
  token: string,
  workspaceId: string,
  projectId: string
): Promise<HarhubProject> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`,
    { cache: "no-store", token }
  );
}

export function createProject(
  token: string,
  workspaceId: string,
  input: { name: string; description?: string; repository?: string; defaultBranch?: string }
): Promise<ProjectTokenResponse> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
    cache: "no-store",
    token
  });
}

export function freezeForgeSession(
  token: string,
  workspaceId: string,
  sessionId: string,
  input: { name: string; description?: string }
): Promise<ProjectTokenResponse & { session: ForgeSessionDetail }> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions/${encodeURIComponent(sessionId)}/freeze`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
      cache: "no-store",
      token
    }
  );
}

export function connectProjectRepository(
  token: string,
  workspaceId: string,
  projectId: string,
  input: { repository: string; defaultBranch?: string }
): Promise<ProjectTokenResponse> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/repository`,
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
      cache: "no-store",
      token
    }
  );
}

export function rotateProjectSyncToken(
  token: string,
  workspaceId: string,
  projectId: string
): Promise<ProjectTokenResponse> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/rotate-sync-token`,
    { method: "POST", cache: "no-store", token }
  );
}

export function archiveProject(
  token: string,
  workspaceId: string,
  projectId: string
): Promise<HarhubProject> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE", cache: "no-store", token }
  );
}

export function getProjectSkillDiff(
  token: string,
  workspaceId: string,
  projectId: string,
  bindingId: string,
  selectedPath?: string
): Promise<ProjectSkillDiffResponse> {
  const query = selectedPath ? `?path=${encodeURIComponent(selectedPath)}` : "";
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/bindings/${encodeURIComponent(bindingId)}/diff${query}`,
    { cache: "no-store", token }
  );
}

export function publishProjectSkillFork(
  token: string,
  workspaceId: string,
  projectId: string,
  bindingId: string
): Promise<ProjectSkillPublishResponse> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/bindings/${encodeURIComponent(bindingId)}/publish`,
    { method: "POST", cache: "no-store", token }
  );
}

export function getGitHubIntegrationStatus(
  token: string,
  workspaceId: string
): Promise<GitHubIntegrationStatus> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/github/status`, {
    cache: "no-store",
    token
  });
}

export function authorizeGitHubInstallation(
  token: string,
  workspaceId: string,
  redirectPath = "/projects"
): Promise<{ url: string }> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/github/installations/authorize`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ redirectPath }),
    cache: "no-store",
    token
  });
}

export function listGitHubInstallations(
  token: string,
  workspaceId: string
): Promise<{ installations: GitHubInstallation[] }> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/github/installations`, {
    cache: "no-store",
    token
  });
}

export function listGitHubRepositories(
  token: string,
  workspaceId: string,
  installationId: string
): Promise<{ repositories: GitHubRepositorySummary[] }> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/github/installations/${encodeURIComponent(installationId)}/repositories`,
    { cache: "no-store", token }
  );
}

export function importGitHubRepository(
  token: string,
  workspaceId: string,
  input: { installationId: string; repositoryId: string }
): Promise<{ project: HarhubProject; scan: ProjectScanJob }> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/github/repositories/import`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
    cache: "no-store",
    token
  });
}

export function getProjectInventory(
  token: string,
  workspaceId: string,
  projectId: string
): Promise<ProjectInventoryResponse> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/inventory`,
    { cache: "no-store", token }
  );
}

export function rescanProjectRepository(
  token: string,
  workspaceId: string,
  projectId: string
): Promise<ProjectScanJob> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/scans`,
    { method: "POST", cache: "no-store", token }
  );
}

export function updateProjectBindingPolicy(
  token: string,
  workspaceId: string,
  projectId: string,
  input: {
    artifactPath: string;
    ownership: ProjectBindingOwnership;
    libraryAssetId?: string;
    pinnedVersion?: number;
  }
): Promise<{ policy: ProjectBindingPolicy; scan: ProjectScanJob }> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/inventory/policies`,
    { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(input), cache: "no-store", token }
  );
}

export function createProjectBootstrapProposal(
  token: string,
  workspaceId: string,
  projectId: string
): Promise<ProjectChangeProposal> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/proposals`,
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ kind: "bootstrap" }), cache: "no-store", token }
  );
}

export function openProjectBootstrapProposal(
  token: string,
  workspaceId: string,
  projectId: string,
  proposalId: string
): Promise<ProjectChangeProposal> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(proposalId)}/open`,
    { method: "POST", cache: "no-store", token }
  );
}
