import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { parseArgs } from "../src/cli/args.js";
import { runProjectCommand } from "../src/cli/commands/projects.js";
import { runRepositoryCommand } from "../src/cli/commands/repositories.js";
import { runForgeCommand } from "../src/cli/commands/forge.js";

async function withServer(
  handler: Parameters<typeof createServer>[0],
  callback: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function args(baseUrl: string, values: string[]) {
  return parseArgs([
    ...values,
    "--url",
    baseUrl,
    "--workspace",
    "ws_demo",
    "--token",
    "secret",
    "--json"
  ]);
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  let body = "";
  request.setEncoding("utf8");
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : undefined;
}

async function captureLog(callback: () => Promise<number>): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => { lines.push(values.join(" ")); };
  try {
    return { code: await callback(), lines };
  } finally {
    console.log = original;
  }
}

test("creates and connects projects through the CLI command group", async () => {
  const seen: Array<{ url: string; method: string; body: unknown }> = [];
  await withServer(async (request, response) => {
    seen.push({ url: request.url!, method: request.method!, body: await readJson(request) });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ project: { id: "project_1", name: "Demo" }, syncToken: "sync" }));
  }, async (baseUrl) => {
    assert.equal((await captureLog(() => runProjectCommand("create", args(baseUrl, [
      "Demo",
      "-d",
      "Project description",
      "--repository",
      "owner/repo",
      "-b",
      "develop"
    ])))).code, 0);
    assert.equal((await captureLog(() => runProjectCommand("connect", args(baseUrl, [
      "project_1",
      "owner/next",
      "-bmain"
    ])))).code, 0);
  });

  assert.deepEqual(seen, [
    {
      url: "/api/workspaces/ws_demo/projects",
      method: "POST",
      body: {
        name: "Demo",
        description: "Project description",
        repository: "owner/repo",
        defaultBranch: "develop"
      }
    },
    {
      url: "/api/workspaces/ws_demo/projects/project_1/repository",
      method: "PUT",
      body: { repository: "owner/next", defaultBranch: "main" }
    }
  ]);
});

test("updates repository ownership policy and creates add-skill proposals", async () => {
  const seen: Array<{ url: string; method: string; body: unknown }> = [];
  await withServer(async (request, response) => {
    seen.push({ url: request.url!, method: request.method!, body: await readJson(request) });
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ id: "result_1" }));
  }, async (baseUrl) => {
    assert.equal((await captureLog(() => runRepositoryCommand("policy", args(baseUrl, [
      "project_1",
      "skills/demo/SKILL.md",
      "--ownership",
      "library",
      "--library-asset",
      "asset_1",
      "--pinned-version",
      "2"
    ])))).code, 0);
    assert.equal((await captureLog(() => runRepositoryCommand("propose", args(baseUrl, [
      "project_1",
      "add-library-skills",
      "--asset",
      "asset_1",
      "--asset=asset_2"
    ])))).code, 0);
  });

  assert.deepEqual(seen[0], {
    url: "/api/workspaces/ws_demo/projects/project_1/inventory/policies",
    method: "PUT",
    body: {
      artifactPath: "skills/demo/SKILL.md",
      ownership: "library",
      libraryAssetId: "asset_1",
      pinnedVersion: 2
    }
  });
  assert.deepEqual(seen[1], {
    url: "/api/workspaces/ws_demo/projects/project_1/proposals",
    method: "POST",
    body: { kind: "add-library-skills", assetIds: ["asset_1", "asset_2"] }
  });
});

test("streams Forge operations as NDJSON-compatible JSON output", async () => {
  await withServer(async (request, response) => {
    assert.equal(request.url, "/api/workspaces/ws_demo/forge/sessions/session_1/generate");
    assert.equal(request.method, "POST");
    assert.deepEqual(await readJson(request), {
      answers: [{ question: "Target?", answer: "CLI" }]
    });
    response.setHeader("Content-Type", "application/x-ndjson");
    response.write(JSON.stringify({ type: "operation", operationId: "op_1", operation: "generate" }) + "\n");
    response.end(JSON.stringify({
      type: "complete",
      operationId: "op_1",
      operation: "generate",
      template: { files: [] },
      session: { id: "session_1", status: "complete" }
    }) + "\n");
  }, async (baseUrl) => {
    const result = await captureLog(() => runForgeCommand("generate", args(baseUrl, [
      "session_1",
      "--answer",
      "Target?=CLI"
    ])));
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.lines[0]).type, "operation");
    assert.equal(JSON.parse(result.lines[1]).type, "complete");
  });
});
