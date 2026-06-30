import type {
  AccountProfile,
  AssetPreview,
  AssetRecord,
  SkillRecord,
  StorageStatus,
  ValidationIssue,
  WorkspaceMember,
  WorkspaceMembership,
  WorkspaceRecord,
  WorkspaceRole
} from "../../../types";

const JSON_HEADERS = {
  "Content-Type": "application/json"
};

export interface SessionResponse {
  account: AccountProfile;
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
}

export interface AuthResponse extends SessionResponse {
  token: string;
}

export interface SkillListResponse {
  workspace: WorkspaceRecord;
  catalogPath: string;
  generatedAt: string;
  skills: SkillRecord[];
}

export interface SkillScanResponse extends SkillListResponse {
  issues: ValidationIssue[];
}

export interface AssetListResponse {
  workspace: WorkspaceRecord;
  catalogPath: string;
  generatedAt: string;
  storage: StorageStatus;
  assets: AssetRecord[];
  skills: SkillRecord[];
}

export interface AssetScanResponse extends AssetListResponse {
  assetCatalogPath?: string;
  issues: ValidationIssue[];
}

export interface AssetUploadResponse extends AssetScanResponse {
  uploaded: AssetRecord;
}

export interface WorkspaceMutationResponse extends SessionResponse {
  workspace: WorkspaceRecord;
}

export interface WorkspaceMembersResponse {
  workspace: WorkspaceRecord;
  members: WorkspaceMember[];
}

export interface WorkspaceMemberMutationResponse extends WorkspaceMembersResponse {
  member: WorkspaceMember;
}

export async function getSession(token: string): Promise<SessionResponse> {
  return request<SessionResponse>("/api/session", { token });
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function signUp(input: {
  email: string;
  name: string;
  password: string;
  workspaceName: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function logout(token: string): Promise<void> {
  await request<void>("/api/auth/logout", {
    token,
    method: "POST"
  });
}

export async function updateAccount(
  token: string,
  input: { name?: string; email?: string }
): Promise<SessionResponse> {
  return request<SessionResponse>("/api/account", {
    token,
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function changePassword(
  token: string,
  input: { currentPassword: string; newPassword: string }
): Promise<void> {
  await request<void>("/api/account/password", {
    token,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

export async function getWorkspaceAssets(
  token: string,
  workspaceId: string,
  filters: { kind?: string; tag?: string; owner?: string; package?: string } = {}
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
    owner?: string;
    tags: string[];
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
    name?: string;
    description?: string;
    owner?: string;
    tags: string[];
  }
): Promise<AssetUploadResponse> {
  const form = new FormData();
  form.set("file", input.file);
  if (input.name) form.set("name", input.name);
  if (input.description) form.set("description", input.description);
  if (input.owner) form.set("owner", input.owner);
  if (input.tags.length > 0) form.set("tags", input.tags.join(","));

  return request<AssetUploadResponse>(
    `/api/workspaces/${workspaceId}/assets/upload`,
    {
      token,
      method: "POST",
      body: form
    }
  );
}

export async function updateWorkspaceAsset(
  token: string,
  workspaceId: string,
  assetId: string,
  input: {
    description?: string;
    owner?: string;
    tags?: string[];
    lifecycleState?: string;
    agents?: string[];
  }
): Promise<AssetScanResponse> {
  return request<AssetScanResponse>(
    `/api/workspaces/${workspaceId}/assets/${encodeURIComponent(assetId)}`,
    {
      token,
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(input)
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

export async function getWorkspaceSkills(
  token: string,
  workspaceId: string,
  filters: { tag?: string; owner?: string; package?: string } = {}
): Promise<SkillListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  return request<SkillListResponse>(
    `/api/workspaces/${workspaceId}/skills?${params.toString()}`,
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
    owner?: string;
    tags: string[];
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

export async function createWorkspace(
  token: string,
  input: {
    name: string;
    defaultScanPaths: string[];
    skillRoot: string;
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
    defaultScanPaths?: string[];
    skillRoot?: string;
  }
): Promise<WorkspaceMutationResponse> {
  return request<WorkspaceMutationResponse>(`/api/workspaces/${workspaceId}`, {
    token,
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

async function request<T>(
  url: string,
  init: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}
