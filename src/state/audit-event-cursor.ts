import type { WorkspaceAuditEvent } from "../shared/types.js";

export interface AuditEventCursor {
  occurredAt: string;
  id?: string;
}

export function auditEventCursorFor(event: WorkspaceAuditEvent): string {
  return `${event.occurredAt}|${encodeURIComponent(event.id)}`;
}

export function parseAuditEventCursor(value: string): AuditEventCursor {
  const separator = value.indexOf("|");
  const occurredAt = separator === -1 ? value : value.slice(0, separator);
  const timestamp = new Date(occurredAt);
  if (Number.isNaN(timestamp.getTime())) throw new Error("before must be an audit event cursor or ISO-8601 timestamp.");
  if (separator === -1) return { occurredAt: timestamp.toISOString() };
  const id = decodeURIComponent(value.slice(separator + 1));
  if (!id) throw new Error("before must contain an audit event ID.");
  return { occurredAt: timestamp.toISOString(), id };
}

export function compareAuditEventsDescending(left: WorkspaceAuditEvent, right: WorkspaceAuditEvent): number {
  return right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id);
}

export function isAuditEventBeforeCursor(event: WorkspaceAuditEvent, cursor: AuditEventCursor): boolean {
  if (event.occurredAt !== cursor.occurredAt) return event.occurredAt < cursor.occurredAt;
  return cursor.id !== undefined && event.id < cursor.id;
}
