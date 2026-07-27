import { randomBytes } from "node:crypto";
import {
  createMembership,
  requireWorkspaceAdmin,
  requireWorkspaceMembership,
  toPublicAccount
} from "./records.js";
import { loadState, saveState } from "./store.js";
import type {
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRecord,
  WorkspaceRole
} from "../shared/types.js";
import type { AccountRecord, AppState } from "./types.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function listWorkspaceInvitations(
  accountId: string,
  workspaceId: string
): Promise<WorkspaceInvitation[]> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  return pendingInvitations(state, workspaceId);
}

export async function inviteWorkspaceMember(
  actorAccountId: string,
  workspaceId: string,
  input: { email: string; role: WorkspaceRole }
): Promise<WorkspaceInvitation> {
  const state = await loadState();
  requireWorkspaceAdmin(state, actorAccountId, workspaceId);

  const email = normalizeEmail(input.email);
  if (!email) throw new Error("A valid email is required.");

  const existingAccount = state.accounts.find(
    (account) => account.email.toLowerCase() === email
  );
  if (
    existingAccount &&
    state.memberships.some(
      (membership) =>
        membership.accountId === existingAccount.id &&
        membership.workspaceId === workspaceId
    )
  ) {
    throw new Error("Account is already a workspace member.");
  }

  const existingInvitation = state.invitations.find(
    (invitation) =>
      invitation.workspaceId === workspaceId &&
      invitation.email.toLowerCase() === email &&
      invitation.status === "pending" &&
      new Date(invitation.expiresAt).getTime() > Date.now()
  );

  if (existingInvitation) {
    existingInvitation.role = input.role;
    existingInvitation.invitedByAccountId = actorAccountId;
    existingInvitation.expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
    existingInvitation.updatedAt = new Date().toISOString();
    await saveState(state);
    return existingInvitation;
  }

  const invitation: WorkspaceInvitation = {
    id: randomBytes(16).toString("hex"),
    workspaceId,
    email,
    role: input.role,
    token: randomBytes(32).toString("base64url"),
    invitedByAccountId: actorAccountId,
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
    updatedAt: new Date().toISOString()
  };

  state.invitations.push(invitation);
  await saveState(state);
  return invitation;
}

export async function revokeWorkspaceInvitation(
  actorAccountId: string,
  workspaceId: string,
  invitationId: string
): Promise<void> {
  const state = await loadState();
  requireWorkspaceAdmin(state, actorAccountId, workspaceId);
  const invitation = state.invitations.find(
    (item) => item.id === invitationId && item.workspaceId === workspaceId
  );
  if (!invitation) throw new Error("Workspace invitation not found.");

  invitation.status = "revoked";
  invitation.updatedAt = new Date().toISOString();
  await saveState(state);
}

export async function getInvitationByToken(token: string): Promise<{
  invitation: WorkspaceInvitation;
  workspace: WorkspaceRecord;
} | undefined> {
  const state = await loadState();
  const invitation = findUsableInvitation(state, token);
  if (!invitation) return undefined;
  const workspace = state.workspaces.find((item) => item.id === invitation.workspaceId);
  if (!workspace) return undefined;
  return { invitation, workspace };
}

export async function acceptWorkspaceInvitation(
  accountId: string,
  token: string
): Promise<WorkspaceRecord> {
  const state = await loadState();
  const account = requireAccount(state, accountId);
  if (!account.emailVerifiedAt) {
    throw new Error("Verify your account email before accepting this invitation.");
  }
  const invitation = findInvitationByToken(state, token);
  if (!invitation) throw new Error("Invitation is invalid or expired.");

  if (invitation.status === "accepted" && invitation.acceptedByAccountId === account.id) {
    const workspace = requireInvitationWorkspace(state, invitation);
    if (!isWorkspaceMember(state, account.id, workspace.id)) {
      state.memberships.push(createMembership(account.id, workspace.id, invitation.role));
      await saveState(state);
    }
    return workspace;
  }

  assertPendingInvitationForAccount(invitation, account);
  const workspace = acceptInvitationForAccount(state, account, invitation);
  ensureAccountHasWorkspace(state, account);
  await saveState(state);
  return workspace;
}

