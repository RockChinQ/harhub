import assert from "node:assert/strict";
import test from "node:test";

import { createBootstrapProposal } from "../src/server/services/project-repository-proposals.js";

test("bootstrap proposals require explicit write permissions and only contain reviewed Harhub files", () => {
  const base = {
    project: {
      id: "project-12345678",
      workspaceId: "ws_demo",
      name: "Product",
      slug: "product",
      description: "Product repository",
      status: "active" as const,
      repository: {
        provider: "github" as const,
        id: "99",
        nodeId: "R_99",
        owner: "acme",
        name: "product",
        url: "https://github.com/acme/product",
        defaultBranch: "main"
      },
      bindings: [],
      sync: { status: "synced" as const, revision: 1 },
      syncTokenConfigured: false,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z"
    },
    connection: {
      workspaceId: "ws_demo",
      projectId: "project-12345678",
      repositoryId: "99",
      repositoryNodeId: "R_99",
      owner: "acme",
      name: "product",
      defaultBranch: "main",
      mode: "github-app" as const,
      status: "active" as const,
      installationId: "42",
      permissionMode: "write" as const,
      connectedAt: "2026-07-22T00:00:00.000Z"
    },
    installation: {
      id: "42",
      workspaceId: "ws_demo",
      accountLogin: "acme",
      accountType: "Organization" as const,
      repositorySelection: "selected" as const,
      permissions: { contents: "write", pull_requests: "write" },
      linkedByAccountId: "acct_demo",
      linkedAt: "2026-07-22T00:00:00.000Z"
    },
    snapshot: {
      id: "snapshot",
      workspaceId: "ws_demo",
      projectId: "project-12345678",
      commitSha: "a".repeat(40),
      detectorVersion: "repository-harness-v1",
      trigger: "initial" as const,
      artifacts: [],
      createdAt: "2026-07-22T00:00:00.000Z"
    },
    policies: [],
    accountId: "acct_demo"
  };
  const proposal = createBootstrapProposal(base);
  assert.equal(proposal.files.length, 1);
  assert.equal(proposal.files[0]?.path, ".harhub/project.json");
  assert.equal(proposal.files.some((file) => file.path.startsWith(".github/")), false);
  assert.match(proposal.files[0]?.content ?? "", /"mode": "github-app"/);

  assert.throws(
    () => createBootstrapProposal({
      ...base,
      connection: { ...base.connection, permissionMode: "read" }
    }),
    /Contents: write/
  );
});
