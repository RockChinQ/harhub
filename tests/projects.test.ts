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
import { parse as parseYaml } from "yaml";

import type {
  HarnessTemplateResponse,
  ProjectSyncRequest
} from "../src/shared/types.js";

test("freezes Forge sessions into repository-synchronized Projects", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-projects-"));
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  let server: Server | undefined;

  try {
    const {
      archiveProject,
      createForgeSession,
      createSession,
      freezeForgeSessionAsProject,
      getForgeSession,
      getProject,
      listProjects,
      loadState,
      recordForgeSessionTemplate,
      syncProjectFromRepository
    } = await import("../src/state/index.js");
    const { buildHarnessTemplate } = await import("../src/server/services/forge.js");
    const { skillFilesChecksum } = await import("../src/features/skills/archive.js");
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
    const skillDigest = skillFilesChecksum([{ path: "SKILL.md", content: skillContent }]);
    const skill = {
      id: "asset:skill:release-notes",
      kind: "skill" as const,
      name: "release-notes",
      displayName: "Release Notes",
      slug: "release-notes",
      description: "Prepare release notes.",
      health: "valid" as const,
      fileCount: 1,
      size: skillContent.byteLength
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
      repository: {
        provider: "github",
        owner: "RockChinQ",
        name: "release-control",
        url: "https://github.com/RockChinQ/release-control",
        defaultBranch: "main"
      },
      apiBaseUrl: "https://harhub.example",
      assetDigests: { [skill.id]: skillDigest }
    });
    assert.ok(frozen.syncToken?.startsWith("hhp_"));
    assert.equal(frozen.project.bindings.length, 2);
    assert.equal(frozen.project.bindings[0]?.kind, "rule");
    assert.equal("syncTokenHash" in frozen.project, false);

    const storedState = await loadState();
    const storedProject = storedState.projects.find((item) => item.id === frozen.project.id);
    assert.ok(storedProject);
    assert.notEqual(storedProject.syncTokenHash, frozen.syncToken);
    assert.equal(storedProject.syncTokenHash.length, 64);

    const restoredSession = await getForgeSession("acct_demo", "ws_demo", session.id);
    assert.equal(restoredSession.frozenProject?.id, frozen.project.id);
    const projectConfig = JSON.parse(fileContent(
      restoredSession.template,
      ".harhub/project.json"
    )) as { projectId: string; syncUrl: string; repository: string };
    assert.equal(projectConfig.projectId, frozen.project.id);
    assert.equal(projectConfig.syncUrl, `https://harhub.example/api/projects/${frozen.project.id}/sync`);
    assert.equal(projectConfig.repository, "RockChinQ/release-control");

    const repeatedFreeze = await freezeForgeSessionAsProject({
      accountId: "acct_demo",
      workspaceId: "ws_demo",
      sessionId: session.id,
      name: "Ignored duplicate",
      repository: frozen.project.repository,
      apiBaseUrl: "https://harhub.example",
      assetDigests: {}
    });
    assert.equal(repeatedFreeze.project.id, frozen.project.id);
    assert.equal(repeatedFreeze.syncToken, undefined);
    assert.equal((await listProjects("acct_demo", "ws_demo")).projects.length, 1);

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
    const skillRoot = path.join(checkout, ".harness/skills/release-notes");
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(path.join(skillRoot, "SKILL.md"), skillContent);
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
    assert.equal(payload.bindings.find((item) => item.kind === "skill")?.digest, skillDigest);
    assert.ok(payload.bindings.some((item) => item.kind === "rule"));

    const { createServerApp } = await import("../src/server/app.js");
    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const accountToken = await createSession("acct_demo");

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

    const syncResponse = await fetch(`${baseUrl}/api/projects/${frozen.project.id}/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${frozen.syncToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    assert.equal(syncResponse.status, 200);
    assertPrivateNoStore(syncResponse);
    const firstSync = await syncResponse.json() as {
      revision: number;
      counts: { synced: number };
    };
    assert.equal(firstSync.revision, 1);
    assert.equal(firstSync.counts.synced, 2);

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
      frozen.syncToken ?? "",
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
      syncProjectFromRepository(frozen.project.id, frozen.syncToken ?? "", payload),
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
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.ok(parseYaml(workflow));
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
