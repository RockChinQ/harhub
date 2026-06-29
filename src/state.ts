import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { slugify } from "./markdown.js";
import type {
  AccountProfile,
  WorkspaceMembership,
  WorkspaceRecord,
  WorkspaceRole
} from "./types.js";

export const STATE_PATH = ".harhub/state.json";

interface AccountRecord extends AccountProfile {
  passwordHash: string;
}

interface SessionRecord {
  token: string;
  accountId: string;
  createdAt: string;
}

interface AppState {
  schemaVersion: 1;
  accounts: AccountRecord[];
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
  sessions: SessionRecord[];
}

export interface AuthContext {
  account: AccountProfile;
  session: SessionRecord;
}

export interface WorkspaceContext extends AuthContext {
  workspace: WorkspaceRecord;
  membership: WorkspaceMembership;
}

export function getStatePath(): string {
  return path.resolve(process.cwd(), process.env.HARHUB_STATE ?? STATE_PATH);
}

export function getWorkspaceCatalogPath(workspaceId: string): string {
  return path.resolve(process.cwd(), `.harhub/workspaces/${workspaceId}/skills.json`);
}

export function loadState(): AppState {
  const statePath = getStatePath();
  if (!existsSync(statePath)) {
    const seeded = createSeedState();
    saveState(seeded);
    return seeded;
  }

  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as AppState;
  return normalizeState(parsed);
}

export function saveState(state: AppState): void {
  const statePath = getStatePath();
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function createSession(accountId: string): string {
  const state = loadState();
  const token = randomBytes(32).toString("hex");
  state.sessions.push({
    token,
    accountId,
    createdAt: new Date().toISOString()
  });
  saveState(state);
  return token;
}

export function deleteSession(token: string): void {
  const state = loadState();
  state.sessions = state.sessions.filter((session) => session.token !== token);
  saveState(state);
}

export function authenticate(token: string | undefined): AuthContext | undefined {
  if (!token) return undefined;
  const state = loadState();
  const session = state.sessions.find((item) => item.token === token);
  if (!session) return undefined;

  const account = state.accounts.find((item) => item.id === session.accountId);
  if (!account) return undefined;

  return {
    account: toPublicAccount(account),
    session
  };
}

export function requireWorkspace(
  accountId: string,
  workspaceId: string
): WorkspaceContext | undefined {
  const state = loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  const membership = state.memberships.find(
    (item) => item.accountId === accountId && item.workspaceId === workspaceId
  );

  if (!account || !workspace || !membership) return undefined;

  return {
    account: toPublicAccount(account),
    session: { token: "", accountId, createdAt: "" },
    workspace,
    membership
  };
}

export function listAccountWorkspaces(accountId: string): {
  account: AccountProfile;
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
} {
  const state = loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) {
    throw new Error("Account not found.");
  }

  const memberships = state.memberships.filter((item) => item.accountId === accountId);
  const workspaceIds = new Set(memberships.map((item) => item.workspaceId));

  return {
    account: toPublicAccount(account),
    memberships,
    workspaces: state.workspaces.filter((item) => workspaceIds.has(item.id))
  };
}

export function loginAccount(email: string, password: string): AccountProfile {
  const state = loadState();
  const account = state.accounts.find(
    (item) => item.email.toLowerCase() === email.trim().toLowerCase()
  );

  if (!account || !verifyPassword(password, account.passwordHash)) {
    throw new Error("Invalid email or password.");
  }

  return toPublicAccount(account);
}

