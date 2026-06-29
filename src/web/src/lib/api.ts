import type { SkillRecord, ValidationIssue } from "../../../types";

const JSON_HEADERS = {
  "Content-Type": "application/json"
};

export interface SkillListResponse {
  catalogPath: string;
  generatedAt: string;
  skills: SkillRecord[];
}

export interface SkillScanResponse extends SkillListResponse {
  issues: ValidationIssue[];
}

export async function getSkills(filters: {
  tag?: string;
  owner?: string;
  package?: string;
} = {}): Promise<SkillListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  return request<SkillListResponse>(`/api/skills?${params.toString()}`);
}

export async function scanSkills(paths: string[]): Promise<SkillScanResponse> {
  return request<SkillScanResponse>("/api/skills/scan", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ paths })
  });
}

export async function createSkill(input: {
  name: string;
  dir: string;
  description?: string;
  owner?: string;
  tags: string[];
}): Promise<SkillScanResponse & { path: string }> {
  return request<SkillScanResponse & { path: string }>("/api/skills", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
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
