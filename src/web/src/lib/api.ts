import type {
  AccountProfile,
  SkillRecord,
  ValidationIssue,
  WorkspaceMembership,
  WorkspaceRecord
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

export interface WorkspaceMutationResponse extends SessionResponse {
  workspace: WorkspaceRecord;
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
