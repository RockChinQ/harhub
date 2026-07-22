import { createSign } from "node:crypto";

import { isRepositoryInventoryCandidate, type RepositorySourceFile } from "../../features/repository-inventory/index.js";
import type {
  GitHubInstallation,
  GitHubIntegrationStatus,
  GitHubRepositorySummary,
  ProjectChangeProposalFile
} from "../../shared/types.js";
import {
  GITHUB_API_URL,
  GITHUB_APP_CLIENT_ID,
  GITHUB_APP_CLIENT_SECRET,
  GITHUB_APP_ID,
  GITHUB_APP_PRIVATE_KEY,
  GITHUB_APP_SLUG,
  GITHUB_APP_WEBHOOK_SECRET,
  GITHUB_WEB_URL
} from "../config.js";

const API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const MAX_TREE_ENTRIES = 25_000;
const MAX_INVENTORY_FILES = 5_000;
const MAX_INVENTORY_BYTES = 20 * 1024 * 1024;

interface InstallationPayload {
  id: number;
  account: { login: string; type: "Organization" | "User" };
  repository_selection: "all" | "selected";
  permissions: Record<string, string>;
  suspended_at: string | null;
}

interface RepositoryPayload {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  archived: boolean;
  default_branch: string;
  description: string | null;
  owner: { login: string };
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean; pull?: boolean };
}

interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
}

interface TreePayload {
  sha: string;
  truncated: boolean;
  tree: TreeEntry[];
}

export interface GitHubRepositoryInventorySource {
  repository: GitHubRepositorySummary;
  commitSha: string;
  treeSha: string;
  files: RepositorySourceFile[];
}

export class GitHubAppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number
  ) {
    super(message);
    this.name = "GitHubAppError";
  }
}

export function githubIntegrationStatus(): GitHubIntegrationStatus {
  const configured = githubAppConfigured();
  return {
    configured,
    ...(GITHUB_APP_SLUG ? { appSlug: GITHUB_APP_SLUG } : {}),
    ...(configured ? { installUrl: `${trimSlash(GITHUB_WEB_URL)}/apps/${encodeURIComponent(GITHUB_APP_SLUG!)}/installations/new` } : {}),
    webhookConfigured: Boolean(GITHUB_APP_WEBHOOK_SECRET),
    permissions: { contents: "read", pullRequests: "write" }
  };
}

export function githubAppConfigured(): boolean {
  return Boolean(
    GITHUB_APP_ID && GITHUB_APP_SLUG && GITHUB_APP_CLIENT_ID &&
    GITHUB_APP_CLIENT_SECRET && GITHUB_APP_PRIVATE_KEY
  );
}

