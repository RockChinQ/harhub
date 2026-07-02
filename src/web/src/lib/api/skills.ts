import { JSON_HEADERS, request } from "./request";
import type { SkillListResponse, SkillScanResponse } from "./types";

export async function getWorkspaceSkills(
  token: string,
  workspaceId: string
): Promise<SkillListResponse> {
  return request<SkillListResponse>(
    `/api/workspaces/${workspaceId}/skills`,
    { token }
  );
}

export async function scanWorkspaceSkills(
  token: string,
  workspaceId: string,
  paths: string[]
): Promise<SkillScanResponse> {
  return request<SkillScanResponse>(`/api/workspaces/${workspaceId}/skills/scan`, {
    token,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ paths })
  });
}

export async function createWorkspaceSkill(
  token: string,
  workspaceId: string,
  input: {
    name: string;
    dir: string;
    description?: string;
  }
): Promise<SkillScanResponse & { path: string }> {
  return request<SkillScanResponse & { path: string }>(
    `/api/workspaces/${workspaceId}/skills`,
    {
      token,
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input)
    }
  );
}
