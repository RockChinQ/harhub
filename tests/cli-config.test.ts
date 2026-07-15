import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

test("persists CLI login with private file permissions", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-cli-config-"));
  const configPath = path.join(temporaryDirectory, "nested", "config.json");
  process.env.HARHUB_CONFIG = configPath;
  const { clearCliConfig, readCliConfig, writeCliConfig } = await import(
    "../src/cli/config.js"
  );
  const { resolveHarhubApiUrl, resolveHarhubToken, resolveHarhubWorkspaceId } = await import(
    "../src/cli/api.js"
  );
  const { parseArgs } = await import("../src/cli/args.js");

  try {
    writeCliConfig({
      version: 1,
      apiUrl: "https://harhub.rcpd.cc",
      accessToken: "secret-token",
      workspaceId: "ws_test"
    });

    assert.deepEqual(readCliConfig(), {
      version: 1,
      apiUrl: "https://harhub.rcpd.cc",
      accessToken: "secret-token",
      workspaceId: "ws_test"
    });
    assert.equal(resolveHarhubToken(parseArgs([])), "secret-token");
    assert.equal(resolveHarhubWorkspaceId(parseArgs([])), "ws_test");
    assert.equal(resolveHarhubApiUrl(parseArgs([])), "https://harhub.rcpd.cc");
    process.env.HARHUB_URL = "https://ignored.example.com";
    assert.equal(resolveHarhubApiUrl(parseArgs([])), "https://harhub.rcpd.cc");
    delete process.env.HARHUB_URL;
    assert.equal(
      resolveHarhubToken(parseArgs(["--url", "https://other.example.com"])),
      undefined
    );
    assert.equal(
      resolveHarhubWorkspaceId(parseArgs(["--url", "https://other.example.com"])),
      undefined
    );
    if (process.platform !== "win32") {
      assert.equal(statSync(configPath).mode & 0o777, 0o600);
      assert.equal(statSync(path.dirname(configPath)).mode & 0o777, 0o700);
    }

    clearCliConfig();
    assert.equal(readCliConfig(), undefined);

    if (process.platform !== "win32") {
      const existingDirectoryMode = 0o755;
      chmodSync(temporaryDirectory, existingDirectoryMode);
      process.env.HARHUB_CONFIG = path.join(temporaryDirectory, "custom.json");
      writeCliConfig({
        version: 1,
        apiUrl: "https://harhub.example.com",
        accessToken: "another-token",
        workspaceId: "ws_test"
      });
      assert.equal(statSync(temporaryDirectory).mode & 0o777, existingDirectoryMode);
      assert.equal(statSync(process.env.HARHUB_CONFIG).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    delete process.env.HARHUB_CONFIG;
  }
});
