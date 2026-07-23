import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

import { parseArgs } from "../src/cli/args.js";
import { runAssetsList, runAssetsShow } from "../src/cli/commands/assets.js";
import { runDownload } from "../src/cli/commands/download.js";
import { runEdit, runList, runShow } from "../src/cli/commands/skills.js";

const asset = {
  id: "asset:skill:demo-skill",
  kind: "skill",
  name: "demo-skill",
  slug: "demo-skill",
  displayName: "Demo Skill",
  description: "Remote demo",
  health: "valid",
  version: 2,
  standard: { name: "demo-skill", description: "Remote demo" },
  validation: { status: "valid", issues: [] }
};

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

function remoteArgs(baseUrl: string, extra: string[] = []) {
  return parseArgs([
    ...extra,
    "--remote",
    "--url",
    baseUrl,
    "--workspace",
    "ws_demo",
    "--token",
    "secret"
  ]);
}

async function captureLog(callback: () => Promise<number>): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => { lines.push(values.join(" ")); };
  try {
    return { code: await callback(), output: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

test("lists and shows remote assets without reading local catalogs", async () => {
  await withServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/workspaces/ws_demo/assets?kind=skill") {
      response.end(JSON.stringify({ assets: [asset], skills: [asset], issues: [] }));
      return;
    }
    if (request.url === "/api/workspaces/ws_demo/assets/demo-skill") {
      response.end(JSON.stringify(asset));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  }, async (baseUrl) => {
    const listed = await captureLog(() => Promise.resolve(runAssetsList(
      remoteArgs(baseUrl, ["--kind", "skill", "--json"])
    )));
    assert.equal(listed.code, 0);
    assert.equal(JSON.parse(listed.output)[0].name, "demo-skill");

    const shown = await captureLog(() => Promise.resolve(runAssetsShow(
      remoteArgs(baseUrl, ["demo-skill", "--json"])
    )));
    assert.equal(shown.code, 0);
    assert.equal(JSON.parse(shown.output).version, 2);
  });
});

test("lists and shows remote Skills through the canonical assets API", async () => {
  const requests: string[] = [];
  await withServer((request, response) => {
    requests.push(request.url!);
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/workspaces/ws_demo/assets?kind=skill") {
      response.end(JSON.stringify({ assets: [asset], skills: [], issues: [] }));
      return;
    }
    if (request.url === "/api/workspaces/ws_demo/assets/demo-skill") {
      response.end(JSON.stringify(asset));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  }, async (baseUrl) => {
    const listed = await captureLog(() => runList(remoteArgs(baseUrl, ["--json"])));
    assert.equal(listed.code, 0);
    assert.equal(JSON.parse(listed.output)[0].name, "demo-skill");

    const shown = await captureLog(() => runShow(remoteArgs(baseUrl, ["demo-skill", "--json"])));
    assert.equal(shown.code, 0);
    assert.equal(JSON.parse(shown.output).version, 2);
  });
  assert.deepEqual(requests, [
    "/api/workspaces/ws_demo/assets?kind=skill",
    "/api/workspaces/ws_demo/assets/demo-skill"
  ]);
});

test("supports raw-array remote Skill list responses", async () => {
  await withServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify([asset]));
  }, async (baseUrl) => {
    const result = await captureLog(() => runList(remoteArgs(baseUrl)));
    assert.equal(result.code, 0);
    assert.match(result.output, /Demo Skill/);
  });
});

test("downloads the current remote asset version with the standalone command", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "harhub-download-"));
  try {
    await withServer((request, response) => {
      if (request.url === "/api/workspaces/ws_demo/assets/demo-skill") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(asset));
        return;
      }
      assert.equal(request.url, "/api/workspaces/ws_demo/assets/demo-skill/versions/2/download");
      response.setHeader("Content-Disposition", "attachment; filename=\"demo-skill-v2.zip\"");
      response.end("archive");
    }, async (baseUrl) => {
      const output = path.join(directory, "saved.zip");
      const result = await captureLog(() => runDownload(remoteArgs(baseUrl, ["demo-skill", "-o", output])));
      assert.equal(result.code, 0);
      assert.equal(readFileSync(output, "utf8"), "archive");
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("edits a remote Skill file and uploads it as a new version", async () => {
  const original = await new JSZip()
    .file("SKILL.md", "---\nname: demo-skill\ndescription: Old description\n---\n\nOld body\n")
    .generateAsync({ type: "nodebuffer" });
  let uploadedSkill = "";

  await withServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/workspaces/ws_demo/assets/demo-skill") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(asset));
      return;
    }
    if (request.method === "GET" && request.url === "/api/workspaces/ws_demo/assets/demo-skill/versions/2/download") {
      response.setHeader("Content-Disposition", "attachment; filename=\"demo-skill-v2.zip\"");
      response.end(original);
      return;
    }
    if (request.method === "POST" && request.url === "/api/workspaces/ws_demo/assets/upload") {
      const archive = await multipartFile(request);
      const zip = await JSZip.loadAsync(archive);
      uploadedSkill = await zip.file("SKILL.md")!.async("string");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ uploaded: [{ ...asset, version: 3 }] }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  }, async (baseUrl) => {
    const next = "---\nname: demo-skill\ndescription: New description\n---\n\nNew body\n";
    const result = await captureLog(() => runEdit(remoteArgs(baseUrl, [
      "demo-skill",
      "--content",
      next,
      "--json"
    ])));
    assert.equal(result.code, 0);
    assert.match(uploadedSkill, /New body/);
    assert.equal(JSON.parse(result.output).asset.version, 3);
  });
});

test("refuses to turn a remote Skill edit into a different asset", async () => {
  const original = await new JSZip()
    .file("SKILL.md", "---\nname: demo-skill\ndescription: Old description\n---\n")
    .generateAsync({ type: "nodebuffer" });
  let uploaded = false;

  await withServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/workspaces/ws_demo/assets/demo-skill") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(asset));
      return;
    }
    if (request.method === "GET" && request.url === "/api/workspaces/ws_demo/assets/demo-skill/versions/2/download") {
      response.end(original);
      return;
    }
    if (request.method === "POST") uploaded = true;
    response.statusCode = 500;
    response.end();
  }, async (baseUrl) => {
    const result = await captureLog(() => runEdit(remoteArgs(baseUrl, [
      "demo-skill",
      "--content",
      "---\nname: another-skill\ndescription: Changed name\n---\n"
    ])));
    assert.equal(result.code, 1);
  });
  assert.equal(uploaded, false);
});

async function multipartFile(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"));
  assert.ok(headerEnd >= 0);
  const boundary = /boundary=([^;]+)/i.exec(request.headers["content-type"] ?? "")?.[1];
  assert.ok(boundary);
  const footer = body.lastIndexOf(Buffer.from(`\r\n--${boundary}`));
  assert.ok(footer > headerEnd);
  return body.subarray(headerEnd + 4, footer);
}
