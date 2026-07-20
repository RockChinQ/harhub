import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import JSZip from "jszip";

import type { StoredObject } from "../src/shared/types.js";

const hasObjectStorage = Boolean(process.env.HARHUB_S3_BUCKET);

test("stores repository Skills as Project forks until explicitly published", {
  skip: hasObjectStorage ? false : "requires HARHUB_S3_BUCKET"
}, async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-project-forks-"));
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  const cleanupStorage: StoredObject[] = [];
  let server: Server | undefined;

  try {
    const { createImportedSkillAsset } = await import("../src/features/assets/index.js");
    const {
      analyzeStoredSkillFiles,
      skillFilesChecksum
    } = await import("../src/features/skills/index.js");
    const {
      createProject,
      createSession,
      getProject,
      loadState,
      writeWorkspaceAssetCatalog
    } = await import("../src/state/index.js");
    const {
      deleteStoredObject,
      uploadSkillFiles
    } = await import("../src/storage/index.js");
    const { loadStoredSkill } = await import("../src/server/services/skill-packages.js");

    const baseFiles = [{
      path: "SKILL.md",
      content: Buffer.from(
        "---\nname: release-notes\ndescription: Prepare concise release notes.\n---\n\n# Release Notes\n"
      )
    }];
    const baseSkill = analyzeStoredSkillFiles(baseFiles);
    const baseStorage = await uploadSkillFiles({
      workspaceId: "ws_demo",
      skillName: baseSkill.name,
      files: baseFiles,
      checksum: baseSkill.checksum
    });
    cleanupStorage.push(baseStorage);
    const baseAsset = createImportedSkillAsset({
      workspaceId: "ws_demo",
      skill: baseSkill,
      storage: baseStorage
    });
    await writeWorkspaceAssetCatalog("ws_demo", {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      workspaceId: "ws_demo",
      assets: [baseAsset],
      skills: []
    });

    const created = await createProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      name: "Release repository",
      description: "Tracks repository Skill forks.",
      repository: {
        provider: "github",
        owner: "RockChinQ",
        name: "release-control",
        url: "https://github.com/RockChinQ/release-control",
        defaultBranch: "main"
      }
    });
    assert.ok(created.syncToken);

    const forkFiles = [
      {
        path: "SKILL.md",
        content: Buffer.from(
          "---\nname: release-notes\ndescription: Prepare verified release notes.\n---\n\n# Release Notes\n\nVerify every change.\n"
        )
      },
      {
        path: "references/checklist.md",
        content: Buffer.from("# Checklist\n\n- Verify the changelog.\n")
      }
    ];
    const digest = skillFilesChecksum(forkFiles);
    const newSkillFiles = [{
      path: "SKILL.md",
      content: Buffer.from(
        "---\nname: roadmap-review\ndescription: Review roadmap decisions.\n---\n\n# Roadmap Review\n"
      )
    }];
    const newSkillDigest = skillFilesChecksum(newSkillFiles);
    const zip = new JSZip();
    for (const file of forkFiles) {
      zip.file(`.harness/skills/release-notes/${file.path}`, file.content);
    }
    for (const file of newSkillFiles) {
      zip.file(`.harness/skills/roadmap-review/${file.path}`, file.content);
    }
    const archive = await zip.generateAsync({ type: "nodebuffer" });
    const request = {
      schemaVersion: 1,
      repository: "RockChinQ/release-control",
      commitSha: "a".repeat(40),
      ref: "main",
      bindings: [{
        kind: "skill",
        name: "release-notes",
        path: ".harness/skills/release-notes",
        digest
      }, {
        kind: "skill",
        name: "roadmap-review",
        path: ".harness/skills/roadmap-review",
        digest: newSkillDigest
      }]
    } as const;
    const { createServerApp } = await import("../src/server/app.js");
    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const accountToken = await createSession("acct_demo");
    const syncBody = new FormData();
    syncBody.set("manifest", JSON.stringify(request));
    syncBody.set("skills", new Blob([new Uint8Array(archive)], { type: "application/zip" }), "skills.zip");
    const syncResponse = await fetch(`${baseUrl}/api/projects/${created.project.id}/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${created.syncToken}` },
      body: syncBody
    });
    assert.equal(syncResponse.status, 200);
    const synced = await syncResponse.json() as {
      counts: { added: number; modified: number };
    };
    assert.equal(synced.counts.modified, 1);
    assert.equal(synced.counts.added, 1);

    const firstForkKeys = (await loadState()).projects
      .find((item) => item.id === created.project.id)
      ?.skillForks?.map((fork) => fork.storage.key);
    const repeatedBody = new FormData();
    repeatedBody.set("manifest", JSON.stringify({ ...request, commitSha: "b".repeat(40) }));
    repeatedBody.set(
      "skills",
      new Blob([new Uint8Array(archive)], { type: "application/zip" }),
      "skills.zip"
    );
    const repeatedResponse = await fetch(`${baseUrl}/api/projects/${created.project.id}/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${created.syncToken}` },
      body: repeatedBody
    });
    assert.equal(repeatedResponse.status, 200);
    const repeatedForkKeys = (await loadState()).projects
      .find((item) => item.id === created.project.id)
      ?.skillForks?.map((fork) => fork.storage.key);
    assert.deepEqual(repeatedForkKeys, firstForkKeys);

    const project = await getProject("acct_demo", "ws_demo", created.project.id);
    const binding = project.bindings.find((item) => item.path.endsWith("/release-notes"));
    assert.ok(binding);
    assert.equal(binding.status, "modified");
    assert.equal(binding.assetId, baseAsset.id);
    assert.equal(binding.fork?.fileCount, 2);
    const addedBinding = project.bindings.find((item) => item.path.endsWith("/roadmap-review"));
    assert.ok(addedBinding);
    assert.equal(addedBinding.status, "added");
    assert.equal(addedBinding.assetId, undefined);
    assert.equal(addedBinding.fork?.fileCount, 1);

    const diffResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/projects/${project.id}/bindings/${binding.id}/diff?path=SKILL.md`,
      { headers: { Authorization: `Bearer ${accountToken}` } }
    );
    assert.equal(diffResponse.status, 200);
    const diff = await diffResponse.json() as {
      files: Array<{ path: string; status: string }>;
      selectedFile?: { baseContent?: string; forkContent?: string };
    };
    assert.deepEqual(diff.files, [
      { path: "SKILL.md", status: "modified" },
      { path: "references/checklist.md", status: "added" }
    ]);
    assert.match(diff.selectedFile?.baseContent ?? "", /concise release notes/);
    assert.match(diff.selectedFile?.forkContent ?? "", /verified release notes/);

    const publishResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/projects/${project.id}/bindings/${binding.id}/publish`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accountToken}` }
      }
    );
    assert.equal(publishResponse.status, 200);
    const published = await publishResponse.json() as {
      project: typeof project;
      asset: typeof baseAsset;
    };
    assert.equal(
      published.project.bindings.find((item) => item.id === binding.id)?.status,
      "synced"
    );
    assert.equal(
      published.project.bindings.find((item) => item.id === binding.id)?.fork,
      undefined
    );
    assert.equal(published.asset.storage?.checksum, digest);
    if (published.asset.storage) cleanupStorage.push(published.asset.storage);
    const stored = await loadStoredSkill(published.asset.storage!);
    assert.equal(stored.skill.checksum, digest);

    const addedPublishResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/projects/${project.id}/bindings/${addedBinding.id}/publish`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accountToken}` }
      }
    );
    assert.equal(addedPublishResponse.status, 200);
    const addedPublished = await addedPublishResponse.json() as {
      project: typeof project;
      asset: typeof baseAsset;
    };
    assert.equal(
      addedPublished.project.bindings.find((item) => item.id === addedBinding.id)?.status,
      "synced"
    );
    assert.equal(addedPublished.asset.storage?.checksum, newSkillDigest);
    if (addedPublished.asset.storage) cleanupStorage.push(addedPublished.asset.storage);

    const state = await loadState();
    assert.deepEqual(
      state.projects.find((item) => item.id === project.id)?.skillForks,
      []
    );

    await Promise.all(cleanupStorage.map((storage) => deleteStoredObject(storage)));
    cleanupStorage.length = 0;
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => error ? reject(error) : resolve())
      );
    }
    try {
      const { loadState } = await import("../src/state/index.js");
      const state = await loadState();
      cleanupStorage.push(...state.projects.flatMap((project) =>
        (project.skillForks ?? []).map((fork) => fork.storage)
      ));
    } catch {
      // The primary assertion failure remains more useful than cleanup diagnostics.
    }
    if (cleanupStorage.length) {
      const { deleteStoredObject } = await import("../src/storage/index.js");
      await Promise.all(cleanupStorage.map((storage) =>
        deleteStoredObject(storage).catch(() => undefined)
      ));
    }
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
