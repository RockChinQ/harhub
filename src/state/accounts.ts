import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createMembership, createWorkspaceRecord, toPublicAccount } from "./records.js";
import {
  acceptMatchingPendingInvitations,
  ensureAccountHasWorkspace
} from "./invitations.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { loadState, saveState } from "./store.js";
import type {
  AccountProfile,
  AuthProvider,
  WorkspaceMembership,
  WorkspaceRecord
} from "../shared/types.js";
import type { AccountRecord, AuthContext, OAuthStateRecord } from "./types.js";

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function createSession(accountId: string): Promise<string> {
  const state = await loadState();
  const token = randomBytes(32).toString("hex");
  state.sessions.push({
    token,
    accountId,
    createdAt: new Date().toISOString()
  });
  await saveState(state);
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  const state = await loadState();
  state.sessions = state.sessions.filter((session) => session.token !== token);
  await saveState(state);
}

export async function authenticate(token: string | undefined): Promise<AuthContext | undefined> {
  if (!token) return undefined;
  const state = await loadState();
  const session = state.sessions.find((item) => item.token === token);
  if (!session) return undefined;

  const account = state.accounts.find((item) => item.id === session.accountId);
  if (!account) return undefined;

  return {
    account: toPublicAccount(account),
    session
  };
}

export async function listAccountWorkspaces(accountId: string): Promise<{
  account: AccountProfile;
  workspaces: WorkspaceRecord[];
  memberships: WorkspaceMembership[];
}> {
  const state = await loadState();
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

export async function loginAccount(
  email: string,
  password: string,
  inviteToken?: string
): Promise<AccountProfile> {
  const state = await loadState();
  const account = state.accounts.find(
    (item) => item.email.toLowerCase() === email.trim().toLowerCase()
  );

  if (!account || !verifyPassword(password, account.passwordHash)) {
    throw new Error("Invalid email or password.");
  }

  acceptMatchingPendingInvitations(state, account, inviteToken);
  ensureAccountHasWorkspace(state, account);
  await saveState(state);
  return toPublicAccount(account);
}

export async function signUpAccount(input: {
  email: string;
  name: string;
  password: string;
  workspaceName?: string;
  inviteToken?: string;
}): Promise<AccountProfile> {
  const state = await loadState();
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.accounts.push(account);
  const acceptedWorkspace = acceptMatchingPendingInvitations(state, account, input.inviteToken);
  if (!acceptedWorkspace) {
    const workspace = createWorkspaceRecord(
      state,
      input.workspaceName?.trim() || `${account.name}'s Workspace`
    );
    state.workspaces.push(workspace);
    state.memberships.push(createMembership(account.id, workspace.id, "owner"));
  }
  await saveState(state);

  return toPublicAccount(account);
}

export async function createEmailLoginCode(input: {
  email: string;
  inviteToken?: string;
}): Promise<{ email: string; code: string; expiresAt: string }> {
  const state = await loadState();
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("A valid email is required.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString();
  state.emailLoginCodes = state.emailLoginCodes.filter(
    (item) => !item.consumedAt && new Date(item.expiresAt).getTime() > Date.now()
  );
  state.emailLoginCodes.push({
    id: randomUUID(),
    email,
    codeHash: hashCode(email, code),
    inviteToken: input.inviteToken,
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAt
  });
  await saveState(state);
  return { email, code, expiresAt };
}

export async function verifyEmailLoginCode(input: {
  email: string;
  code: string;
  inviteToken?: string;
}): Promise<AccountProfile> {
  const state = await loadState();
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("A valid email is required.");

  const record = [...state.emailLoginCodes]
    .reverse()
    .find((item) => item.email === email && !item.consumedAt);
  if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new Error("Verification code is invalid or expired.");
  }
  if (record.attempts >= 5) {
    throw new Error("Verification code has too many failed attempts.");
  }
  if (record.codeHash !== hashCode(email, input.code.trim())) {
    record.attempts += 1;
    await saveState(state);
    throw new Error("Verification code is invalid or expired.");
  }

  record.consumedAt = new Date().toISOString();
  const account = findOrCreateAccountByEmail(state, {
    email,
    name: email.split("@")[0] ?? "User"
  });
  acceptMatchingPendingInvitations(state, account, input.inviteToken ?? record.inviteToken);
  ensureAccountHasWorkspace(state, account);
  account.updatedAt = new Date().toISOString();
  await saveState(state);
  return toPublicAccount(account);
}

export async function createOAuthState(input: {
  provider: AuthProvider;
  redirectPath: string;
  inviteToken?: string;
}): Promise<OAuthStateRecord> {
  const state = await loadState();
  const record: OAuthStateRecord = {
    state: randomBytes(32).toString("base64url"),
    provider: input.provider,
    redirectPath: normalizeRedirectPath(input.redirectPath),
    inviteToken: input.inviteToken,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString()
  };
  state.oauthStates = state.oauthStates.filter(
    (item) => new Date(item.expiresAt).getTime() > Date.now()
  );
  state.oauthStates.push(record);
  await saveState(state);
  return record;
}

export async function consumeOAuthState(
  provider: AuthProvider,
  stateValue: string
): Promise<OAuthStateRecord> {
  const state = await loadState();
  const record = state.oauthStates.find(
    (item) => item.provider === provider && item.state === stateValue
  );
  if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new Error("OAuth state is invalid or expired.");
  }
  state.oauthStates = state.oauthStates.filter((item) => item.state !== stateValue);
  await saveState(state);
  return record;
}

