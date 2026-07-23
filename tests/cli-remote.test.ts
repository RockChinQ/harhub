import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { parseArgs } from "../src/cli/args.js";
import {
  downloadWorkspaceFile,
  requestWorkspaceJson,
  safeDownloadFileName
} from "../src/cli/remote.js";

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

test("sends authenticated workspace JSON requests", async () => {
  await withServer((request, response) => {
    assert.equal(request.url, "/api/workspaces/ws%20demo/projects");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.authorization, "Bearer secret");
    assert.equal(request.headers["content-type"], "application/json");
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      assert.deepEqual(JSON.parse(body), { name: "Demo" });
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ project: { id: "project_1" } }));
    });
  }, async (baseUrl) => {
    const result = await requestWorkspaceJson<{ project: { id: string } }>(
      parseArgs(["--url", baseUrl, "--workspace", "ws demo", "--token", "secret"]),
      "/projects",
      { method: "POST", body: { name: "Demo" } }
    );
    assert.equal(result.project.id, "project_1");
  });
});

test("surfaces API error messages", async () => {
  await withServer((_request, response) => {
    response.statusCode = 409;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "AI is not configured." }));
  }, async (baseUrl) => {
    await assert.rejects(
      requestWorkspaceJson(
        parseArgs(["--url", baseUrl, "--workspace", "ws", "--token", "secret"]),
        "/forge/sessions"
      ),
      /AI is not configured\./
    );
  });
});

test("downloads authenticated workspace files and sanitizes server filenames", async () => {
  await withServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer secret");
    response.setHeader("Content-Disposition", "attachment; filename=\"../demo.zip\"");
    response.end("zip bytes");
  }, async (baseUrl) => {
    const result = await downloadWorkspaceFile(
      parseArgs(["--url", baseUrl, "--workspace", "ws", "--token", "secret"]),
      "/assets/demo/versions/2/download",
      "fallback.zip"
    );
    assert.equal(result.fileName, "demo.zip");
    assert.equal(result.buffer.toString(), "zip bytes");
  });

  assert.equal(safeDownloadFileName("../../escape.zip", "fallback.zip"), "escape.zip");
  assert.equal(safeDownloadFileName("", "fallback.zip"), "fallback.zip");
});
