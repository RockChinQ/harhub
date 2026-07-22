import type {
  AssetRecord,
  AssetPreview,
  SkillImportPreview
} from "../../../../shared/types";
import { JSON_HEADERS, request } from "./request";
import type {
  AssetBulkResponse,
  AssetListResponse,
  AssetScanResponse,
  AssetUploadResponse
} from "./types";

export async function getWorkspaceAsset(
  token: string,
  workspaceId: string,
  assetId: string
): Promise<AssetRecord> {
  return request<AssetRecord>(
    `/api/workspaces/${workspaceId}/assets/${encodeURIComponent(assetId)}`,
    { token, cache: "no-store" }
  );
}

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

export async function uploadWorkspaceSkillZip(
  token: string,
  workspaceId: string,
  input: {
    file: File;
    selectedSkillPaths: string[];
  }
): Promise<AssetUploadResponse> {
  const form = new FormData();
  form.set("file", input.file);
  form.set("selectedSkillPaths", JSON.stringify(input.selectedSkillPaths));

  return request<AssetUploadResponse>(
    `/api/workspaces/${workspaceId}/assets/upload`,
    {
      token,
      method: "POST",
      body: form
    }
  );
}

export async function previewWorkspaceSkillZip(
  token: string,
  workspaceId: string,
  file: File
): Promise<SkillImportPreview> {
  const form = new FormData();
  form.set("file", file);
  return request<SkillImportPreview>(
    `/api/workspaces/${workspaceId}/assets/import/preview`,
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
    { token, cache: "no-store" }
  );
}

export async function getWorkspaceAssetTree(
  token: string,
  workspaceId: string,
  assetId: string
): Promise<AssetPreview> {
  return request<AssetPreview>(
    `/api/workspaces/${workspaceId}/assets/${encodeURIComponent(assetId)}/preview?treeOnly=true`,
    { token, cache: "no-store" }
  );
}

export async function downloadWorkspaceAssetVersion(
  token: string,
  workspaceId: string,
  assetId: string,
  version: number
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}/versions/${version}/download`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Version download failed with ${response.status}`
    );
  }
  const disposition = response.headers.get("content-disposition");
  const fileName = disposition?.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  return {
    blob: await response.blob(),
    fileName: fileName?.split(/[\\/]/).pop()?.trim() || `${assetId}-v${version}.zip`
  };
}

export async function rollbackWorkspaceAssetVersion(
  token: string,
  workspaceId: string,
  assetId: string,
  version: number
): Promise<{ asset: AssetRecord; restoredFromVersion: number }> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}/versions/${version}/rollback`,
    {
      token,
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({})
    }
  );
}
