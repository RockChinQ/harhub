import type { WorkspaceAuditEvent } from "../../shared/types.js";

export interface GtmFunnelSummary {
  workspaceCreated: number;
  projectsImported: number;
  projectsScanned: number;
  projectsWithHarnessAssets: number;
  projectsWithProposal: number;
  projectsWithMergedProposal: number;
  proposalsCreated: number;
  proposalsMerged: number;
}

export function summarizeGtmFunnel(
  events: WorkspaceAuditEvent[],
  options: { since?: string } = {}
): GtmFunnelSummary {
  const since = options.since ? new Date(options.since).getTime() : Number.NEGATIVE_INFINITY;
  const selected = events.filter((event) => new Date(event.occurredAt).getTime() >= since);
  const importedProjects = new Set<string>();
  const scannedProjects = new Set<string>();
  const projectsWithHarnessAssets = new Set<string>();
  const projectsWithProposal = new Set<string>();
  const projectsWithMergedProposal = new Set<string>();
  const proposalsCreated = new Set<string>();
  const proposalsMerged = new Set<string>();

  for (const event of selected) {
    if (
      event.eventType === "project.created" &&
      typeof event.metadata.repository === "string" &&
      event.metadata.repository.length > 0
    ) importedProjects.add(event.entityId);
    if (event.eventType === "project.repository.scan.succeeded") {
      scannedProjects.add(event.entityId);
      if (numberMetadata(event, "artifactCount") > 0) projectsWithHarnessAssets.add(event.entityId);
    }
    if (event.eventType === "project.proposal.created") {
      projectsWithProposal.add(event.entityId);
      proposalsCreated.add(stringMetadata(event, "proposalId") ?? event.id);
    }
    if (event.eventType === "project.proposal.merged") {
      projectsWithMergedProposal.add(event.entityId);
      proposalsMerged.add(stringMetadata(event, "proposalId") ?? event.id);
    }
  }

  return {
    workspaceCreated: selected.filter((event) => event.eventType === "workspace.created").length,
    projectsImported: importedProjects.size,
    projectsScanned: scannedProjects.size,
    projectsWithHarnessAssets: projectsWithHarnessAssets.size,
    projectsWithProposal: projectsWithProposal.size,
    projectsWithMergedProposal: projectsWithMergedProposal.size,
    proposalsCreated: proposalsCreated.size,
    proposalsMerged: proposalsMerged.size
  };
}

function numberMetadata(event: WorkspaceAuditEvent, key: string): number {
  const value = event.metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringMetadata(event: WorkspaceAuditEvent, key: string): string | undefined {
  const value = event.metadata[key];
  return typeof value === "string" && value ? value : undefined;
}
