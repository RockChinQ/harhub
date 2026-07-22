import { randomUUID } from "node:crypto";

import type {
  GitHubInstallation,
  HarhubProject,
  ProjectBindingPolicy,
  ProjectChangeProposal,
  ProjectInventorySnapshot
} from "../../shared/types.js";
import type { ProjectRepositoryConnectionRecord } from "../../state/types.js";
import { createRepositoryPullRequest } from "./github-app.js";

export function createBootstrapProposal(input: {
  project: HarhubProject;
  connection: ProjectRepositoryConnectionRecord;
  installation: GitHubInstallation;
  snapshot: ProjectInventorySnapshot;
  policies: ProjectBindingPolicy[];
  accountId: string;
}): ProjectChangeProposal {
  assertManagedChangesAvailable(input.connection, input.installation);
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    workspaceId: input.project.workspaceId,
    projectId: input.project.id,
    kind: "bootstrap",
    status: "preview",
    baseSha: input.snapshot.commitSha,
    branch: `harhub/bootstrap-${input.project.id.slice(0, 8)}-${Date.now().toString(36)}`,
    files: [{
      path: ".harhub/project.json",
      status: "added",
      content: `${JSON.stringify({
        schemaVersion: 1,
        projectId: input.project.id,
        integration: { mode: "github-app" },
        repository: {
          id: input.connection.repositoryId,
          fullName: `${input.connection.owner}/${input.connection.name}`,
          defaultBranch: input.connection.defaultBranch
        },
        inventory: {
          detectorVersion: input.snapshot.detectorVersion,
          roots: inventoryRoots(input.snapshot),
          ignores: input.policies
            .filter((policy) => policy.ownership === "ignored")
            .map((policy) => policy.artifactPath)
            .sort()
        },
        bindings: input.snapshot.artifacts
          .filter((artifact) => artifact.relationship !== "ignored")
          .map((artifact) => ({
            kind: artifact.kind,
            path: artifact.path,
            ownership: artifact.relationship.startsWith("library-") ? "library" : "repository",
            ...(artifact.libraryAssetId ? { libraryAssetId: artifact.libraryAssetId } : {}),
            ...(artifact.libraryVersion ? { libraryVersion: artifact.libraryVersion } : {})
          }))
      }, null, 2)}\n`
    }],
    createdByAccountId: input.accountId,
    createdAt: now,
    updatedAt: now
  };
}

export async function openBootstrapProposal(input: {
  proposal: ProjectChangeProposal;
  connection: ProjectRepositoryConnectionRecord;
  installation: GitHubInstallation;
}): Promise<ProjectChangeProposal> {
  assertManagedChangesAvailable(input.connection, input.installation);
  if (input.proposal.status !== "preview" && input.proposal.status !== "failed") {
    throw new Error("Only a preview or failed proposal can be opened.");
  }
  const branch = input.proposal.status === "failed"
    ? `${input.proposal.branch.replace(/-retry-[a-z0-9]+$/, "")}-retry-${Date.now().toString(36)}`
    : input.proposal.branch;
  const pull = await createRepositoryPullRequest({
    installationId: input.connection.installationId!,
    owner: input.connection.owner,
    name: input.connection.name,
    defaultBranch: input.connection.defaultBranch,
    baseSha: input.proposal.baseSha,
    branch,
    title: "Configure Harhub repository tracking",
    body: [
      "This PR adds the explicit Harhub Project manifest for this repository.",
      "",
      "Harhub already observes the repository through the installed GitHub App; no repository secret or workflow is required."
    ].join("\n"),
    files: input.proposal.files
  });
  return {
    ...input.proposal,
    branch,
    status: "open",
    pullNumber: pull.number,
    pullUrl: pull.url,
    updatedAt: new Date().toISOString()
  };
}

function assertManagedChangesAvailable(
  connection: ProjectRepositoryConnectionRecord,
  installation: GitHubInstallation
): void {
  if (
    connection.mode !== "github-app" || !connection.installationId ||
    connection.permissionMode !== "write" ||
    installation.permissions.contents !== "write" ||
    installation.permissions.pull_requests !== "write"
  ) {
    throw new Error(
      "Managed changes require GitHub App Contents: write and Pull requests: write permissions."
    );
  }
}

function inventoryRoots(snapshot: ProjectInventorySnapshot): string[] {
  return Array.from(new Set(snapshot.artifacts.map((artifact) => {
    const segments = artifact.path.split("/");
    return segments.length > 1 ? segments.slice(0, artifact.kind === "skill" ? -1 : 1).join("/") : artifact.path;
  }))).sort();
}
