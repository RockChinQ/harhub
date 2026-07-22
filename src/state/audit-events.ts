import type { WorkspaceAuditEventListResponse } from "../shared/types.js";
import { isDatabaseStateEnabled, listDatabaseAuditEvents } from "./database.js";
import { requireWorkspaceMembership } from "./records.js";
import { loadState } from "./store.js";

export async function listWorkspaceAuditEvents(
  accountId: string,
  workspaceId: string,
  options: { limit?: number; before?: string } = {}
): Promise<WorkspaceAuditEventListResponse> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);

  const limit = readLimit(options.limit);
  const before = readBefore(options.before);
  if (isDatabaseStateEnabled()) {
    return listDatabaseAuditEvents(workspaceId, {
      limit,
      ...(before ? { before } : {})
    });
  }

  const events = state.auditEvents
    .filter((event) => event.workspaceId === workspaceId)
    .filter((event) => !before || event.occurredAt < before)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, limit);
  return {
    events,
    ...(events.length === limit ? { nextBefore: events.at(-1)?.occurredAt } : {})
  };
}

function readLimit(value: number | undefined): number {
  const limit = value ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("limit must be an integer between 1 and 200.");
  }
  return limit;
}

function readBefore(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("before must be an ISO-8601 timestamp.");
  }
  return timestamp.toISOString();
}
