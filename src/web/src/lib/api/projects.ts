import type {
  ForgeSessionDetail,
  HarhubProject,
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
