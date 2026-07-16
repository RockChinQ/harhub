import type {
  AssetContentPreview,
  AssetShareResponse
} from "../../../../shared/types";
import { request } from "./request";

export async function getPublicAssetShare(token: string): Promise<AssetShareResponse> {
  return request<AssetShareResponse>(`/api/public/shares/${encodeURIComponent(token)}`);
}

export async function getPublicAssetSharePreview(
  token: string,
  filePath?: string
): Promise<AssetContentPreview> {
  const params = new URLSearchParams();
  if (filePath) params.set("path", filePath);
  const query = params.toString();
  return request<AssetContentPreview>(
    `/api/public/shares/${encodeURIComponent(token)}/preview${query ? `?${query}` : ""}`
  );
}

export async function getWorkspaceAssetShare(
  token: string,
  workspaceId: string,
  assetId: string
): Promise<AssetShareResponse | undefined> {
  const response = await fetch(assetShareUrl(workspaceId, assetId), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return undefined;
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Share request failed with ${response.status}`
    );
  }
  return data as AssetShareResponse;
}

export async function createWorkspaceAssetShare(
  token: string,
  workspaceId: string,
  assetId: string
): Promise<AssetShareResponse> {
  return request<AssetShareResponse>(assetShareUrl(workspaceId, assetId), {
    token,
    method: "POST"
  });
}

export async function revokeWorkspaceAssetShare(
  token: string,
  workspaceId: string,
  assetId: string
): Promise<void> {
  return request<void>(assetShareUrl(workspaceId, assetId), {
    token,
    method: "DELETE"
  });
}

function assetShareUrl(workspaceId: string, assetId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}/share`;
}
