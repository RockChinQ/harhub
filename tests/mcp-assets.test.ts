import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import {
  analyzeMcpConfiguration,
  createImportedMcpAsset
} from "../src/features/mcp/index.js";
import { packageMcpConfiguration } from "../src/server/services/skill-packages.js";
import { MCP_CONFIG_CHECKSUM_ALGORITHM } from "../src/shared/types.js";

test("validates MCP configurations and exposes only safe discovery metadata", () => {
  const content = Buffer.from(JSON.stringify({
    mcpServers: {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "${GITHUB_TOKEN}"
        }
      },
      docs: {
        url: "https://mcp.example.test",
        type: "streamable-http",
        headers: {
          Authorization: "Bearer secret-never-indexed"
        }
      }
    }
  }));
  const analyzed = analyzeMcpConfiguration(content);

  assert.deepEqual(analyzed.validation, { errors: 0, warnings: 0 });
  assert.deepEqual(analyzed.metadata, {
    serverCount: 2,
    serverNames: ["docs", "github"],
    transports: ["stdio", "streamable-http"]
  });
  assert.equal(JSON.stringify(analyzed.metadata).includes("secret-never-indexed"), false);
});

test("warns about literal secret environment values and rejects unusable configs", () => {
  const literalSecret = analyzeMcpConfiguration(Buffer.from(JSON.stringify({
    mcpServers: {
      github: {
        command: "node",
        env: { API_KEY: "literal-secret" }
      }
    }
  })));
  assert.deepEqual(literalSecret.validation, { errors: 0, warnings: 1 });
  assert.equal(literalSecret.validationIssues[0]?.code, "mcp.literal_secret");

  const empty = analyzeMcpConfiguration(Buffer.from('{"mcpServers":{}}'));
  assert.equal(empty.validation.errors, 1);
  assert.equal(empty.validationIssues[0]?.code, "mcp.no_servers");
});

test("creates a versioned MCP Library asset", () => {
  const analyzed = analyzeMcpConfiguration(Buffer.from(JSON.stringify({
    mcpServers: {
      filesystem: { command: "npx", args: ["server-filesystem", "."] }
    }
  })));
  const asset = createImportedMcpAsset({
    workspaceId: "ws_demo",
    name: "filesystem",
    displayName: "Filesystem",
    description: "Provides bounded repository file access.",
    analyzed,
    storage: {
      provider: "s3",
      layout: "files",
      bucket: "assets",
      key: "workspaces/ws_demo/mcps/filesystem/1/",
      size: analyzed.content.byteLength,
      fileCount: 1,
      contentType: "application/vnd.harhub.mcp-config",
      checksum: analyzed.checksum,
      checksumAlgorithm: MCP_CONFIG_CHECKSUM_ALGORITHM,
      uploadedAt: "2026-07-29T00:00:00.000Z"
    }
  });

  assert.equal(asset.id, "asset:mcp:ws_demo:filesystem");
  assert.equal(asset.kind, "mcp");
  assert.equal(asset.version, 1);
  assert.equal(asset.mcp?.serverNames[0], "filesystem");
});

test("downloads an MCP version as a deterministic JSON archive", async () => {
  const analyzed = analyzeMcpConfiguration(Buffer.from(JSON.stringify({
    mcpServers: {
      filesystem: { command: "npx", args: ["server-filesystem", "."] }
    }
  })));
  const first = await packageMcpConfiguration(analyzed.content);
  const second = await packageMcpConfiguration(analyzed.content);
  const archive = await JSZip.loadAsync(first.buffer);

  assert.equal(first.checksum, second.checksum);
  assert.deepEqual(first.buffer, second.buffer);
  assert.equal(
    await archive.file("mcp.json")?.async("string"),
    analyzed.content.toString("utf8")
  );
});
