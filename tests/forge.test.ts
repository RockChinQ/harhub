import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import JSZip from "jszip";

import {
  buildHarnessTemplate,
  createObservedForgeAiOperation,
  createHarnessFollowUp,
  createHarnessTemplate,
  createHarnessTemplateArchive,
  runForgeAiOperation,
  testForgeAiConnection,
  workspaceAssetSummaries
} from "../src/server/services/forge.js";
import { getOrCreateForgeOperationStream } from "../src/server/services/forge-operation-streams.js";
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
    /AI provider remained unavailable after 3 attempts/
  );
  assert.equal(attempts, 3);
});

test("streams Forge AI deltas and requests provider streaming", async (context) => {
  let providerStreamSetting: unknown;
  const chunks: string[] = [];
  const content = JSON.stringify({
    ready: false,
    question: "Which delivery path matters most?",
    component: {
      type: "single-select",
      options: [{ label: "Web" }, { label: "CLI" }, { label: "Both" }]
    }
  });
  const provider = createServer((request, response) => {
    const body: Buffer[] = [];
    request.on("data", (chunk: Buffer) => body.push(chunk));
    request.on("end", () => {
      providerStreamSetting = (JSON.parse(Buffer.concat(body).toString("utf8")) as {
        stream?: unknown;
      }).stream;
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const delta of [content.slice(0, 30), content.slice(30, 80), content.slice(80)]) {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`);
      }
      response.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    provider.close((error) => error ? reject(error) : resolve());
  }));
  const address = provider.address() as AddressInfo;
  const operation = createObservedForgeAiOperation("follow-up");
  operation.logger = undefined;
  operation.onDelta = (_attempt, delta) => chunks.push(delta);

  const followUp = await createHarnessFollowUp(
    { requirement: "Build a delivery tool", answers: [] },
    [],
    {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "stream-model",
      apiKey: "stream-key"
    },
    operation
  );

  assert.equal(providerStreamSetting, true);
  assert.equal(chunks.join(""), content);
  assert.equal(followUp.question, "Which delivery path matters most?");
});

test("does not retry provider authentication failures", async (context) => {
  let attempts = 0;
  const provider = createServer((_request, response) => {
    attempts += 1;
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "invalid key" } }));
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise<void>((resolve, reject) => {
    provider.close((error) => error ? reject(error) : resolve());
  }));
  const address = provider.address() as AddressInfo;

  await assert.rejects(
    createHarnessFollowUp(
      { requirement: "Build a tool", answers: [] },
      [],
      {
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        model: "auth-model",
        apiKey: "bad-key"
      }
    ),
    (error: unknown) => {
      const failure = (error as { failure?: { code?: string; retryable?: boolean } }).failure;
      return failure?.code === "provider_auth" && failure.retryable === false;
    }
  );
  assert.equal(attempts, 1);
});

test("bounds Forge AI timeouts and emits structured operation logs", async () => {
  const logs: Array<Record<string, unknown>> = [];
  const attempts: number[] = [];
  const operation = createObservedForgeAiOperation("follow-up", {
    operationId: "timeout-operation",
    workspaceId: "workspace-timeout",
    sessionId: "session-timeout",
    model: "timeout-model"
  });
  operation.logger = (_level, entry) => logs.push(entry);
  operation.onAttempt = (attempt) => attempts.push(attempt);

  await assert.rejects(
    runForgeAiOperation(
      async ({ signal }) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
      operation,
      {
        maxAttempts: 2,
        attemptTimeoutMs: 15,
        totalTimeoutMs: 50,
        retryDelaysMs: [1]
      }
    ),
    (error: unknown) => {
      const failure = (error as { failure?: { code?: string; attempts?: number; durationMs?: number } }).failure;
      return failure?.code === "timeout" &&
        failure.attempts === 2 &&
        typeof failure.durationMs === "number" &&
        failure.durationMs < 250;
    }
  );

  assert.deepEqual(attempts, [1, 2]);
  assert.ok(logs.some((entry) => entry.event === "forge.ai.operation.failed"));
  assert.ok(logs.every((entry) => entry.operationId === "timeout-operation"));
  assert.equal(JSON.stringify(logs).includes("bad-key"), false);
});

test("replays one server-side Forge operation to reentrant subscribers", async () => {
  const identity = {
    accountId: `account-${Date.now()}`,
    workspaceId: "workspace-replay",
    sessionId: "session-replay"
  };
  let executions = 0;
  let releaseOperation!: () => void;
  const operationGate = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });
  const execute = async (stream: ReturnType<typeof getOrCreateForgeOperationStream>) => {
    executions += 1;
    stream.publish({
      type: "progress",
      operationId: stream.operationId,
      operation: "generate",
      step: "compose",
      status: "active"
    });
    stream.publish({
      type: "delta",
      operationId: stream.operationId,
      operation: "generate",
      attempt: 1,
      delta: "partial"
    });
    await operationGate;
    stream.publish({
      type: "error",
      operationId: stream.operationId,
      operation: "generate",
      failure: {
        operationId: stream.operationId,
        operation: "generate",
        code: "timeout",
        message: "timed out",
        retryable: true,
        attempts: 1,
        durationMs: 10,
        occurredAt: new Date().toISOString()
      }
    });
  };

  const first = getOrCreateForgeOperationStream(identity, "generate", execute);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const second = getOrCreateForgeOperationStream(identity, "generate", execute);
  assert.equal(second, first);
  assert.equal(executions, 1);
  const replayed: string[] = [];
  const unsubscribe = second.subscribe((event) => replayed.push(event.type));
  assert.deepEqual(replayed.slice(0, 3), ["operation", "progress", "delta"]);
  unsubscribe();

  releaseOperation();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const terminalReplay: string[] = [];
  first.subscribe((event) => terminalReplay.push(event.type));
  assert.equal(terminalReplay.at(-1), "error");
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
