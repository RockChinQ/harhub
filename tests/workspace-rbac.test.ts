import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("keeps workspace resources read-only for members", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-rbac-"));
  const previousStatePath = process.env.HARHUB_STATE;
  const previousHarhubDatabaseUrl = process.env.HARHUB_DATABASE_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  delete process.env.HARHUB_DATABASE_URL;
  delete process.env.DATABASE_URL;
  let server: Server | undefined;

  try {
    const {
      createProject,
      createSession,
      loadState,
      saveState
    } = await import("../src/state/index.js");
    const state = await loadState();
    const membership = state.memberships.find(
      (item) => item.accountId === "acct_demo" && item.workspaceId === "ws_demo"
    );
    assert.ok(membership);
    membership.role = "member";
    await saveState(state);

    await assert.rejects(
      createProject({
        accountId: "acct_demo",
        workspaceId: "ws_demo",
        name: "Forbidden project",
        description: "Members cannot create Projects."
      }),
      /Workspace admin access is required/
    );

    const token = await createSession("acct_demo");
    const { createServerApp } = await import("../src/server/app.js");
    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authorization = { Authorization: `Bearer ${token}` };

    assert.equal(
      (await fetch(`${baseUrl}/api/workspaces/ws_demo/assets`, {
        headers: authorization
      })).status,
      200
    );
    assert.equal(
      (await fetch(`${baseUrl}/api/workspaces/ws_demo/projects`, {
        headers: authorization
      })).status,
      200
    );

    const protectedRequests: Array<[string, string, unknown?]> = [
      ["POST", "/api/workspaces/ws_demo/assets/validate"],
      ["DELETE", "/api/workspaces/ws_demo/assets/demo-skill"],
      ["POST", "/api/workspaces/ws_demo/assets/demo-skill/share"],
      ["DELETE", "/api/workspaces/ws_demo/assets/demo-skill/share"],
      ["POST", "/api/workspaces/ws_demo/assets/demo-skill/versions/1/rollback"],
      ["POST", "/api/workspaces/ws_demo/projects", { name: "No access" }],
      ["POST", "/api/workspaces/ws_demo/projects/project/bindings/binding/publish"],
      ["POST", "/api/workspaces/ws_demo/projects/project/rotate-sync-token"],
      ["PUT", "/api/workspaces/ws_demo/projects/project/repository", {
        repository: "owner/repository"
      }],
      ["DELETE", "/api/workspaces/ws_demo/projects/project"],
      ["POST", "/api/workspaces/ws_demo/forge/sessions/session/freeze", {
        name: "No access"
      }]
    ];

    for (const [method, requestPath, body] of protectedRequests) {
      const response = await fetch(`${baseUrl}${requestPath}`, {
        method,
        headers: {
          ...authorization,
          ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      assert.equal(response.status, 403, `${method} ${requestPath}`);
      assert.deepEqual(await response.json(), {
        error: "Workspace admin access is required."
      });
    }
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => (error ? reject(error) : resolve()))
      );
    }
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    if (previousHarhubDatabaseUrl === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousHarhubDatabaseUrl;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
