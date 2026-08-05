import assert from "node:assert/strict";
import test from "node:test";

import {
  auditEventCursorFor,
  compareAuditEventsDescending,
  isAuditEventBeforeCursor,
  parseAuditEventCursor
} from "../src/state/audit-event-cursor.js";
import type { WorkspaceAuditEvent } from "../src/shared/types.js";

function event(id: string, occurredAt: string): WorkspaceAuditEvent {
  return {
    id,
    workspaceId: "ws_demo",
    eventType: "project.created",
    entityType: "project",
    entityId: id,
    source: "api",
    occurredAt,
    metadata: {}
  };
}

test("audit event cursor preserves rows that share a page-boundary timestamp", () => {
  const events = [event("c", "2026-08-05T10:00:00.000Z"), event("b", "2026-08-05T10:00:00.000Z"), event("a", "2026-08-05T10:00:00.000Z")]
    .sort(compareAuditEventsDescending);
  const cursor = auditEventCursorFor(events[1]);
  const parsed = parseAuditEventCursor(cursor);

  assert.deepEqual(events.filter((candidate) => isAuditEventBeforeCursor(candidate, parsed)), [events[2]]);
});

test("audit event cursor remains compatible with legacy timestamp cursors", () => {
  const parsed = parseAuditEventCursor("2026-08-05T10:00:00.000Z");
  assert.equal(isAuditEventBeforeCursor(event("z", "2026-08-05T09:59:59.999Z"), parsed), true);
  assert.equal(isAuditEventBeforeCursor(event("a", "2026-08-05T10:00:00.000Z"), parsed), false);
});
