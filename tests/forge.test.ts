import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import JSZip from "jszip";

import {
  buildHarnessTemplate,
  createHarnessFollowUp,
  createHarnessTemplate,
  createHarnessTemplateArchive,
  testForgeAiConnection,
  workspaceAssetSummaries
} from "../src/server/services/forge.js";
import type {
  AssetCatalog,
  AssetRecord,
  HarnessWorkspaceAssetSummary
} from "../src/shared/types.js";

test("retries Forge AI requests and surfaces the final failure", async (context) => {
  const input = { requirement: "Build a release assistant", answers: [] };
  let attempts = 0;
  let alwaysFail = false;
  const server = createServer((_request, response) => {
    attempts += 1;
    if (alwaysFail || attempts < 3) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "provider overloaded" } }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        ready: false,
        question: "Who will use the release assistant?",
        component: {
          type: "single-select",
          options: [
            { label: "Release engineers" },
            { label: "Product managers" },
            { label: "Support teams" }
          ]
        }
      }) } }]
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address() as AddressInfo;
  const configuration = {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: "forge-test-model",
    apiKey: "forge-test-key"
  };

  const followUp = await createHarnessFollowUp(input, [], configuration);
  assert.equal(attempts, 3);
  assert.equal(followUp.mode, "llm");
  assert.equal(followUp.question, "Who will use the release assistant?");

  alwaysFail = true;
  attempts = 0;
  await assert.rejects(
    createHarnessFollowUp(input, [], configuration),
    /AI request failed after 3 attempts: AI provider returned HTTP 503: provider overloaded/
  );
  assert.equal(attempts, 3);
});

test("lets Forge AI decide when discovery has enough context", async (context) => {
  const receivedInputs: Array<Record<string, unknown>> = [];
  const receivedSystemPrompts: string[] = [];
  let requestCount = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userMessage = body.messages.find((message) => message.role === "user");
      const systemMessage = body.messages.find((message) => message.role === "system");
      receivedInputs.push(JSON.parse(userMessage?.content ?? "{}") as Record<string, unknown>);
      receivedSystemPrompts.push(systemMessage?.content ?? "");
      const content = requestCount === 0
        ? {
            ready: false,
            question: "Which outcome is most important for the first release?",
            component: {
              type: "single-select",
              options: [
                { label: "Fast onboarding" },
                { label: "Reliable delivery" },
                { label: "Easy maintenance" }
              ]
            }
          }
        : requestCount === 1
          ? { ready: true }
          : {
            ready: false,
            question: "Which deployment constraint matters most?",
            component: {
              type: "text",
              placeholder: "Describe the constraint",
              options: []
            }
          };
      requestCount += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) } }]
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address() as AddressInfo;
  const configuration = {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: "forge-test-model",
    apiKey: "forge-test-key"
  };

  const requiredQuestion = await createHarnessFollowUp(
    { requirement: "Build a conventional documentation site", answers: [] },
    [],
    configuration
  );
  assert.equal(requiredQuestion.ready, false);
  assert.equal(
    requiredQuestion.question,
    "Which outcome is most important for the first release?"
  );
  assert.match(receivedSystemPrompts[0] ?? "", /Required questions must be essential/);
  assert.match(receivedSystemPrompts[0] ?? "", /Ask the highest-impact unresolved question first/);

  const twoAnswers = Array.from({ length: 2 }, (_, index) => ({
    question: `Essential question ${index + 1}`,
    answer: `Essential answer ${index + 1}`
  }));
  const readyAfterMinimum = await createHarnessFollowUp(
    { requirement: "Build a conventional documentation site", answers: twoAnswers },
    [],
    configuration
  );
  assert.equal(readyAfterMinimum.ready, true);

  const fourAnswers = Array.from({ length: 4 }, (_, index) => ({
    question: `Question ${index + 1}`,
    answer: `Answer ${index + 1}`
  }));
  const needsMoreContext = await createHarnessFollowUp(
    { requirement: "Build a regulated deployment platform", answers: fourAnswers },
    [],
    configuration
  );
  assert.equal(needsMoreContext.ready, false);
  assert.equal(needsMoreContext.question, "Which deployment constraint matters most?");
  assert.deepEqual(receivedInputs[2]?.answers, fourAnswers);
  assert.equal(requestCount, 3);
});

test("requires workspace AI instead of generating local content", async () => {
  const input = { requirement: "Build a release assistant", answers: [] };
  await assert.rejects(
    createHarnessFollowUp(input, []),
    /Forge AI is not configured for this workspace/
  );
  await assert.rejects(
    createHarnessTemplate(input, []),
    /Answer at least 2 essential follow-up questions/
  );
  await assert.rejects(
    createHarnessTemplate({
      ...input,
      answers: [
        { question: "Who is it for?", answer: "Release engineers" },
        { question: "What must work?", answer: "Verified release handoffs" }
      ]
    }, []),
    /Forge AI is not configured for this workspace/
  );
});

