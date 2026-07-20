import type {
  ForgeSessionDetail,
  HarhubProject,
  ProjectListResponse,
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
  input: { name: string; description?: string; repository: string; defaultBranch?: string }
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
  input: { name: string; description?: string; repository: string; defaultBranch?: string }
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
