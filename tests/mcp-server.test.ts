import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { closeHarhubHttp } from "../src/cli/http.js";
import { createHarhubMcpServer } from "../src/mcp/server.js";
import { AllowedPaths } from "../src/mcp/paths.js";

test("advertises the full CLI-equivalent Harhub tool surface with safety hints", async () => {
  await withMcpClient("http://127.0.0.1:1", async (client) => {
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 39);
    assert.ok(listed.tools.some((tool) => tool.name === "harhub_assets_list"));
    assert.ok(listed.tools.some((tool) => tool.name === "harhub_project_create_proposal"));
    assert.ok(listed.tools.some((tool) => tool.name === "harhub_forge_generate"));

    const deleteTool = listed.tools.find((tool) => tool.name === "harhub_asset_delete");
    assert.equal(deleteTool?.annotations?.destructiveHint, true);
    assert.deepEqual(deleteTool?.inputSchema.required?.sort(), ["asset", "confirm"]);

    const listTool = listed.tools.find((tool) => tool.name === "harhub_projects_list");
    assert.equal(listTool?.annotations?.readOnlyHint, true);
  });
});

test("executes authenticated workspace reads over the MCP protocol", async () => {
  await withHttpServer((request, response) => {
    assert.equal(request.url, "/api/workspaces/ws_demo/assets?kind=skill");
    assert.equal(request.headers.authorization, "Bearer secret");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ assets: [{ id: "asset_1", kind: "skill" }] }));
  }, async (baseUrl) => {
    await withMcpClient(baseUrl, async (client) => {
      const result = await client.callTool({
        name: "harhub_assets_list",
        arguments: { kind: "skill" }
      });
      assert.equal("isError" in result ? result.isError : undefined, undefined);
      assert.deepEqual(
        "structuredContent" in result ? result.structuredContent : undefined,
        { assets: [{ id: "asset_1", kind: "skill" }] }
      );
    });
  });
});

test("rejects destructive calls without explicit confirmation before HTTP", async () => {
  let requests = 0;
  await withHttpServer((_request, response) => {
    requests += 1;
    response.statusCode = 500;
    response.end();
  }, async (baseUrl) => {
    await withMcpClient(baseUrl, async (client) => {
      const result = await client.callTool({
        name: "harhub_asset_delete",
        arguments: { asset: "asset_1", confirm: false }
      });
      assert.equal("isError" in result ? result.isError : undefined, true);
      assert.equal(requests, 0);
    });
  });
});

test("collects Forge NDJSON streaming events into one reentrant MCP result", async () => {
  await withHttpServer(async (request, response) => {
    assert.equal(request.url, "/api/workspaces/ws_demo/forge/sessions/session_1/generate");
    assert.equal(request.method, "POST");
    assert.deepEqual(await readJson(request), {
      answers: [{ question: "Audience?", answer: "Developers" }]
    });
    response.setHeader("Content-Type", "application/x-ndjson");
    response.write(`${JSON.stringify({ type: "delta", delta: "Creating " })}\n`);
    response.write(`${JSON.stringify({ type: "delta", delta: "framework" })}\n`);
    response.end(`${JSON.stringify({ type: "complete", session: { id: "session_1" } })}\n`);
  }, async (baseUrl) => {
    await withMcpClient(baseUrl, async (client) => {
      const result = await client.callTool({
        name: "harhub_forge_generate",
        arguments: {
          sessionId: "session_1",
          answers: [{ question: "Audience?", answer: "Developers" }]
        }
      });
      assert.equal("isError" in result ? result.isError : undefined, undefined);
      assert.equal(
        "structuredContent" in result ? result.structuredContent?.text : undefined,
        "Creating framework"
      );
    });
  });
});

test("keeps MCP file access inside configured roots", () => {
  const root = mkdtempSync(path.join(tmpdir(), "harhub-mcp-root-"));
  const outside = mkdtempSync(path.join(tmpdir(), "harhub-mcp-outside-"));
  try {
    const paths = new AllowedPaths([root]);
    assert.equal(paths.writable(path.join(root, "result.zip")), path.join(root, "result.zip"));
    assert.throws(
      () => paths.writable(path.join(outside, "result.zip")),
      /outside HARHUB_MCP_ALLOWED_ROOTS/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

async function withMcpClient(
  baseUrl: string,
  callback: (client: Client) => Promise<void>
): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), "harhub-mcp-test-"));
  const server = createHarhubMcpServer({
    apiUrl: baseUrl,
    workspaceId: "ws_demo",
    token: "secret",
    allowedRoots: [root]
  });
  const client = new Client({ name: "harhub-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await callback(client);
  } finally {
    await client.close();
    await server.close();
    await closeHarhubHttp();
    rmSync(root, { recursive: true, force: true });
  }
}

async function withHttpServer(
  handler: Parameters<typeof createServer>[0],
  callback: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  let body = "";
  request.setEncoding("utf8");
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : undefined;
}