test("builds a framework that records selected workspace Skills", () => {
  const skill = workspaceSkill();
  const template = buildHarnessTemplate({
    name: "Release Assistant",
    summary: "Prepare release notes and readiness evidence.",
    targetUsers: ["Release managers"],
    goals: ["Create consistent release handoffs"],
    constraints: ["Use existing workspace assets"],
    successCriteria: ["Reviewers receive a complete handoff"],
    stackNotes: ["Confirm the target repository stack"],
    agentRules: ["Run readiness checks before release"],
    selectedAssets: [{ assetId: skill.id, reason: "Matches release note work." }],
    workflow: {
      name: "Release workflow",
      objective: "Prepare and verify a release",
      steps: ["Collect changes", "Verify readiness"],
      verification: ["Release notes reviewed"]
    }
  }, [skill]);

  assert.equal(template.selectedAssets.length, 1);
  assert.equal(template.selectedAssets[0].id, skill.id);
  assert.equal(template.selectedAssets[0].installPath, ".harness/skills/release-notes");
  assert.ok(template.files.some((file) => file.path === "AGENTS.md"));
  const catalog = template.files.find((file) => file.path === ".harness/catalog/skills.json");
  assert.match(catalog?.content ?? "", /asset:skill:release-notes/);
});

test("creates a safe ZIP for generated framework files", async () => {
  const archive = await createHarnessTemplateArchive(emptyCatalog(), {
    slug: "release-assistant",
    files: [
      { path: "AGENTS.md", content: "# Agent guide\n" },
      { path: ".harness/README.md", content: "# Harness\n" }
    ],
    selectedAssetIds: []
  });
  const zip = await JSZip.loadAsync(archive.buffer);

  assert.equal(archive.fileName, "release-assistant-harness.zip");
  assert.equal(await zip.file("AGENTS.md")?.async("string"), "# Agent guide\n");
  assert.equal(await zip.file(".harness/README.md")?.async("string"), "# Harness\n");

  await assert.rejects(
    createHarnessTemplateArchive(emptyCatalog(), {
      slug: "unsafe",
      files: [{ path: "../AGENTS.md", content: "unsafe" }],
      selectedAssetIds: []
    }),
    /Invalid generated file path/
  );
});

test("offers only stored non-error Skills to the builder", () => {
  const valid = catalogAsset("valid-skill", "valid");
  const invalid = catalogAsset("invalid-skill", "error");
  const unstored = { ...catalogAsset("unstored-skill", "valid"), storage: undefined };

  assert.deepEqual(
    workspaceAssetSummaries([valid, invalid, unstored]).map((asset) => asset.id),
    [valid.id]
  );
});

test("tests the exact OpenAI-compatible model configuration", async (context) => {
  let receivedAuthorization: string | undefined;
  let receivedPath: string | undefined;
  let receivedBody: Record<string, unknown> | undefined;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    receivedAuthorization = request.headers.authorization;
    receivedPath = request.url;
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }]
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address() as AddressInfo;

  const result = await testForgeAiConnection({
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: "draft-test-model",
    apiKey: "draft-test-key"
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, "draft-test-model");
  assert.equal(receivedPath, "/v1/chat/completions");
  assert.equal(receivedAuthorization, "Bearer draft-test-key");
  assert.equal(receivedBody?.model, "draft-test-model");
  assert.deepEqual(receivedBody?.response_format, { type: "json_object" });
});

function workspaceSkill(): HarnessWorkspaceAssetSummary {
  return {
    id: "asset:skill:release-notes",
    kind: "skill",
    name: "release-notes",
    displayName: "Release Notes",
    slug: "release-notes",
    description: "Create consistent release notes from repository changes.",
    health: "valid",
    fileCount: 2,
    size: 256
  };
}

function emptyCatalog(): AssetCatalog {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    assets: [],
    skills: []
  };
}

function catalogAsset(name: string, health: AssetRecord["health"]): AssetRecord {
  return {
    id: `asset:skill:${name}`,
    kind: "skill",
    name,
    displayName: name,
    slug: name,
    description: `${name} description`,
    health,
    validation: { errors: health === "error" ? 1 : 0, warnings: 0 },
    storage: {
      provider: "s3",
      layout: "files",
      bucket: "test-bucket",
      key: `skills/${name}/`,
      size: 128,
      fileCount: 1,
      contentType: "application/vnd.harhub.skill-directory",
      checksum: "a".repeat(64),
      uploadedAt: new Date().toISOString()
    }
  };
}
