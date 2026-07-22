import type { WorkspaceContext } from "../state/types.js";

export function canManageWorkspace(context: WorkspaceContext): boolean {
  return context.membership.role === "owner" || context.membership.role === "admin";
}

export function assertWorkspaceAdminContext(context: WorkspaceContext): void {
  if (!canManageWorkspace(context)) {
    throw new Error("Workspace admin access is required.");
  }
}
