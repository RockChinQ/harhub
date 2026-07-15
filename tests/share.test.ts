import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runInstall, resolveShareReference } from "../src/cli/commands/share.js";
import { closeHarhubHttp } from "../src/cli/http.js";
import type { AssetCatalog } from "../src/shared/types.js";

test("creates and revokes a public asset share without exposing storage", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-share-api-"));
  const originalDirectory = process.cwd();
  process.chdir(temporaryDirectory);
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  delete process.env.HARHUB_DATABASE_URL;
  delete process.env.DATABASE_URL;

  const { createServerApp } = await import("../src/server/app.js");
  const { writeWorkspaceAssetCatalog } = await import("../src/state/index.js");
  await writeWorkspaceAssetCatalog("ws_demo", testCatalog());

  const server = createServerApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@harhub.local", password: "harhub" })
    });
    const login = await loginResponse.json();
    assert.equal(loginResponse.status, 200);

    const shareResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/assets/demo-skill/share`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${login.token}` }
      }
    );
    assert.equal(shareResponse.status, 201);
    const share = await shareResponse.json();
    assert.equal(share.asset.displayName, "Demo Skill");
    assert.equal(share.fileName, "demo-skill.zip");
    assert.equal(share.cliCommand, `harhub install ${share.shareUrl}`);
    assert.equal("storage" in share.asset, false);
    assert.equal(JSON.stringify(share).includes("test-bucket"), false);

    const repeatedResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/assets/demo-skill/share`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${login.token}` }
      }
    );
    assert.equal((await repeatedResponse.json()).token, share.token);

    const publicResponse = await fetch(`${baseUrl}/api/public/shares/${share.token}`);
    assert.equal(publicResponse.status, 200);
    assert.equal((await publicResponse.json()).token, share.token);

    const revokeResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/assets/demo-skill/share`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${login.token}` }
      }
    );
    assert.equal(revokeResponse.status, 204);
    assert.equal((await fetch(`${baseUrl}/api/public/shares/${share.token}`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    delete process.env.HARHUB_STATE;
    process.chdir(originalDirectory);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("installs a shared zip into the current directory", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-share-cli-"));
  const originalDirectory = process.cwd();
  const zip = Buffer.from("PK\u0003\u0004shared-skill");
  const server = createServer((request, response) => {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    if (request.url === "/api/public/shares/test-token") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        token: "test-token",
        createdAt: new Date().toISOString(),
        shareUrl: `${baseUrl}/s/test-token`,
        downloadUrl: `${baseUrl}/download`,
        cliCommand: `harhub install ${baseUrl}/s/test-token`,
        fileName: "shared-skill.zip",
        asset: {
          id: "asset:skill:test",
          kind: "skill",
          name: "shared-skill",
          displayName: "Shared Skill",
          slug: "shared-skill",
          description: "Shared",
          health: "valid",
          validation: { errors: 0, warnings: 0 }
        }
      }));
      return;
    }
    if (request.url === "/download") {
      response.setHeader("Content-Type", "application/zip");
      response.end(zip);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const shareUrl = `http://127.0.0.1:${address.port}/s/test-token`;

  try {
    process.chdir(temporaryDirectory);
    assert.deepEqual(resolveShareReference(shareUrl), {
      apiUrl: `http://127.0.0.1:${address.port}`,
      token: "test-token"
    });
    assert.equal(await runInstall({ positionals: [shareUrl], options: {} }), 0);
    assert.deepEqual(readFileSync(path.join(temporaryDirectory, "shared-skill.zip")), zip);
    assert.equal(await runInstall({ positionals: [shareUrl], options: {} }), 0);
    assert.deepEqual(readFileSync(path.join(temporaryDirectory, "shared-skill-2.zip")), zip);
  } finally {
    process.chdir(originalDirectory);
    await closeHarhubHttp();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

function testCatalog(): AssetCatalog {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workspaceId: "ws_demo",
    skills: [],
    assets: [{
      id: "asset:skill:demo-skill",
      kind: "skill",
      name: "demo-skill",
      displayName: "Demo Skill",
      slug: "demo-skill",
      description: "A shared demo skill.",
      health: "valid",
      validation: { errors: 0, warnings: 0 },
      storage: {
        provider: "s3",
        bucket: "test-bucket",
        key: "private/demo.zip",
        size: 128,
        contentType: "application/zip",
        uploadedAt: new Date().toISOString()
      }
    }]
  };
}
