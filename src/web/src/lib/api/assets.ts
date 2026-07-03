import type { AssetPreview } from "../../../../shared/types";
import { JSON_HEADERS, request } from "./request";
import type {
  AssetBulkResponse,
  AssetListResponse,
  AssetScanResponse,
  AssetUploadResponse
} from "./types";

export async function getWorkspaceAssets(
  token: string,
  workspaceId: string,
  filters: { kind?: string } = {}
): Promise<AssetListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  return request<AssetListResponse>(
    `/api/workspaces/${workspaceId}/assets?${params.toString()}`,
    { token }
  );
}

export async function scanWorkspaceAssets(
  token: string,
  workspaceId: string,
  paths: string[]
): Promise<AssetScanResponse> {
  return request<AssetScanResponse>(`/api/workspaces/${workspaceId}/assets/scan`, {
    token,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ paths })
  });
}

export async function createWorkspaceAsset(
  token: string,
  workspaceId: string,
  input: {
    kind: "skill";
    name: string;
    dir: string;
    description?: string;
  }
): Promise<AssetScanResponse & { path: string }> {
  return request<AssetScanResponse & { path: string }>(
    `/api/workspaces/${workspaceId}/assets`,
    {
      token,
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input)
    }
  );
}

export async function uploadWorkspaceSkillZip(
  token: string,
  workspaceId: string,
  input: {
    file: File;
  }
): Promise<AssetUploadResponse> {
  const form = new FormData();
  form.set("file", input.file);

  return request<AssetUploadResponse>(
    `/api/workspaces/${workspaceId}/assets/upload`,
    {
      token,
      method: "POST",
      body: form
    }
  );
}

export async function deleteWorkspaceAsset(
  token: string,
  workspaceId: string,
  assetId: string
): Promise<AssetScanResponse> {
  return request<AssetScanResponse>(
    `/api/workspaces/${workspaceId}/assets/${encodeURIComponent(assetId)}`,
    {
      token,
      method: "DELETE"
    }
  );
}

export async function validateWorkspaceAssets(
  token: string,
  workspaceId: string
): Promise<AssetScanResponse> {
  return request<AssetScanResponse>(
    `/api/workspaces/${workspaceId}/assets/validate`,
    {
      token,
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({})
    }
  );
}

export async function validateWorkspaceAsset(
  token: string,
  workspaceId: string,
  assetId: string
): Promise<AssetScanResponse> {
  return request<AssetScanResponse>(
    `/api/workspaces/${workspaceId}/assets/${encodeURIComponent(assetId)}/validate`,
    {
      token,
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({})
    }
  );
}

export async function bulkWorkspaceAssets(
  token: string,
  workspaceId: string,
  input: {
    action: "validate" | "delete";
    assetIds: string[];
  }
): Promise<AssetBulkResponse> {
  return request<AssetBulkResponse>(
    `/api/workspaces/${workspaceId}/assets/bulk`,
    {
      token,
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input)
    }
  );
}

export async function getWorkspaceAssetPreview(
  token: string,
  workspaceId: string,
  assetId: string,
  filePath?: string
): Promise<AssetPreview> {
  const params = new URLSearchParams();
  if (filePath) params.set("path", filePath);
  const query = params.toString();
  return request<AssetPreview>(
    `/api/workspaces/${workspaceId}/assets/${encodeURIComponent(assetId)}/preview${query ? `?${query}` : ""}`,
    { token }
  );
}