export function githubAppInstallUrl(state: string): string {
  assertConfigured();
  const url = new URL(`/apps/${GITHUB_APP_SLUG}/installations/new`, `${trimSlash(GITHUB_WEB_URL)}/`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function githubAppOAuthUrl(state: string): string {
  assertConfigured();
  const url = new URL("/login/oauth/authorize", `${trimSlash(GITHUB_WEB_URL)}/`);
  url.searchParams.set("client_id", GITHUB_APP_CLIENT_ID!);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGitHubAppOAuthCode(code: string): Promise<string> {
  assertConfigured();
  const response = await githubRequest<{ access_token?: string; error_description?: string }>(
    "/login/oauth/access_token",
    {
      baseUrl: GITHUB_WEB_URL,
      method: "POST",
      body: {
        client_id: GITHUB_APP_CLIENT_ID,
        client_secret: GITHUB_APP_CLIENT_SECRET,
        code
      },
      auth: undefined
    }
  );
  if (!response.access_token) {
    throw new GitHubAppError(
      "github_oauth_failed",
      response.error_description || "GitHub did not return an OAuth access token.",
      false
    );
  }
  return response.access_token;
}

export async function verifyAndReadInstallation(input: {
  installationId: string;
  userAccessToken: string;
  workspaceId: string;
  linkedByAccountId: string;
}): Promise<GitHubInstallation> {
  const [installation] = await Promise.all([
    githubRequest<InstallationPayload>(`/app/installations/${encodeURIComponent(input.installationId)}`, {
      auth: `Bearer ${createGitHubAppJwt()}`
    }),
    // This user-scoped endpoint proves the person completing OAuth can access this installation.
    githubRequest(`/user/installations/${encodeURIComponent(input.installationId)}/repositories?per_page=1`, {
      auth: `Bearer ${input.userAccessToken}`
    })
  ]);
  return {
    id: String(installation.id),
    workspaceId: input.workspaceId,
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    repositorySelection: installation.repository_selection,
    permissions: installation.permissions,
    linkedByAccountId: input.linkedByAccountId,
    linkedAt: new Date().toISOString(),
    ...(installation.suspended_at ? { suspendedAt: installation.suspended_at } : {})
  };
}

export async function readInstallation(installationId: string): Promise<InstallationPayload> {
  return githubRequest<InstallationPayload>(`/app/installations/${encodeURIComponent(installationId)}`, {
    auth: `Bearer ${createGitHubAppJwt()}`
  });
}

export async function listInstallationRepositories(
  installationId: string
): Promise<GitHubRepositorySummary[]> {
  const token = await installationAccessToken(installationId);
  const repositories: RepositoryPayload[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await githubRequest<{ repositories: RepositoryPayload[] }>(
      `/installation/repositories?per_page=100&page=${page}`,
      { auth: `Bearer ${token}` }
    );
    repositories.push(...response.repositories);
    if (response.repositories.length < 100) break;
  }
  return repositories.map(repositorySummary).sort((left, right) => left.fullName.localeCompare(right.fullName));
}

export async function readRepositoryInventorySource(input: {
  installationId: string;
  owner: string;
  name: string;
  requestedSha?: string;
}): Promise<GitHubRepositoryInventorySource> {
  const token = await installationAccessToken(input.installationId, input.owner, input.name);
  const repository = await githubRequest<RepositoryPayload>(repoPath(input, ""), {
    auth: `Bearer ${token}`
  });
  const revision = input.requestedSha || repository.default_branch;
  const commit = await githubRequest<{ sha: string; tree: { sha: string } }>(
    repoPath(input, `/git/commits/${encodeURIComponent(revision)}`),
    { auth: `Bearer ${token}` }
  ).catch(async (error) => {
    if (!(error instanceof GitHubAppError) || error.status !== 422) throw error;
    const ref = await githubRequest<{ object: { sha: string } }>(
      repoPath(input, `/git/ref/heads/${encodeURIComponent(revision)}`),
      { auth: `Bearer ${token}` }
    );
    return githubRequest<{ sha: string; tree: { sha: string } }>(
      repoPath(input, `/git/commits/${encodeURIComponent(ref.object.sha)}`),
      { auth: `Bearer ${token}` }
    );
  });
  const entries = await repositoryTree(input, commit.tree.sha, token);
  const skillRoots = entries
    .filter((entry) => entry.type === "blob" && entry.path.endsWith("/SKILL.md") && isRepositoryInventoryCandidate(entry.path))
    .map((entry) => entry.path.slice(0, -"/SKILL.md".length));
  const selected = entries.filter((entry) => entry.type === "blob" && (
    isRepositoryInventoryCandidate(entry.path) ||
    skillRoots.some((root) => entry.path.startsWith(`${root}/`))
  ));
  if (selected.length > MAX_INVENTORY_FILES) {
    throw new GitHubAppError(
      "inventory_too_large",
      `Repository harness inventory contains more than ${MAX_INVENTORY_FILES} files.`,
      false
    );
  }
  const declaredBytes = selected.reduce((total, entry) => total + (entry.size ?? 0), 0);
  if (declaredBytes > MAX_INVENTORY_BYTES) {
    throw new GitHubAppError("inventory_too_large", "Repository harness inventory exceeds 20 MB.", false);
  }
  const files: RepositorySourceFile[] = [];
  let receivedBytes = 0;
  for (const entry of selected) {
    const blob = await githubRequest<{ content: string; encoding: string }>(
      repoPath(input, `/git/blobs/${entry.sha}`),
      { auth: `Bearer ${token}` }
    );
    if (blob.encoding !== "base64") {
      throw new GitHubAppError("unsupported_blob_encoding", `Unsupported encoding for ${entry.path}.`, false);
    }
    const content = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
    receivedBytes += content.byteLength;
    if (receivedBytes > MAX_INVENTORY_BYTES) {
      throw new GitHubAppError("inventory_too_large", "Repository harness inventory exceeds 20 MB.", false);
    }
    files.push({ path: entry.path, content });
  }
  return {
    repository: repositorySummary(repository),
    commitSha: commit.sha,
    treeSha: commit.tree.sha,
    files
  };
}

export async function createRepositoryPullRequest(input: {
  installationId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  baseSha: string;
  branch: string;
  title: string;
  body: string;
  files: ProjectChangeProposalFile[];
}): Promise<{ number: number; url: string }> {
  if (input.files.length === 0 || input.files.length > 100) {
    throw new GitHubAppError("invalid_proposal", "A proposal must contain between 1 and 100 files.", false);
  }
  const totalBytes = input.files.reduce((total, file) => total + Buffer.byteLength(file.content), 0);
  if (totalBytes > 5 * 1024 * 1024 || input.files.some((file) => Buffer.byteLength(file.content) > 1024 * 1024)) {
    throw new GitHubAppError("proposal_too_large", "Proposal files exceed the GitHub write limit.", false);
  }
  const token = await installationAccessToken(input.installationId, input.owner, input.name, true);
  const repo = { owner: input.owner, name: input.name };
  const baseCommit = await githubRequest<{ tree: { sha: string } }>(
    repoPath(repo, `/git/commits/${encodeURIComponent(input.baseSha)}`),
    { auth: `Bearer ${token}` }
  );
  const treeEntries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  for (const file of input.files) {
    const blob = await githubRequest<{ sha: string }>(repoPath(repo, "/git/blobs"), {
      method: "POST",
      auth: `Bearer ${token}`,
      body: { content: file.content, encoding: "utf-8" }
    });
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await githubRequest<{ sha: string }>(repoPath(repo, "/git/trees"), {
    method: "POST",
    auth: `Bearer ${token}`,
    body: { base_tree: baseCommit.tree.sha, tree: treeEntries }
  });
  const commit = await githubRequest<{ sha: string }>(repoPath(repo, "/git/commits"), {
    method: "POST",
    auth: `Bearer ${token}`,
    body: { message: input.title, tree: tree.sha, parents: [input.baseSha] }
  });
  await githubRequest(repoPath(repo, "/git/refs"), {
    method: "POST",
    auth: `Bearer ${token}`,
    body: { ref: `refs/heads/${input.branch}`, sha: commit.sha }
  });
  const pull = await githubRequest<{ number: number; html_url: string }>(repoPath(repo, "/pulls"), {
    method: "POST",
    auth: `Bearer ${token}`,
    body: { title: input.title, body: input.body, head: input.branch, base: input.defaultBranch }
  });
  return { number: pull.number, url: pull.html_url };
}

export function createGitHubAppJwt(now = new Date()): string {
  assertConfigured();
  const issuedAt = Math.floor(now.getTime() / 1000) - 60;
  const header = encodeSegment({ alg: "RS256", typ: "JWT" });
  const payload = encodeSegment({ iat: issuedAt, exp: issuedAt + 10 * 60, iss: GITHUB_APP_ID });
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(GITHUB_APP_PRIVATE_KEY!), "base64url");
  return `${unsigned}.${signature}`;
}

async function installationAccessToken(
  installationId: string,
  owner?: string,
  name?: string,
  write = false
): Promise<string> {
  const body = owner && name
    ? {
        repositories: [name],
        permissions: write
          ? { contents: "write", pull_requests: "write" }
          : { contents: "read", metadata: "read" }
      }
    : undefined;
  const response = await githubRequest<{ token: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    { method: "POST", auth: `Bearer ${createGitHubAppJwt()}`, ...(body ? { body } : {}) }
  );
  return response.token;
}

async function repositoryTree(
  repository: { owner: string; name: string },
  rootSha: string,
  token: string
): Promise<TreeEntry[]> {
  const recursive = await githubRequest<TreePayload>(
    repoPath(repository, `/git/trees/${rootSha}?recursive=1`),
    { auth: `Bearer ${token}` }
  );
  if (!recursive.truncated) return boundedEntries(recursive.tree);
  const result: TreeEntry[] = [];
  const queue: Array<{ prefix: string; sha: string }> = [{ prefix: "", sha: rootSha }];
  while (queue.length > 0) {
    const next = queue.shift()!;
    const tree = await githubRequest<TreePayload>(repoPath(repository, `/git/trees/${next.sha}`), {
      auth: `Bearer ${token}`
    });
    for (const entry of tree.tree) {
      const fullPath = next.prefix ? `${next.prefix}/${entry.path}` : entry.path;
      const full = { ...entry, path: fullPath };
      result.push(full);
      if (entry.type === "tree") queue.push({ prefix: fullPath, sha: entry.sha });
      if (result.length > MAX_TREE_ENTRIES) {
        throw new GitHubAppError("tree_too_large", "Repository tree exceeds the 25,000 entry scan limit.", false);
      }
    }
  }
  return result;
}

function boundedEntries(entries: TreeEntry[]): TreeEntry[] {
  if (entries.length > MAX_TREE_ENTRIES) {
    throw new GitHubAppError("tree_too_large", "Repository tree exceeds the 25,000 entry scan limit.", false);
  }
  return entries;
}

async function githubRequest<T = unknown>(
  requestPath: string,
  options: {
    baseUrl?: string;
    method?: "GET" | "POST";
    auth?: string;
    body?: unknown;
  }
): Promise<T> {
  const baseUrl = trimSlash(options.baseUrl ?? GITHUB_API_URL);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}${requestPath}`, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "harhub-github-app",
          ...(options.auth ? { Authorization: options.auth } : {}),
          ...(options.body ? { "Content-Type": "application/json" } : {})
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal
      });
      const text = await response.text();
      const payload = text ? safeJson(text) : undefined;
      if (response.ok) return payload as T;
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < MAX_RETRIES) {
        await delay(150 * 2 ** attempt);
        continue;
      }
      const message = isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `GitHub API request failed with status ${response.status}.`;
      throw new GitHubAppError(`github_http_${response.status}`, message, retryable, response.status);
    } catch (error) {
      if (error instanceof GitHubAppError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      if (attempt < MAX_RETRIES) {
        await delay(150 * 2 ** attempt);
        continue;
      }
      throw new GitHubAppError(
        aborted ? "github_timeout" : "github_network_error",
        aborted ? "GitHub API request timed out." : "GitHub API request failed.",
        true
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new GitHubAppError("github_request_failed", "GitHub API request failed.", true);
}

function repositorySummary(repository: RepositoryPayload): GitHubRepositorySummary {
  return {
    id: String(repository.id),
    nodeId: repository.node_id,
    owner: repository.owner.login,
    name: repository.name,
    fullName: repository.full_name,
    url: repository.html_url,
    private: repository.private,
    archived: repository.archived,
    defaultBranch: repository.default_branch,
    description: repository.description ?? "",
    permissions: {
      admin: Boolean(repository.permissions?.admin),
      maintain: Boolean(repository.permissions?.maintain),
      push: Boolean(repository.permissions?.push),
      pull: repository.permissions?.pull !== false
    }
  };
}

function repoPath(repository: { owner: string; name: string }, suffix: string): string {
  return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}${suffix}`;
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN")) return trimmed.replace(/\\n/g, "\n");
  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  if (!decoded.includes("BEGIN")) throw new Error("HARHUB_GITHUB_APP_PRIVATE_KEY is invalid.");
  return decoded;
}

function assertConfigured(): void {
  if (!githubAppConfigured()) {
    throw new GitHubAppError("github_app_not_configured", "GitHub App integration is not configured.", false);
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return { message: value.slice(0, 500) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
