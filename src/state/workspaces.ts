import {
  createMembership,
  createWorkspaceRecord,
  ensureWorkspaceHasOwner,
  requireWorkspaceAdmin,
  requireWorkspaceMembership,
  toPublicAccount,
  uniqueWorkspaceSlug
} from "./records.js";
import {
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  revokeWorkspaceInvitation,
  workspaceMembersFromState
} from "./invitations.js";
import { loadState, saveState } from "./store.js";
import type {
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRecord,
  WorkspaceRole
} from "../shared/types.js";
import type { WorkspaceContext } from "./types.js";

export async function requireWorkspace(
  accountId: string,
  workspaceId: string
): Promise<WorkspaceContext | undefined> {
  const state = await loadState();
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

export async function createWorkspaceForAccount(
  accountId: string,
  input: { name: string }
): Promise<WorkspaceRecord> {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");

  const workspace = createWorkspaceRecord(state, input.name);

  state.workspaces.push(workspace);
  state.memberships.push(createMembership(accountId, workspace.id, "owner"));
  await saveState(state);

  return workspace;
}

export async function updateWorkspaceForAccount(
  accountId: string,
  workspaceId: string,
  input: { name?: string }
): Promise<WorkspaceRecord> {
  const state = await loadState();
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

  workspace.updatedAt = new Date().toISOString();
  await saveState(state);
  return workspace;
}

export async function listWorkspaceMembers(
  accountId: string,
  workspaceId: string
): Promise<WorkspaceMember[]> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);

  return workspaceMembersFromState(state, workspaceId);
}

export async function listWorkspacePendingInvitations(
  accountId: string,
  workspaceId: string
): Promise<WorkspaceInvitation[]> {
  return listWorkspaceInvitations(accountId, workspaceId);
}

export async function createWorkspaceInvitation(
  actorAccountId: string,
  workspaceId: string,
  input: { email: string; role: WorkspaceRole }
): Promise<WorkspaceInvitation> {
  return inviteWorkspaceMember(actorAccountId, workspaceId, input);
}

export async function removeWorkspaceInvitation(
  actorAccountId: string,
  workspaceId: string,
  invitationId: string
): Promise<void> {
  return revokeWorkspaceInvitation(actorAccountId, workspaceId, invitationId);
}

export async function updateWorkspaceMemberRole(
  actorAccountId: string,
  workspaceId: string,
  membershipId: string,
  role: WorkspaceRole
): Promise<WorkspaceMember> {
  const state = await loadState();
  requireWorkspaceAdmin(state, actorAccountId, workspaceId);
  const membership = state.memberships.find(
    (item) => item.id === membershipId && item.workspaceId === workspaceId
  );
  if (!membership) throw new Error("Workspace member not found.");

  const previousRole = membership.role;
  membership.role = role;
  membership.updatedAt = new Date().toISOString();
  ensureWorkspaceHasOwner(
    state,
    workspaceId,
    previousRole === "owner" && role !== "owner" ? membership.id : undefined
  );
  await saveState(state);

  const account = state.accounts.find((item) => item.id === membership.accountId);
  if (!account) throw new Error("Account not found.");
  return {
    account: toPublicAccount(account),
    membership
  };
}

export async function removeWorkspaceMember(
  actorAccountId: string,
  workspaceId: string,
  membershipId: string
): Promise<void> {
  const state = await loadState();
  requireWorkspaceAdmin(state, actorAccountId, workspaceId);
  const membership = state.memberships.find(
    (item) => item.id === membershipId && item.workspaceId === workspaceId
  );
  if (!membership) throw new Error("Workspace member not found.");

  ensureWorkspaceHasOwner(
    state,
    workspaceId,
    membership.role === "owner" ? membership.id : undefined
  );
  state.memberships = state.memberships.filter((item) => item.id !== membershipId);
  await saveState(state);
}
