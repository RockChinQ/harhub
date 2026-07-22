import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

import type { AssetRecord, StoredObject } from "../src/shared/types.js";

const hasObjectStorage = Boolean(process.env.HARHUB_S3_BUCKET);

test("downloads, restores, and prunes retained Skill package versions", {
  skip: hasObjectStorage ? false : "requires HARHUB_S3_BUCKET"
}, async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-asset-versions-"));
  const originalDirectory = process.cwd();
  const previousStatePath = process.env.HARHUB_STATE;
  process.chdir(temporaryDirectory);
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  const skillName = `version-test-${Date.now()}`;
  const uploadedStorage: StoredObject[] = [];
  let server: Server | undefined;

  try {
    const { createSession } = await import("../src/state/index.js");
    const { createServerApp } = await import("../src/server/app.js");
    const { readStoredSkillFiles } = await import("../src/storage/index.js");
    const token = await createSession("acct_demo");
    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authorization = { Authorization: `Bearer ${token}` };

    let latest: AssetRecord | undefined;
    for (let version = 1; version <= 7; version += 1) {
      const form = new FormData();
      form.set(
        "file",
        new Blob([new Uint8Array(await skillArchive(skillName, version))], {
          type: "application/zip"
        }),
        `${skillName}-v${version}.zip`
      );
      const response = await fetch(`${baseUrl}/api/workspaces/ws_demo/assets/upload`, {
        method: "POST",
        headers: authorization,
        body: form
      });
      if (response.status !== 201) {
        throw new Error(`Upload failed with ${response.status}: ${await response.text()}`);
      }
      const payload = await response.json() as { uploaded: AssetRecord[] };
      latest = payload.uploaded[0];
      assert.ok(latest?.storage);
      uploadedStorage.push(latest.storage);
    }

    assert.equal(latest?.version, 7);
    assert.deepEqual(latest?.versionHistory?.map((entry) => entry.version), [3, 4, 5, 6, 7]);
    assert.ok(latest?.versionHistory?.every((entry) => Boolean(entry.storage)));

    const versionDownload = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/assets/${encodeURIComponent(latest!.id)}/versions/3/download`,
      { headers: authorization }
    );
    assert.equal(versionDownload.status, 200);
    const downloadedZip = await JSZip.loadAsync(await versionDownload.arrayBuffer());
    assert.match(await downloadedZip.file("SKILL.md")!.async("string"), /Version 3/);

    const prunedDownload = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/assets/${encodeURIComponent(latest!.id)}/versions/2/download`,
      { headers: authorization }
    );
    assert.equal(prunedDownload.status, 404);
    await assert.rejects(readStoredSkillFiles(uploadedStorage[1]!));

    const rollbackResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/assets/${encodeURIComponent(latest!.id)}/versions/3/rollback`,
      {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: "{}"
      }
    );
    if (rollbackResponse.status !== 200) {
      throw new Error(
        `Rollback failed with ${rollbackResponse.status}: ${await rollbackResponse.text()}`
      );
    }
    const rollback = await rollbackResponse.json() as {
      asset: AssetRecord;
      restoredFromVersion: number;
    };
    assert.equal(rollback.restoredFromVersion, 3);
    assert.equal(rollback.asset.version, 8);
    assert.deepEqual(rollback.asset.versionHistory?.map((entry) => entry.version), [4, 5, 6, 7, 8]);
    assert.equal(rollback.asset.versionHistory?.at(-1)?.source, "rollback");
    assert.equal(rollback.asset.storage?.key, uploadedStorage[2]?.key);
    assert.match(
      Buffer.concat((await readStoredSkillFiles(rollback.asset.storage!)).map((file) => file.content))
        .toString("utf8"),
      /Version 3/
    );

    const deleteResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/assets/${encodeURIComponent(rollback.asset.id)}`,
      { method: "DELETE", headers: authorization }
    );
    if (deleteResponse.status !== 200) {
      throw new Error(`Delete failed with ${deleteResponse.status}: ${await deleteResponse.text()}`);
    }
    for (const storage of uploadedStorage.slice(2)) {
      await assert.rejects(readStoredSkillFiles(storage));
    }
    uploadedStorage.length = 0;

  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => error ? reject(error) : resolve())
      );
    }
    if (uploadedStorage.length > 0) {
      const { deleteStoredObject } = await import("../src/storage/index.js");
      await Promise.all(uploadedStorage.map((storage) =>
        deleteStoredObject(storage).catch(() => undefined)
      ));
    }
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    process.chdir(originalDirectory);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

async function skillArchive(skillName: string, version: number): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("SKILL.md", [
    "---",
    `name: ${skillName}`,
    `description: Version ${version} of the retention test Skill.`,
    "---",
    "",
    `# Version ${version}`,
    ""
  ].join("\n"));
  return zip.generateAsync({ type: "nodebuffer" });
}
