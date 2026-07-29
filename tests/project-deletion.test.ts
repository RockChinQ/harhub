import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("deletes only the Harhub Project index after explicit confirmation", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-project-delete-"));
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  let server: Server | undefined;

  try {
    const {
      createProject,
      createSession,
      getProject,
      listProjects,
      loadState,
      saveState,
      syncProjectFromRepository
    } = await import("../src/state/index.js");
    const { createServerApp } = await import("../src/server/app.js");
    const created = await createProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      name: "Delete me",
      description: "A tracked Project whose index can be removed.",
      repository: {
        provider: "github",
        owner: "RockChinQ",
        name: "existing-repository",
        url: "https://github.com/RockChinQ/existing-repository",
        defaultBranch: "main"
      }
    });
    assert.ok(created.syncToken);
    const projectId = created.project.id;
    const snapshotId = "snapshot-delete-me";
    const now = new Date().toISOString();
    const state = await loadState();
    state.projectRepositoryConnections.push({
      workspaceId: "ws_demo",
      projectId,
      mode: "github-app",
      status: "active",
      installationId: "installation-1",
      permissionMode: "read",
      repositoryId: "repository-1",
      repositoryNodeId: "R_repository_1",
      owner: "RockChinQ",
      name: "existing-repository",
      defaultBranch: "main",
      connectedAt: now
    });
    state.projectScanJobs.push({
      id: "scan-delete-me",
      workspaceId: "ws_demo",
      projectId,
      trigger: "manual",
      status: "succeeded",
      attempts: 1,
      createdAt: now,
      completedAt: now
    });
    state.projectInventorySnapshots.push({
      id: snapshotId,
      workspaceId: "ws_demo",
      projectId,
      commitSha: "a".repeat(40),
      detectorVersion: "test",
      trigger: "manual",
      artifacts: [],
      createdAt: now
    });
    state.projectInventoryFiles.push({
      snapshotId,
      artifactId: "artifact-delete-me",
      path: "SKILL.md",
      contentBase64: Buffer.from("deleted index").toString("base64")
    });
    state.projectBindingPolicies.push({
      projectId,
      artifactPath: ".harness/skills/example",
      ownership: "repository",
      decidedByAccountId: "acct_demo",
      decidedAt: now
    });
    state.projectChangeProposals.push({
      id: "proposal-delete-me",
      workspaceId: "ws_demo",
      projectId,
      kind: "bootstrap",
      status: "preview",
      baseSha: "a".repeat(40),
      branch: "harhub/bootstrap",
      files: [],
      createdByAccountId: "acct_demo",
      createdAt: now,
      updatedAt: now
    });
    state.forgeSessions.push({
      id: "forge-delete-me",
      workspaceId: "ws_demo",
      accountId: "acct_demo",
      title: "Delete me",
      status: "complete",
      answerCount: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      requirement: "Create a deletable Project.",
      answers: [],
      frozenProject: {
        id: projectId,
        name: created.project.name,
        frozenAt: now
      },
      viewState: {
        followUpDrafts: [],
        markdownView: "preview"
      }
    });
    await saveState(state);

    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const token = await createSession("acct_demo");
    const projectUrl = `${baseUrl}/api/workspaces/ws_demo/projects/${projectId}`;

    const unconfirmed = await fetch(projectUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(unconfirmed.status, 400);
    assert.match(await unconfirmed.text(), /explicit confirmation/);
    assert.equal((await getProject("acct_demo", "ws_demo", projectId)).id, projectId);

    const deleted = await fetch(projectUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ confirm: true })
    });
    assert.equal(deleted.status, 204);
    assertPrivateNoStore(deleted);
    assert.equal(await deleted.text(), "");

    await assert.rejects(
      getProject("acct_demo", "ws_demo", projectId),
      /Project not found/
    );
    assert.equal((await listProjects("acct_demo", "ws_demo")).projects.length, 0);
    await assert.rejects(
      syncProjectFromRepository(projectId, created.syncToken!, {
        schemaVersion: 1,
        repository: "RockChinQ/existing-repository",
        commitSha: "b".repeat(40),
        ref: "main",
        bindings: []
      }),
      /credentials are invalid/
    );

    const retained = await loadState();
    assert.equal(retained.projects.some((project) => project.id === projectId), false);
    assert.equal(retained.projectRepositoryConnections.some((item) => item.projectId === projectId), false);
    assert.equal(retained.projectScanJobs.some((item) => item.projectId === projectId), false);
    assert.equal(retained.projectInventorySnapshots.some((item) => item.projectId === projectId), false);
    assert.equal(retained.projectInventoryFiles.some((item) => item.snapshotId === snapshotId), false);
    assert.equal(retained.projectBindingPolicies.some((item) => item.projectId === projectId), false);
    assert.equal(retained.projectChangeProposals.some((item) => item.projectId === projectId), false);
    assert.equal(
      retained.auditEvents.some((event) =>
        event.eventType === "project.deleted" &&
        event.entityId === projectId &&
        event.actorAccountId === "acct_demo"
      ),
      true
    );
    assert.equal(
      retained.forgeSessions.find((session) => session.id === "forge-delete-me")?.frozenProject,
      undefined
    );
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => error ? reject(error) : resolve())
      );
    }
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

function assertPrivateNoStore(response: Response): void {
  assert.match(response.headers.get("cache-control") ?? "", /private/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
}
