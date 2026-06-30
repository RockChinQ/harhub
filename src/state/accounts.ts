import { randomBytes, randomUUID } from "node:crypto";
import { createMembership, createWorkspaceRecord, toPublicAccount } from "./records.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { loadState, saveState } from "./store.js";
import type {
  AccountProfile,
  WorkspaceMembership,
  WorkspaceRecord
} from "../shared/types.js";
import type { AccountRecord, AuthContext } from "./types.js";

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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const workspace = createWorkspaceRecord(
    state,
    input.workspaceName?.trim() || `${account.name}'s Workspace`
  );

  state.accounts.push(account);
  state.workspaces.push(workspace);
  state.memberships.push(createMembership(account.id, workspace.id, "owner"));
  saveState(state);

  return toPublicAccount(account);
}

export function updateAccountProfile(
  accountId: string,
  input: { name?: string; email?: string }
): AccountProfile {
  const state = loadState();
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
  saveState(state);
  return toPublicAccount(account);
}

export function changeAccountPassword(
  accountId: string,
  input: { currentPassword: string; newPassword: string }
): void {
  const state = loadState();
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
  saveState(state);
}
