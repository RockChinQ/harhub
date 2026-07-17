import type {
  WorkspaceAiConnectionTestRequest,
  WorkspaceAiConnectionTestResult,
  WorkspaceAiSettings,
  WorkspaceAiSettingsUpdate,
  WorkspaceRole
} from "../../../../shared/types";
import { JSON_HEADERS, request } from "./request";
import type {
  WorkspaceMemberMutationResponse,
  WorkspaceMembersResponse,
  WorkspaceMutationResponse
} from "./types";

export async function getWorkspaceMembers(
  token: string,
  workspaceId: string
): Promise<WorkspaceMembersResponse> {
  return request<WorkspaceMembersResponse>(
    `/api/workspaces/${workspaceId}/members`,
    { token }
  );
}

export async function addWorkspaceMember(
  token: string,
  workspaceId: string,
  input: { email: string; role: WorkspaceRole }
): Promise<WorkspaceMemberMutationResponse> {
  return request<WorkspaceMemberMutationResponse>(
    `/api/workspaces/${workspaceId}/members`,
    {
      token,
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input)
    }
  );
}

export async function updateWorkspaceMember(
  token: string,
  workspaceId: string,
  membershipId: string,
  role: WorkspaceRole
): Promise<WorkspaceMemberMutationResponse> {
  return request<WorkspaceMemberMutationResponse>(
    `/api/workspaces/${workspaceId}/members/${membershipId}`,
    {
      token,
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ role })
    }
  );
}

export async function removeWorkspaceMember(
  token: string,
  workspaceId: string,
  membershipId: string
): Promise<void> {
  await request<void>(`/api/workspaces/${workspaceId}/members/${membershipId}`, {
    token,
    method: "DELETE"
  });
}

export async function revokeWorkspaceInvitation(
  token: string,
  workspaceId: string,
  invitationId: string
): Promise<void> {
  await request<void>(
    `/api/workspaces/${workspaceId}/invitations/${invitationId}`,
    {
      token,
      method: "DELETE"
    }
  );
}

export async function createWorkspace(
  token: string,
  input: {
    name: string;
  }
): Promise<WorkspaceMutationResponse> {
  return request<WorkspaceMutationResponse>("/api/workspaces", {
    token,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function updateWorkspace(
  token: string,
  workspaceId: string,
  input: {
    name?: string;
  }
): Promise<WorkspaceMutationResponse> {
  return request<WorkspaceMutationResponse>(`/api/workspaces/${workspaceId}`, {
    token,
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export function getWorkspaceAiSettings(
  token: string,
  workspaceId: string
): Promise<WorkspaceAiSettings> {
  return request<WorkspaceAiSettings>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ai-settings`,
    { token }
  );
}

export function saveWorkspaceAiSettings(
  token: string,
  workspaceId: string,
  input: WorkspaceAiSettingsUpdate
): Promise<WorkspaceAiSettings> {
  return request<WorkspaceAiSettings>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ai-settings`,
    {
      token,
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(input)
    }
  );
}

export function testWorkspaceAiConnection(
  token: string,
  workspaceId: string,
  input: WorkspaceAiConnectionTestRequest
): Promise<WorkspaceAiConnectionTestResult> {
  return request<WorkspaceAiConnectionTestResult>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ai-settings/test`,
    {
      token,
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input)
    }
  );
}
