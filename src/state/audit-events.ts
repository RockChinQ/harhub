import { randomUUID } from "node:crypto";

import type { WorkspaceAuditEvent, WorkspaceAuditEventListResponse } from "../shared/types.js";
import { serializeStateAccess } from "./access.js";
import { isDatabaseStateEnabled, listDatabaseAuditEvents, queryDatabase } from "./database.js";
import { requireWorkspaceMembership } from "./records.js";
import { loadState, saveState } from "./store.js";

export async function recordWorkspaceAuditEvent(input: Omit<WorkspaceAuditEvent, "id" | "occurredAt"> & {
  occurredAt?: string;
  deduplicationKey: string;
}): Promise<void> {
  const event: WorkspaceAuditEvent = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    ...(input.actorAccountId ? { actorAccountId: input.actorAccountId } : {}),
    source: input.source,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    metadata: structuredClone(input.metadata)
  };
  if (isDatabaseStateEnabled()) {
    await queryDatabase(
      `insert into harhub_audit_events (
         id, workspace_id, event_type, entity_type, entity_id, actor_account_id,
         source, occurred_at, metadata, deduplication_key
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       on conflict (workspace_id, deduplication_key) do nothing`,
      [
        event.id, event.workspaceId, event.eventType, event.entityType, event.entityId,
        event.actorAccountId ?? null, event.source, event.occurredAt,
        JSON.stringify(event.metadata), input.deduplicationKey
      ]
    );
    return;
  }
  await serializeStateAccess(async () => {
    const state = await loadState();
    if (state.auditEvents.some((candidate) =>
      candidate.workspaceId === event.workspaceId &&
      candidate.metadata.deduplicationKey === input.deduplicationKey
    )) return;
    event.metadata = { ...event.metadata, deduplicationKey: input.deduplicationKey };
    state.auditEvents.push(event);
    await saveState(state);
  });
}

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
