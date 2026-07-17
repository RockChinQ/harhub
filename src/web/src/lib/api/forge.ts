import type {
  ForgeSessionDetail,
  ForgeSessionListResponse,
  HarnessFollowUpRequest,
  HarnessFollowUpResponse,
  HarnessTemplateResponse
} from "../../../../shared/types";
import { JSON_HEADERS, request } from "./request";

export function listForgeSessions(
  token: string,
  workspaceId: string
): Promise<ForgeSessionListResponse> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions`, {
    cache: "no-store",
    token
  });
}

export function createForgeSession(
  token: string,
  workspaceId: string,
  requirement: string
): Promise<ForgeSessionDetail> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ requirement }),
    cache: "no-store",
    token
  });
}

export function getForgeSession(
  token: string,
  workspaceId: string,
  sessionId: string
): Promise<ForgeSessionDetail> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions/${encodeURIComponent(sessionId)}`,
    { cache: "no-store", token }
  );
}

export function deleteForgeSession(
  token: string,
  workspaceId: string,
  sessionId: string
): Promise<void> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", cache: "no-store", token }
  );
}

export function getForgeFollowUp(
  token: string,
  workspaceId: string,
  input: HarnessFollowUpRequest
): Promise<HarnessFollowUpResponse> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/forge/follow-up`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
    cache: "no-store",
    token
  });
}

export function generateForgeTemplate(
  token: string,
  workspaceId: string,
  input: HarnessFollowUpRequest
): Promise<HarnessTemplateResponse> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/forge/generate`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
    cache: "no-store",
    token
  });
}

export async function downloadForgeTemplate(
  token: string,
  workspaceId: string,
  template: HarnessTemplateResponse
): Promise<Blob> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/archive`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...JSON_HEADERS
      },
      cache: "no-store",
      body: JSON.stringify({
        slug: template.profile.slug,
        files: template.files,
        selectedAssetIds: template.selectedAssets.map((asset) => asset.id)
      })
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new Error(
      typeof data?.error === "string" ? data.error : `Download failed with ${response.status}`
    );
  }

  return response.blob();
}
