import {
  cleanPathList,
  createMembership,
  createWorkspaceRecord,
  ensureWorkspaceHasOwner,
  requireWorkspaceAdmin,
  requireWorkspaceMembership,
  toPublicAccount,
  uniqueWorkspaceSlug
} from "./records.js";
import { loadState, saveState } from "./store.js";
import type {
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
  input: { name: string; defaultScanPaths?: string[]; skillRoot?: string }
): Promise<WorkspaceRecord> {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Account not found.");

  const workspace = createWorkspaceRecord(state, input.name, {
    defaultScanPaths: input.defaultScanPaths,
    skillRoot: input.skillRoot
  });

  state.workspaces.push(workspace);
  state.memberships.push(createMembership(accountId, workspace.id, "owner"));
  await saveState(state);

  return workspace;
}

export async function updateWorkspaceForAccount(
  accountId: string,
  workspaceId: string,
  input: { name?: string; defaultScanPaths?: string[]; skillRoot?: string }
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

  if (input.defaultScanPaths) {
    workspace.defaultScanPaths = cleanPathList(input.defaultScanPaths);
  }

  if (input.skillRoot?.trim()) {
    workspace.skillRoot = input.skillRoot.trim();
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

export async function addWorkspaceMember(
  actorAccountId: string,
  workspaceId: string,
  input: { email: string; role: WorkspaceRole }
): Promise<WorkspaceMember> {
  const state = await loadState();
  requireWorkspaceAdmin(state, actorAccountId, workspaceId);

  const email = input.email.trim().toLowerCase();
  const account = state.accounts.find((item) => item.email.toLowerCase() === email);
  if (!account) {
    throw new Error("Invitee must create an account before being added.");
  }

  if (
    state.memberships.some(
      (membership) =>
        membership.accountId === account.id && membership.workspaceId === workspaceId
    )
  ) {
    throw new Error("Account is already a workspace member.");
  }

  const membership = createMembership(account.id, workspaceId, input.role);
  state.memberships.push(membership);
  await saveState(state);

  return {
    account: toPublicAccount(account),
    membership
  };
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
