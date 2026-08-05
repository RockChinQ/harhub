import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { AssetRecord } from "../src/shared/types.js";

const hasObjectStorage = Boolean(process.env.HARHUB_S3_BUCKET);

for (const fixture of [
  {
    command: "npx skills add https://clawhub.ai/matrixy/skills/agent-browser-clawdbot",
    expected: "agent-browser",
    sourceType: "well-known" as const
  },
  {
    command: "npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices",
    expected: "vercel-react-best-practices",
    sourceType: "github" as const
  }
]) {
  test(`imports a live skills command through the authenticated API and object storage: ${fixture.expected}`, {
    skip: hasObjectStorage ? false : "requires HARHUB_S3_BUCKET"
  }, async () => {
    const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-command-import-api-"));
    const previousStatePath = process.env.HARHUB_STATE;
    const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;
    const previousGenericDatabaseUrl = process.env.DATABASE_URL;
    process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
    delete process.env.HARHUB_DATABASE_URL;
    delete process.env.DATABASE_URL;
    let server: Server | undefined;
    let storage: AssetRecord["storage"];
    const workspaceId = `ws_cmd_${fixture.expected.replace(/-/g, "_")}_${process.pid}_${Date.now()}`;

    try {
      const { createSession, loadState, saveState } = await import("../src/state/index.js");
      const state = await loadState();
      state.workspaces.push({
        id: workspaceId,
        name: fixture.expected,
        slug: workspaceId,
        createdAt: new Date().toISOString()
      });
      state.memberships.push({
        id: `membership_${workspaceId}`,
        workspaceId,
        accountId: "acct_demo",
        role: "owner",
        createdAt: new Date().toISOString()
      });
      await saveState(state);
      const { createServerApp } = await import("../src/server/app.js");
      const { deleteStoredObject, readStoredSkillFiles } = await import("../src/storage/index.js");
      const token = await createSession("acct_demo");
      server = createServerApp().listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server?.once("listening", resolve));
      const address = server.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/workspaces/${workspaceId}/assets/import/skills-command`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ command: fixture.command })
        }
      );
      if (response.status !== 201) {
        throw new Error(`Import failed with ${response.status}: ${await response.text()}`);
      }
      const payload = await response.json() as { uploaded: AssetRecord[] };
      const asset = payload.uploaded.find((candidate) => candidate.name === fixture.expected);
      assert.ok(asset);
      assert.equal(asset.provenance?.sourceType, fixture.sourceType);
      if (fixture.expected === "agent-browser") {
        assert.equal(asset.health, "error");
        assert.ok((asset.validationIssues ?? []).some((issue) => issue.code === "invalid-metadata"));
      }
      assert.equal(asset.provenance?.url, fixture.command.match(/add\s+(\S+)/)?.[1]);
      assert.ok(asset.provenance?.canonicalUrl.startsWith("https://"));
      assert.match(asset.provenance?.resolvedContentDigest ?? "", /^sha256:[a-f0-9]{64}$/);
      assert.equal(asset.provenance?.skillsResolved?.length, 1);
      assert.match(asset.provenance?.skillsResolved?.[0]?.computedHash ?? "", /^[a-f0-9]{64}$/);
      if (fixture.sourceType === "github") {
        assert.match(asset.provenance?.skillsResolved?.[0]?.ref ?? "", /^[a-f0-9]{40}$/);
        assert.match(asset.provenance?.canonicalUrl ?? "", /\/tree\/[a-f0-9]{40}$/);
      }
      assert.ok(asset.storage);
      storage = asset.storage;
      const files = await readStoredSkillFiles(asset.storage);
      assert.ok(files.some((file) => file.path === "SKILL.md"));
      await deleteStoredObject(asset.storage);
      storage = undefined;
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) =>
          server?.close((error) => (error ? reject(error) : resolve()))
        );
      }
      if (storage) {
        const { deleteStoredObject } = await import("../src/storage/index.js");
        await deleteStoredObject(storage).catch(() => undefined);
      }
      if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
      else process.env.HARHUB_STATE = previousStatePath;
      if (previousDatabaseUrl === undefined) delete process.env.HARHUB_DATABASE_URL;
      else process.env.HARHUB_DATABASE_URL = previousDatabaseUrl;
      if (previousGenericDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousGenericDatabaseUrl;
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
}
