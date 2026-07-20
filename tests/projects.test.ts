import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import JSZip from "jszip";
import { parse as parseYaml } from "yaml";

import {
  SKILL_FILES_CHECKSUM_ALGORITHM,
  type HarnessTemplateResponse,
  type ProjectSyncRequest
} from "../src/shared/types.js";

test("freezes Forge sessions before connecting repository-synchronized Projects", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-projects-"));
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  let server: Server | undefined;

  try {
    const {
      archiveProject,
      createForgeSession,
      createSession,
      deleteForgeSession,
      freezeForgeSessionAsProject,
      getForgeSession,
      getProject,
      listProjects,
      loadState,
      recordForgeSessionTemplate,
      syncProjectFromRepository,
      writeWorkspaceAssetCatalog
    } = await import("../src/state/index.js");
    const { buildHarnessTemplate } = await import("../src/server/services/forge.js");
    const {
      legacySkillFilesChecksum,
      skillFilesChecksum
    } = await import("../src/features/skills/archive.js");
    const { readProjectRepository } = await import("../src/server/routes/projects.js");

    assert.deepEqual(
      readProjectRepository("git@github.com:RockChinQ/release-control.git", "develop"),
      {
        provider: "github",
        owner: "RockChinQ",
        name: "release-control",
        url: "https://github.com/RockChinQ/release-control",
        defaultBranch: "develop"
      }
    );

    const skillContent = Buffer.from("---\nname: release-notes\ndescription: Prepare release notes.\n---\n");
    const repositorySkillFiles = [
      { path: "SKILL.md", content: skillContent },
      { path: "scripts/helper.js", content: Buffer.from("export const ready = true;\n") }
    ];
    const skillDigest = skillFilesChecksum(repositorySkillFiles);
    const legacySkillDigest = legacySkillFilesChecksum(repositorySkillFiles, "en");
    assert.notEqual(legacySkillDigest, skillDigest);
    const skill = {
      id: "asset:skill:release-notes",
      kind: "skill" as const,
      name: "release-notes",
      displayName: "Release Notes",
      slug: "release-notes",
      description: "Prepare release notes.",
      health: "valid" as const,
      fileCount: repositorySkillFiles.length,
      size: repositorySkillFiles.reduce((total, file) => total + file.content.byteLength, 0)
    };
    const template = buildHarnessTemplate({
      name: "Release Control",
      summary: "Track release readiness and reusable harness assets.",
      targetUsers: ["Release engineers"],
      goals: ["Keep release automation current"],
      constraints: ["Use repository automation"],
      successCriteria: ["Binding changes are visible in Harhub"],
      stackNotes: ["GitHub Actions"],
      agentRules: ["Verify harness changes"],
      selectedAssets: [{ assetId: skill.id, reason: "Supports release notes." }],
      workflow: {
        name: "Release",
        objective: "Prepare a release",
        steps: ["Review changes"],
        verification: ["Bindings synchronized"]
      }
    }, [skill]);
    assertFrameworkIntegration(template);

    const session = await createForgeSession(
      "acct_demo",
      "ws_demo",
      "Build a repository-linked release control project"
    );
    await recordForgeSessionTemplate(
      "acct_demo",
      "ws_demo",
      { requirement: session.requirement, answers: [], sessionId: session.id },
      template
    );
    const frozen = await freezeForgeSessionAsProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      sessionId: session.id,
      name: "Release Control",
      apiBaseUrl: "https://harhub.example",
      assetDigests: { [skill.id]: legacySkillDigest }
    });
    assert.equal(frozen.syncToken, undefined);
    assert.equal(frozen.project.repository, undefined);
    assert.equal(frozen.project.syncTokenConfigured, false);
    assert.equal(frozen.project.bindings.length, 2);
    assert.equal(frozen.project.bindings[0]?.kind, "rule");
    assert.equal("syncTokenHash" in frozen.project, false);

    const storedState = await loadState();
    const storedProject = storedState.projects.find((item) => item.id === frozen.project.id);
    assert.ok(storedProject);
    assert.equal(storedProject.syncTokenHash, undefined);

    const legacyAsset = {
      ...skill,
      validation: { errors: 0, warnings: 0 },
      storage: {
        provider: "s3" as const,
        layout: "files" as const,
        bucket: "legacy-bucket",
        key: "legacy/release-notes/",
        size: skill.size,
        fileCount: skill.fileCount,
        contentType: "application/vnd.harhub.skill-directory" as const,
        checksum: legacySkillDigest,
        uploadedAt: new Date().toISOString()
      }
    };
    await writeWorkspaceAssetCatalog("ws_demo", {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      workspaceId: "ws_demo",
      assets: [legacyAsset],
      skills: []
    });

    const restoredSession = await getForgeSession("acct_demo", "ws_demo", session.id);
    assert.equal(restoredSession.frozenProject?.id, frozen.project.id);
    const projectConfig = JSON.parse(fileContent(
      restoredSession.template,
      ".harhub/project.json"
    )) as { projectId: string; syncUrl: string; repository: string | null };
    assert.equal(projectConfig.projectId, frozen.project.id);
    assert.equal(projectConfig.syncUrl, `https://harhub.example/api/projects/${frozen.project.id}/sync`);
    assert.equal(projectConfig.repository, null);

    const repeatedFreeze = await freezeForgeSessionAsProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      sessionId: session.id,
      name: "Ignored duplicate",
      apiBaseUrl: "https://harhub.example",
      assetDigests: {}
    });
    assert.equal(repeatedFreeze.project.id, frozen.project.id);
    assert.equal(repeatedFreeze.syncToken, undefined);
    assert.equal((await listProjects("acct_demo", "ws_demo")).projects.length, 1);

    await deleteForgeSession("acct_demo", "ws_demo", session.id);
    await assert.rejects(
      getForgeSession("acct_demo", "ws_demo", session.id),
      /Forge session not found/
    );
    assert.equal(
      (await getProject("acct_demo", "ws_demo", frozen.project.id)).id,
      frozen.project.id
    );

    const checkout = path.join(temporaryDirectory, "checkout");
    writeFramework(checkout, restoredSession.template);
    const syncUrlRead = spawnSync(
      "bash",
      [
        "-eu",
        "-o",
        "pipefail",
        "-c",
        `HARHUB_SYNC_URL="$(node -p 'JSON.parse(require("fs").readFileSync(".harhub/project.json", "utf8")).syncUrl || ""')"\nprintf '%s' "$HARHUB_SYNC_URL"`
      ],
      { cwd: checkout, encoding: "utf8" }
    );
    assert.equal(syncUrlRead.status, 0, syncUrlRead.stderr);
    assert.equal(
      syncUrlRead.stdout,
      `https://harhub.example/api/projects/${frozen.project.id}/sync`
    );
    const skillRoot = path.join(checkout, ".harness", "skills", "release-notes");
    for (const file of repositorySkillFiles) {
      const targetPath = path.join(skillRoot, file.path);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, file.content);
    }

    const collector = spawnSync(
      process.execPath,
      [path.join(checkout, ".harhub/scripts/collect-bindings.mjs")],
      {
        cwd: checkout,
        encoding: "utf8",
        env: {
          ...process.env,
          HARHUB_REPOSITORY: "RockChinQ/release-control",
          HARHUB_COMMIT_SHA: "a".repeat(40),
          HARHUB_REF: "main",
          HARHUB_RUN_ID: "12345"
        }
      }
    );
    assert.equal(collector.status, 0, collector.stderr);
    const payload = JSON.parse(collector.stdout) as ProjectSyncRequest;
    const collectedSkill = payload.bindings.find((item) => item.kind === "skill");
    assert.equal(collectedSkill?.digest, skillDigest);
    assert.equal(collectedSkill?.digestAlgorithm, SKILL_FILES_CHECKSUM_ALGORITHM);
    assert.ok(payload.bindings.some((item) => item.kind === "rule"));
    const oldCollectorPayload: ProjectSyncRequest = {
      ...payload,
      bindings: payload.bindings.map((binding) => binding.kind === "skill"
        ? { ...binding, digest: legacySkillDigest, digestAlgorithm: undefined }
        : binding)
    };

    const { createServerApp } = await import("../src/server/app.js");
    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const accountToken = await createSession("acct_demo");

    const connectResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/projects/${frozen.project.id}/repository`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accountToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          repository: "RockChinQ/release-control",
          defaultBranch: "main"
        })
      }
    );
    assert.equal(connectResponse.status, 200);
    assertPrivateNoStore(connectResponse);
    const connected = await connectResponse.json() as {
      project: { repository?: { owner: string; name: string }; syncTokenConfigured: boolean };
      syncToken?: string;
    };
    assert.equal(connected.project.repository?.owner, "RockChinQ");
    assert.equal(connected.project.repository?.name, "release-control");
    assert.equal(connected.project.syncTokenConfigured, true);
    assert.ok(connected.syncToken?.startsWith("hhp_"));
    const syncToken = connected.syncToken;
    assert.ok(syncToken);
    const connectedState = await loadState();
    const connectedRecord = connectedState.projects.find(
      (item) => item.id === frozen.project.id
    );
    assert.ok(connectedRecord?.syncTokenHash);
    assert.notEqual(connectedRecord.syncTokenHash, syncToken);
    assert.equal(connectedRecord.syncTokenHash.length, 64);
    assert.equal("syncTokenHash" in connected.project, false);

    const listResponse = await fetch(`${baseUrl}/api/workspaces/ws_demo/projects`, {
      headers: { Authorization: `Bearer ${accountToken}` }
    });
    assert.equal(listResponse.status, 200);
    assertPrivateNoStore(listResponse);
    assert.equal(
      (await listResponse.json() as { projects: Array<{ id: string }> }).projects[0]?.id,
      frozen.project.id
    );

    const rejectedSync = await fetch(`${baseUrl}/api/projects/${frozen.project.id}/sync`, {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    assert.equal(rejectedSync.status, 401);
    assertPrivateNoStore(rejectedSync);

    const skillArchive = new JSZip();
    for (const file of repositorySkillFiles) {
      skillArchive.file(`.harness/skills/release-notes/${file.path}`, file.content);
    }
    const skillArchiveBuffer = await skillArchive.generateAsync({ type: "nodebuffer" });
    const syncBody = new FormData();
    syncBody.set("manifest", JSON.stringify(oldCollectorPayload));
    syncBody.set(
      "skills",
      new Blob([new Uint8Array(skillArchiveBuffer)], {
        type: "application/zip"
      }),
      "skills.zip"
    );
    const syncResponse = await fetch(`${baseUrl}/api/projects/${frozen.project.id}/sync`, {
      method: "POST",
      headers: {
        Authorization: "Bearer ".concat(syncToken)
      },
      body: syncBody
    });
    assert.equal(syncResponse.status, 200);
    assertPrivateNoStore(syncResponse);
    const firstSync = await syncResponse.json() as {
      revision: number;
      counts: { synced: number };
    };
    assert.equal(firstSync.revision, 1);
    assert.equal(firstSync.counts.synced, 2);
    assert.equal(
      (await getProject("acct_demo", "ws_demo", frozen.project.id)).bindings
        .find((item) => item.kind === "skill")?.sourceDigest,
      skillDigest
    );

    await writeWorkspaceAssetCatalog("ws_demo", {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      workspaceId: "ws_demo",
      assets: [{
        ...legacyAsset,
        storage: {
          ...legacyAsset.storage,
          checksum: skillDigest,
          checksumAlgorithm: "skill-files-v3" as never
        }
      }],
      skills: []
    });
    const unsupportedBody = new FormData();
    unsupportedBody.set("manifest", JSON.stringify({ ...payload, commitSha: "c".repeat(40) }));
    unsupportedBody.set(
      "skills",
      new Blob([new Uint8Array(skillArchiveBuffer)], { type: "application/zip" }),
      "skills.zip"
    );
    const unsupportedResponse = await fetch(
      `${baseUrl}/api/projects/${frozen.project.id}/sync`,
      {
        method: "POST",
        headers: { Authorization: "Bearer ".concat(syncToken) },
        body: unsupportedBody
      }
    );
    assert.equal(unsupportedResponse.status, 400);
    assert.match(await unsupportedResponse.text(), /unsupported checksum algorithm/);

    await assert.rejects(
      syncProjectFromRepository(frozen.project.id, "wrong-token", payload),
      /credentials are invalid/
    );

    const secondPayload: ProjectSyncRequest = {
      ...payload,
      commitSha: "b".repeat(40),
      bindings: [
        {
          ...(payload.bindings.find((item) => item.kind === "skill") ?? payload.bindings[0]),
          digest: "f".repeat(64)
        },
        {
          kind: "mcp",
          name: "Repository MCP",
          path: ".harness/mcp/repository.json",
          digest: "e".repeat(64)
        }
      ]
    };
    const secondSync = await syncProjectFromRepository(
      frozen.project.id,
      syncToken,
      secondPayload
    );
    assert.equal(secondSync.revision, 2);
    assert.equal(secondSync.counts.modified, 1);
    assert.equal(secondSync.counts.missing, 1);
    assert.equal(secondSync.counts.synced, 1);
    const synchronized = await getProject("acct_demo", "ws_demo", frozen.project.id);
    assert.equal(synchronized.bindings.find((item) => item.kind === "skill")?.status, "modified");
    assert.equal(synchronized.bindings.find((item) => item.kind === "rule")?.status, "missing");
    assert.equal(synchronized.bindings.find((item) => item.kind === "mcp")?.source, "repository");

    await archiveProject("acct_demo", "ws_demo", frozen.project.id);
    await assert.rejects(
      syncProjectFromRepository(frozen.project.id, syncToken, payload),
      /archived/
    );
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => error ? reject(error) : resolve())
      );
    }
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

function assertFrameworkIntegration(template: HarnessTemplateResponse): void {
  const workflow = fileContent(template, ".github/workflows/harhub-sync.yml");
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /HARHUB_PROJECT_TOKEN/);
  assert.match(workflow, /\.harness\/skills\/\*\*/);
  assert.match(workflow, /harhub-skills\.zip/);
  assert.match(workflow, /manifest=</);
  assert.match(workflow, /skills=@/);
  assert.match(workflow, /permissions:\n  contents: read/);
  const parsed = parseYaml(workflow) as {
    jobs?: { sync?: { steps?: Array<{ name?: string; run?: string }> } };
  };
  assert.ok(parsed);
  const syncScript = parsed.jobs?.sync?.steps?.find(
    (step) => step.name === "Sync Project with Harhub"
  )?.run;
  assert.ok(syncScript);
  const shellCheck = spawnSync("bash", ["-n"], { input: syncScript, encoding: "utf8" });
  assert.equal(shellCheck.status, 0, shellCheck.stderr);
  assert.ok(template.files.some((file) => file.path === ".harhub/project.json"));
  assert.ok(template.files.some((file) => file.path === ".harhub/scripts/collect-bindings.mjs"));
}

function assertPrivateNoStore(response: Response): void {
  assert.match(response.headers.get("cache-control") ?? "", /private/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
}

function fileContent(template: HarnessTemplateResponse | undefined, filePath: string): string {
  const content = template?.files.find((file) => file.path === filePath)?.content;
  assert.ok(content, `Missing ${filePath}`);
  return content;
}

function writeFramework(directory: string, template: HarnessTemplateResponse | undefined): void {
  assert.ok(template);
  for (const file of template.files) {
    const target = path.join(directory, file.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}
