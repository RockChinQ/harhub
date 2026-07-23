import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { GitHubInstallation, WorkspaceMembership } from "../src/shared/types.js";

test("GitHub App installations follow the linked Account across its Workspaces", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "harhub-github-installation-account-"));
  const previousState = process.env.HARHUB_STATE;
  const previousDatabase = process.env.HARHUB_DATABASE_URL;
  process.env.HARHUB_STATE = path.join(directory, "state.json");
  delete process.env.HARHUB_DATABASE_URL;

  try {
    const state = await import(`../src/state/index.js?github-installation-account=${Date.now()}`);
    const owner = await state.signInForDevelopment({ email: "owner@example.com" });
    const ownerState = await state.loadState();
    const firstWorkspaceId = ownerState.memberships.find(
      (membership: WorkspaceMembership) => membership.accountId === owner.id
    )?.workspaceId;
    assert.ok(firstWorkspaceId);
    const secondWorkspace = await state.createWorkspaceForAccount(owner.id, { name: "Second Workspace" });

    await state.upsertGitHubInstallation({
      id: "installation-42",
      workspaceId: firstWorkspaceId,
      accountLogin: "acme",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: { contents: "read", metadata: "read" },
      linkedByAccountId: owner.id,
      linkedAt: new Date().toISOString()
    });

    assert.deepEqual(
      (await state.listGitHubInstallations(owner.id, secondWorkspace.id)).map(
        (installation: GitHubInstallation) => installation.id
      ),
      ["installation-42"]
    );

    const other = await state.signInForDevelopment({ email: "other@example.com" });
    const sharedState = await state.loadState();
    const now = new Date().toISOString();
    sharedState.memberships.push({
      id: "other-second-workspace-membership",
      accountId: other.id,
      workspaceId: secondWorkspace.id,
      role: "admin",
      createdAt: now,
      updatedAt: now
    });
    await state.saveState(sharedState);

    assert.deepEqual(await state.listGitHubInstallations(other.id, secondWorkspace.id), []);
  } finally {
    if (previousState === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousState;
    if (previousDatabase === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousDatabase;
    rmSync(directory, { recursive: true, force: true });
  }
});
