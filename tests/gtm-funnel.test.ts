import assert from "node:assert/strict";
import test from "node:test";

import { summarizeGtmFunnel } from "../src/features/gtm/funnel.js";
import type { WorkspaceAuditEvent } from "../src/shared/types.js";

function event(
  eventType: WorkspaceAuditEvent["eventType"],
  entityId: string,
  occurredAt: string,
  metadata: Record<string, unknown> = {}
): WorkspaceAuditEvent {
  return {
    id: `${eventType}-${entityId}-${occurredAt}`,
    workspaceId: "ws_demo",
    eventType,
    entityType: eventType === "workspace.created" ? "workspace" : "project",
    entityId,
    source: "api",
    occurredAt,
    metadata
  };
}

test("summarizes the repository governance funnel by distinct Project", () => {
  const summary = summarizeGtmFunnel([
    event("workspace.created", "ws_demo", "2026-08-01T00:00:00.000Z"),
    event("project.created", "project-a", "2026-08-01T01:00:00.000Z", { repository: "acme/agent-app" }),
    event("project.repository.scan.succeeded", "project-a", "2026-08-01T02:00:00.000Z", { artifactCount: 4 }),
    event("project.repository.scan.succeeded", "project-a", "2026-08-01T03:00:00.000Z", { artifactCount: 5 }),
    event("project.proposal.created", "project-a", "2026-08-01T04:00:00.000Z", { proposalId: "proposal-a" }),
    event("project.proposal.merged", "project-a", "2026-08-01T05:00:00.000Z", { proposalId: "proposal-a" }),
    event("project.created", "project-b", "2026-08-02T01:00:00.000Z", { repository: "acme/agent-api" }),
    event("project.repository.scan.succeeded", "project-b", "2026-08-02T02:00:00.000Z", { artifactCount: 0 })
  ]);

  assert.deepEqual(summary, {
    workspaceCreated: 1,
    projectsImported: 2,
    projectsScanned: 2,
    projectsWithHarnessAssets: 1,
    projectsWithProposal: 1,
    projectsWithMergedProposal: 1,
    proposalsCreated: 1,
    proposalsMerged: 1
  });
});

test("does not report repository-less Projects as imports", () => {
  const summary = summarizeGtmFunnel([
    event("project.created", "manual-project", "2026-08-03T00:00:00.000Z", { repository: null })
  ]);

  assert.equal(summary.projectsImported, 0);
});

test("ignores events outside the selected reporting window", () => {
  const summary = summarizeGtmFunnel(
    [
      event("project.created", "project-old", "2026-07-01T00:00:00.000Z", { repository: "acme/old" }),
      event("project.created", "project-new", "2026-08-02T00:00:00.000Z", { repository: "acme/new" })
    ],
    { since: "2026-08-01T00:00:00.000Z" }
  );

  assert.equal(summary.projectsImported, 1);
});
