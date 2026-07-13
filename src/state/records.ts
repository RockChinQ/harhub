import { randomUUID } from "node:crypto";
import { slugify } from "../shared/markdown.js";
import type {
  AccountProfile,
  WorkspaceMembership,
  WorkspaceRecord,
  WorkspaceRole
} from "../shared/types.js";
import type { AccountRecord, AppState } from "./types.js";

export function toPublicAccount(account: AccountRecord): AccountProfile {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };
}

export function createWorkspaceRecord(
  state: AppState | undefined,
  name: string
): WorkspaceRecord {
  return {
    id: randomUUID(),
    name: name.trim(),
    slug: state ? uniqueWorkspaceSlug(state, name) : slugify(name),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createMembership(
  accountId: string,
  workspaceId: string,
  role: WorkspaceRole
): WorkspaceMembership {
  return {
    id: randomUUID(),
    accountId,
    workspaceId,
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function uniqueWorkspaceSlug(
  state: AppState,
  name: string,
  currentId?: string
): string {
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

export function requireWorkspaceMembership(
  state: AppState,
  accountId: string,
  workspaceId: string
): WorkspaceMembership {
  const membership = state.memberships.find(
    (item) => item.accountId === accountId && item.workspaceId === workspaceId
  );
  if (!membership) throw new Error("Workspace access is required.");
  return membership;
}

export function requireWorkspaceAdmin(
  state: AppState,
  accountId: string,
  workspaceId: string
): WorkspaceMembership {
  const membership = requireWorkspaceMembership(state, accountId, workspaceId);
  if (!["owner", "admin"].includes(membership.role)) {
    throw new Error("Workspace admin access is required.");
  }
  return membership;
}

export function ensureWorkspaceHasOwner(
  state: AppState,
  workspaceId: string,
  excludingMembershipId?: string
): void {
  const ownerCount = state.memberships.filter(
    (membership) =>
      membership.workspaceId === workspaceId &&
      membership.role === "owner" &&
      membership.id !== excludingMembershipId
  ).length;

  if (ownerCount === 0) {
    throw new Error("Workspace must keep at least one owner.");
  }
}
