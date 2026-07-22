import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("imports an existing GitHub repository and refreshes it from signed push webhooks", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "harhub-github-import-"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let github: Server | undefined;
  let app: Server | undefined;
  const previousState = process.env.HARHUB_STATE;

  try {
    github = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/app/installations/42/access_tokens") {
        response.end(JSON.stringify({ token: "installation-token" }));
        return;
      }
      if (request.url === "/installation/repositories?per_page=100&page=1") {
        response.end(JSON.stringify({ repositories: [repositoryPayload()] }));
        return;
      }
      if (request.url === "/repos/acme/product") {
        response.end(JSON.stringify(repositoryPayload()));
        return;
      }
      const commit = request.url?.match(/\/repos\/acme\/product\/commits\/(main|[a-f0-9]{40})$/)?.[1];
      if (commit) {
        response.end(JSON.stringify({
          sha: commit === "main" ? "a".repeat(40) : commit,
          commit: { tree: { sha: commit === "b".repeat(40) ? "tree-2" : "tree-1" } }
        }));
        return;
      }
      const tree = request.url?.match(/\/git\/trees\/(tree-[12])\?recursive=1$/)?.[1];
      if (tree) {
        response.end(JSON.stringify({
          sha: tree,
          truncated: false,
          tree: [{
            path: "AGENTS.md",
            mode: "100644",
            type: "blob",
            sha: tree === "tree-2" ? "agents-2" : "agents-1",
            size: 40,
            url: "https://example.invalid/blob"
          }, {
            path: ".agents/skills/broken/SKILL.md",
            mode: "100644",
            type: "blob",
            sha: "broken-skill",
            size: 0,
            url: "https://example.invalid/blob"
          }]
        }));
        return;
      }
      const blob = request.url?.match(/\/git\/blobs\/(agents-[12])$/)?.[1];
      if (blob) {
        response.end(JSON.stringify({
          encoding: "base64",
          content: Buffer.from(blob === "agents-2" ? "# Updated agent instructions\n" : "# Agent instructions\n").toString("base64")
        }));
        return;
      }
      if (request.url?.endsWith("/git/blobs/broken-skill")) {
        response.end(JSON.stringify({ encoding: "base64", content: "" }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ message: `Unhandled ${request.method} ${request.url}` }));
    });
    await listen(github);
    const githubUrl = serverUrl(github);
    process.env.HARHUB_STATE = path.join(directory, "state.json");
    process.env.HARHUB_GITHUB_APP_ID = "123";
    process.env.HARHUB_GITHUB_APP_SLUG = "harhub-test";
    process.env.HARHUB_GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.HARHUB_GITHUB_APP_CLIENT_SECRET = "secret";
    process.env.HARHUB_GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.HARHUB_GITHUB_WEBHOOK_SECRET = "webhook-secret";
    process.env.HARHUB_GITHUB_API_URL = githubUrl;

    const [{ createServerApp }, { createProject, createSession, upsertGitHubInstallation }] = await Promise.all([
      import(`../src/server/app.js?test=${Date.now()}`),
      import("../src/state/index.js")
    ]);
    const token = await createSession("acct_demo");
    await upsertGitHubInstallation({
      id: "42",
      workspaceId: "ws_demo",
      accountLogin: "acme",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: { contents: "read", metadata: "read" },
      linkedByAccountId: "acct_demo",
      linkedAt: new Date().toISOString()
    });
    app = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => app!.once("listening", resolve));
    const baseUrl = serverUrl(app);
    const importedResponse = await fetch(`${baseUrl}/api/workspaces/ws_demo/github/repositories/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ installationId: "42", repositoryId: "99" })
    });
    const importedBody = await importedResponse.text();
    assert.equal(importedResponse.status, 201, importedBody);
    const imported = JSON.parse(importedBody) as { project: { id: string }; scan: { status: string } };
    assert.equal(imported.scan.status, "queued");
    const first = await waitForInventory(baseUrl, token, imported.project.id, "a".repeat(40));
    assert.ok(first.latestSnapshot?.artifacts.some((artifact: any) => artifact.format === "agents-instructions"));
    assert.equal(
      first.latestSnapshot?.artifacts.find((artifact: any) => artifact.path.includes("broken"))?.relationship,
      "blocked"
    );
    assert.equal(first.project.bindings[0]?.kind, "instruction");
    assert.equal(first.project.syncTokenConfigured, false);

    const webhookBody = JSON.stringify({
      ref: "refs/heads/main",
      after: "b".repeat(40),
      deleted: false,
      installation: { id: 42 },
      repository: { id: 99 }
    });
    const webhookHeaders = {
      "Content-Type": "application/json",
      "X-GitHub-Delivery": "delivery-1",
      "X-GitHub-Event": "push",
      "X-Hub-Signature-256": `sha256=${createHmac("sha256", "webhook-secret").update(webhookBody).digest("hex")}`
    };
    const webhook = await fetch(`${baseUrl}/api/github/webhooks`, {
      method: "POST",
      headers: webhookHeaders,
      body: webhookBody
    });
    assert.equal(webhook.status, 202);
    const duplicate = await fetch(`${baseUrl}/api/github/webhooks`, {
      method: "POST",
      headers: webhookHeaders,
      body: webhookBody
    });
    assert.equal(duplicate.status, 202);
    assert.equal((await duplicate.json() as { duplicate?: boolean }).duplicate, true);
    const refreshed = await waitForInventory(baseUrl, token, imported.project.id, "b".repeat(40));
    assert.equal(refreshed.project.sync.revision, 2);

    const archived = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/projects/${imported.project.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(archived.status, 200);
    const legacy = await createProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      name: "Legacy Action Project",
      description: "Migrate without creating a duplicate Project.",
      repository: {
        provider: "github",
        owner: "acme",
        name: "product",
        url: "https://github.com/acme/product",
        defaultBranch: "main"
      }
    });
    assert.ok(legacy.syncToken);
    const migration = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/projects/${legacy.project.id}/github/connect`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ installationId: "42", repositoryId: "99" })
      }
    );
    assert.equal(migration.status, 200, await migration.clone().text());
    const migrated = await migration.json() as { project: { id: string; syncTokenConfigured: boolean } };
    assert.equal(migrated.project.id, legacy.project.id);
    assert.equal(migrated.project.syncTokenConfigured, false);
    await waitForInventory(baseUrl, token, legacy.project.id, "a".repeat(40));
  } finally {
    if (app) await close(app);
    if (github) await close(github);
    if (previousState === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousState;
    for (const key of [
      "HARHUB_GITHUB_APP_ID", "HARHUB_GITHUB_APP_SLUG", "HARHUB_GITHUB_APP_CLIENT_ID",
      "HARHUB_GITHUB_APP_CLIENT_SECRET", "HARHUB_GITHUB_APP_PRIVATE_KEY",
      "HARHUB_GITHUB_WEBHOOK_SECRET", "HARHUB_GITHUB_API_URL"
    ]) delete process.env[key];
    rmSync(directory, { recursive: true, force: true });
  }
});

async function waitForInventory(baseUrl: string, token: string, projectId: string, sha: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/workspaces/ws_demo/projects/${projectId}/inventory`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);
    const inventory = await response.json() as any;
    if (inventory.latestSnapshot?.commitSha === sha) return inventory;
    if (inventory.activeJob?.status === "failed") throw new Error(inventory.activeJob.failure?.message);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Inventory did not reach ${sha}.`);
}

function repositoryPayload() {
  return {
    id: 99,
    node_id: "R_99",
    name: "product",
    full_name: "acme/product",
    html_url: "https://github.com/acme/product",
    private: true,
    archived: false,
    default_branch: "main",
    description: "Product repository",
    owner: { login: "acme" },
    permissions: { admin: true, maintain: true, push: true, pull: true }
  };
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function serverUrl(server: Server): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
