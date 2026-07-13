import { request } from "./request";
import type { SkillListResponse } from "./types";

export async function getWorkspaceSkills(
  token: string,
  workspaceId: string
): Promise<SkillListResponse> {
  return request<SkillListResponse>(
    `/api/workspaces/${workspaceId}/skills`,
    { token }
  );
}