export async function signInWithOAuthProfile(input: {
  provider: AuthProvider;
  providerAccountId: string;
  email: string;
  name: string;
  inviteToken?: string;
}): Promise<AccountProfile> {
  const state = await loadState();
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("OAuth provider did not return a verified email.");

  const existingIdentity = state.identities.find(
    (identity) =>
      identity.provider === input.provider &&
      identity.providerAccountId === input.providerAccountId
  );
  const account = existingIdentity
    ? requireAccountRecord(state, existingIdentity.accountId)
    : findOrCreateAccountByEmail(state, { email, name: input.name });

  if (!existingIdentity) {
    state.identities.push({
      id: randomUUID(),
      accountId: account.id,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  account.email = email;
  account.name = input.name.trim() || account.name;
  account.updatedAt = new Date().toISOString();
  acceptMatchingPendingInvitations(state, account, input.inviteToken);
  ensureAccountHasWorkspace(state, account);
  await saveState(state);
  return toPublicAccount(account);
}

export async function updateAccountProfile(
  accountId: string,
  input: { name?: string; email?: string }
): Promise<AccountProfile> {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");

  const nextEmail = input.email?.trim().toLowerCase();
  if (nextEmail) {
    if (!nextEmail.includes("@")) {
      throw new Error("A valid email is required.");
    }

    if (
      state.accounts.some(
        (item) => item.id !== account.id && item.email.toLowerCase() === nextEmail
      )
    ) {
      throw new Error("An account already exists for this email.");
    }

    account.email = nextEmail;
  }

  if (input.name?.trim()) {
    account.name = input.name.trim();
  }

  account.updatedAt = new Date().toISOString();
  await saveState(state);
  return toPublicAccount(account);
}

export async function changeAccountPassword(
  accountId: string,
  input: { currentPassword: string; newPassword: string }
): Promise<void> {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");

  if (!verifyPassword(input.currentPassword, account.passwordHash)) {
    throw new Error("Current password is incorrect.");
  }

  if (input.newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  account.passwordHash = hashPassword(input.newPassword);
  account.updatedAt = new Date().toISOString();
  state.sessions = state.sessions.filter((session) => session.accountId !== accountId);
  await saveState(state);
}

function findOrCreateAccountByEmail(
  state: Awaited<ReturnType<typeof loadState>>,
  input: { email: string; name: string }
): AccountRecord {
  const existing = state.accounts.find(
    (item) => item.email.toLowerCase() === input.email.toLowerCase()
  );
  if (existing) return existing;

  const account: AccountRecord = {
    id: randomUUID(),
    email: input.email,
    name: input.name.trim() || (input.email.split("@")[0] ?? "User"),
    passwordHash: hashPassword(randomBytes(32).toString("hex")),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.accounts.push(account);
  return account;
}

function requireAccountRecord(
  state: Awaited<ReturnType<typeof loadState>>,
  accountId: string
): AccountRecord {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");
  return account;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function normalizeRedirectPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/api")) {
    return "/skills";
  }
  return path;
}

function randomInt(min: number, max: number): number {
  const range = max - min;
  const value = Number.parseInt(randomBytes(4).toString("hex"), 16);
  return min + (value % range);
}

function hashCode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}