export function acceptMatchingPendingInvitations(
  state: AppState,
  account: AccountRecord,
  token?: string
): WorkspaceRecord | undefined {
  if (!account.emailVerifiedAt) return undefined;

  let acceptedWorkspace: WorkspaceRecord | undefined;

  if (token) {
    const invitation = findInvitationByToken(state, token);
    if (!invitation) throw new Error("Invitation is invalid or expired.");
    assertPendingInvitationForAccount(invitation, account);
    acceptedWorkspace = acceptInvitationForAccount(state, account, invitation);
  }

  for (const invitation of state.invitations) {
    if (
      invitation.status === "pending" &&
      invitation.email.toLowerCase() === account.email.toLowerCase() &&
      new Date(invitation.expiresAt).getTime() > Date.now()
    ) {
      acceptedWorkspace = acceptInvitationForAccount(state, account, invitation);
    }
  }

  return acceptedWorkspace;
}

export function ensureAccountHasWorkspace(
  state: AppState,
  account: AccountRecord
): WorkspaceRecord | undefined {
  if (state.memberships.some((membership) => membership.accountId === account.id)) {
    return undefined;
  }

  const workspace = {
    id: randomBytes(16).toString("hex"),
    name: `${account.name}'s Workspace`,
    slug: uniqueFallbackWorkspaceSlug(state, account.name),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.workspaces.push(workspace);
  state.memberships.push(createMembership(account.id, workspace.id, "owner"));
  return workspace;
}

export function pendingInvitations(
  state: AppState,
  workspaceId: string
): WorkspaceInvitation[] {
  return state.invitations
    .filter(
      (invitation) =>
        invitation.workspaceId === workspaceId &&
        invitation.status === "pending" &&
        new Date(invitation.expiresAt).getTime() > Date.now()
    )
    .sort((a, b) => a.email.localeCompare(b.email));
}

export function workspaceMembersFromState(
  state: AppState,
  workspaceId: string
): WorkspaceMember[] {
  return state.memberships
    .filter((membership) => membership.workspaceId === workspaceId)
    .map((membership) => {
      const account = state.accounts.find((item) => item.id === membership.accountId);
      if (!account) return undefined;
      return {
        account: toPublicAccount(account),
        membership
      };
    })
    .filter((member): member is WorkspaceMember => Boolean(member))
    .sort((a, b) => a.account.email.localeCompare(b.account.email));
}

function findUsableInvitation(
  state: AppState,
  token: string
): WorkspaceInvitation | undefined {
  const invitation = findInvitationByToken(state, token);
  if (!invitation) return undefined;
  if (invitation.status !== "pending") return undefined;
  if (!isInvitationUsable(invitation)) return undefined;
  return invitation;
}

function findInvitationByToken(
  state: AppState,
  token: string
): WorkspaceInvitation | undefined {
  return state.invitations.find((item) => item.token === token);
}

function isInvitationUsable(invitation: WorkspaceInvitation): boolean {
  return new Date(invitation.expiresAt).getTime() > Date.now();
}

function assertPendingInvitationForAccount(
  invitation: WorkspaceInvitation,
  account: AccountRecord
): void {
  if (invitation.status !== "pending" || !isInvitationUsable(invitation)) {
    throw new Error("Invitation is invalid or expired.");
  }
  if (invitation.email.toLowerCase() !== account.email.toLowerCase()) {
    throw new Error("Invitation email does not match this account.");
  }
}

function acceptInvitationForAccount(
  state: AppState,
  account: AccountRecord,
  invitation: WorkspaceInvitation
): WorkspaceRecord {
  const workspace = requireInvitationWorkspace(state, invitation);

  if (!isWorkspaceMember(state, account.id, invitation.workspaceId)) {
    state.memberships.push(createMembership(account.id, invitation.workspaceId, invitation.role));
  }

  invitation.status = "accepted";
  invitation.acceptedAt = new Date().toISOString();
  invitation.acceptedByAccountId = account.id;
  invitation.updatedAt = new Date().toISOString();
  return workspace;
}

function requireInvitationWorkspace(
  state: AppState,
  invitation: WorkspaceInvitation
): WorkspaceRecord {
  const workspace = state.workspaces.find((item) => item.id === invitation.workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  return workspace;
}

function isWorkspaceMember(
  state: AppState,
  accountId: string,
  workspaceId: string
): boolean {
  return state.memberships.some(
    (membership) =>
      membership.accountId === accountId &&
      membership.workspaceId === workspaceId
  );
}

function requireAccount(state: AppState, accountId: string): AccountRecord {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");
  return account;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function uniqueFallbackWorkspaceSlug(state: AppState, name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workspace";
  let candidate = base;
  let suffix = 2;
  while (state.workspaces.some((workspace) => workspace.slug === candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
