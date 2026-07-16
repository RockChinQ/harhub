import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

import { runInstall, resolveShareReference } from "../src/cli/commands/share.js";
import { closeHarhubHttp } from "../src/cli/http.js";
import { installSkillDirectory } from "../src/cli/skills-installer.js";
import { contentHash } from "../src/shared/markdown.js";
import { buildAgentSkillsDiscoveryIndex } from "../src/server/services/asset-shares.js";
import { buildAssetContentPreview } from "../src/server/utils/zip-preview.js";
import type { AssetCatalog, AssetShareResponse } from "../src/shared/types.js";

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
    assert.equal(share.skillsCliCommand, `npx skills add ${share.shareUrl}`);
    assert.equal(share.asset.fileCount, 1);
    assert.equal(share.asset.size, 128);
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

test("builds a public file preview without asset or storage metadata", () => {
  const preview = buildAssetContentPreview([
    {
      path: "SKILL.md",
      content: Buffer.from("---\nname: shared-skill\ndescription: Shared test Skill.\n---\n")
    },
    {
      path: "references/guide.md",
      content: Buffer.from("# Guide\n")
    }
  ], "references/guide.md");

  assert.equal(preview.files.length, 2);
  assert.equal(preview.selectedFile?.path, "references/guide.md");
  assert.equal(preview.selectedFile?.content, "# Guide\n");
  assert.equal("asset" in preview, false);
  assert.equal("storage" in preview, false);
});

test("installs a shared Skill through the bundled skills CLI", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-share-install-"));
  const originalDirectory = process.cwd();
  const zip = await sharedSkillZip();
  const server = createServer((request, response) => {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    if (request.url === "/api/public/shares/test-token") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(testShareResponse(baseUrl)));
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
    assert.equal(await runInstall({
      positionals: [shareUrl],
      options: { agent: "codex", copy: true, yes: true }
    }), 0);
    const installed = readFileSync(
      path.join(temporaryDirectory, ".agents", "skills", "shared-skill", "SKILL.md"),
      "utf8"
    );
    assert.match(installed, /name: shared-skill/);
  } finally {
    process.chdir(originalDirectory);
    await closeHarhubHttp();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("builds an Agent Skills discovery index for a public share", () => {
  const share = testShareResponse("https://harhub.example");
  const asset = testCatalog().assets[0];
  const index = buildAgentSkillsDiscoveryIndex(share, asset, "a".repeat(64));
  assert.deepEqual(index, {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [{
      name: "demo-skill",
      type: "archive",
      description: "A shared demo skill.",
      url: "https://harhub.example/download",
      digest: `sha256:${"a".repeat(64)}`
    }]
  });
});

test("installs directly from a Harhub share URL through Agent Skills discovery", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-well-known-install-"));
  const zip = await sharedSkillZip();
  const server = createServer((request, response) => {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    if (request.url === "/s/test-token/.well-known/agent-skills/index.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        skills: [{
          name: "shared-skill",
          type: "archive",
          description: "Shared test Skill.",
          url: `${baseUrl}/api/public/shares/test-token/download`,
          digest: `sha256:${contentHash(zip)}`
        }]
      }));
      return;
    }
    if (request.url === "/api/public/shares/test-token/download") {
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
    const result = await installSkillDirectory(shareUrl, {
      agents: ["codex"],
      copy: true,
      yes: true,
      json: true,
      cwd: temporaryDirectory
    });
    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.match(
      readFileSync(path.join(temporaryDirectory, ".agents", "skills", "shared-skill", "SKILL.md"), "utf8"),
      /name: shared-skill/
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

async function sharedSkillZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("SKILL.md", "---\nname: shared-skill\ndescription: Shared test Skill.\n---\n\n# Shared Skill\n");
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function testShareResponse(baseUrl: string): AssetShareResponse {
  return {
    token: "test-token",
    createdAt: new Date().toISOString(),
    shareUrl: `${baseUrl}/s/test-token`,
    downloadUrl: `${baseUrl}/download`,
    cliCommand: `harhub install ${baseUrl}/s/test-token`,
    skillsCliCommand: `npx skills add ${baseUrl}/s/test-token`,
    fileName: "shared-skill.zip",
    asset: {
      id: "asset:skill:test",
      kind: "skill",
      name: "shared-skill",
      displayName: "Shared Skill",
      slug: "shared-skill",
      description: "Shared",
      health: "valid",
      validation: { errors: 0, warnings: 0 },
      fileCount: 1,
      size: 128
    }
  };
}

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
        layout: "files",
        bucket: "test-bucket",
        key: "private/demo/",
        size: 128,
        fileCount: 1,
        contentType: "application/vnd.harhub.skill-directory",
        checksum: "a".repeat(64),
        uploadedAt: new Date().toISOString()
      }
    }]
  };
}
