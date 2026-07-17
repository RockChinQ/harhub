import type {
  HarnessFollowUpRequest,
  HarnessFollowUpResponse,
  HarnessTemplateResponse
} from "../../../../shared/types";
import { JSON_HEADERS, request } from "./request";

export function getForgeFollowUp(
  token: string,
  workspaceId: string,
  input: HarnessFollowUpRequest
): Promise<HarnessFollowUpResponse> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/forge/follow-up`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
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