export function signUpAccount(input: {
  email: string;
  name: string;
  password: string;
  workspaceName?: string;
}): AccountProfile {
  const state = loadState();
  const email = input.email.trim().toLowerCase();

  if (!email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  if (input.password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  if (state.accounts.some((account) => account.email.toLowerCase() === email)) {
    throw new Error("An account already exists for this email.");
  }

  const account: AccountRecord = {
    id: randomUUID(),
    email,
    name: input.name.trim() || (email.split("@")[0] ?? "User"),
    passwordHash: hashPassword(input.password),
    createdAt: new Date().toISOString()
  };

  const workspace = createWorkspaceRecord(
    input.workspaceName?.trim() || `${account.name}'s Workspace`
  );

  state.accounts.push(account);
  state.workspaces.push(workspace);
  state.memberships.push(createMembership(account.id, workspace.id, "owner"));
  saveState(state);

  return toPublicAccount(account);
}

export function createWorkspaceForAccount(
  accountId: string,
  input: { name: string; defaultScanPaths?: string[]; skillRoot?: string }
): WorkspaceRecord {
  const state = loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");

  const workspace = createWorkspaceRecord(input.name, {
    defaultScanPaths: input.defaultScanPaths,
    skillRoot: input.skillRoot
  });

  state.workspaces.push(workspace);
  state.memberships.push(createMembership(accountId, workspace.id, "owner"));
  saveState(state);

  return workspace;
}

export function updateWorkspaceForAccount(
  accountId: string,
  workspaceId: string,
  input: { name?: string; defaultScanPaths?: string[]; skillRoot?: string }
): WorkspaceRecord {
  const state = loadState();
  const membership = state.memberships.find(
    (item) => item.accountId === accountId && item.workspaceId === workspaceId
  );

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Workspace admin access is required.");
  }

  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  if (input.name?.trim()) {
    workspace.name = input.name.trim();
    workspace.slug = uniqueWorkspaceSlug(state, workspace.name, workspace.id);
  }

  if (input.defaultScanPaths) {
    workspace.defaultScanPaths = cleanPathList(input.defaultScanPaths);
  }

  if (input.skillRoot?.trim()) {
    workspace.skillRoot = input.skillRoot.trim();
  }

  saveState(state);
  return workspace;
}

function createSeedState(): AppState {
  const account: AccountRecord = {
    id: "acct_demo",
    email: "admin@harhub.local",
    name: "Harhub Admin",
    passwordHash: hashPassword("harhub"),
    createdAt: new Date().toISOString()
  };
  const workspace: WorkspaceRecord = {
    id: "ws_demo",
    name: "Engineering Platform",
    slug: "engineering-platform",
    defaultScanPaths: ["examples"],
    skillRoot: "skills",
    createdAt: new Date().toISOString()
  };

  return {
    schemaVersion: 1,
    accounts: [account],
    workspaces: [workspace],
    memberships: [createMembership(account.id, workspace.id, "owner")],
    sessions: []
  };
}

function normalizeState(state: AppState): AppState {
  state.accounts ??= [];
  state.workspaces ??= [];
  state.memberships ??= [];
  state.sessions ??= [];

  if (state.accounts.length === 0 || state.workspaces.length === 0) {
    return createSeedState();
  }

  return state;
}

function createWorkspaceRecord(
  name: string,
  options: { defaultScanPaths?: string[]; skillRoot?: string } = {}
): WorkspaceRecord {
  const state = existsSync(getStatePath()) ? loadState() : undefined;
  return {
    id: randomUUID(),
    name: name.trim(),
    slug: state ? uniqueWorkspaceSlug(state, name) : slugify(name),
    defaultScanPaths: cleanPathList(options.defaultScanPaths ?? ["examples"]),
    skillRoot: options.skillRoot?.trim() || "skills",
    createdAt: new Date().toISOString()
  };
}

function uniqueWorkspaceSlug(state: AppState, name: string, currentId?: string): string {
  const base = slugify(name) || "workspace";
  let candidate = base;
  let suffix = 2;
  while (
    state.workspaces.some(
      (workspace) => workspace.id !== currentId && workspace.slug === candidate
    )
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createMembership(
  accountId: string,
  workspaceId: string,
  role: WorkspaceRole
): WorkspaceMembership {
  return {
    id: randomUUID(),
    accountId,
    workspaceId,
    role,
    createdAt: new Date().toISOString()
  };
}

function cleanPathList(paths: string[]): string[] {
  const cleaned = paths.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["examples"];
}

function toPublicAccount(account: AccountRecord): AccountProfile {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    createdAt: account.createdAt
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
