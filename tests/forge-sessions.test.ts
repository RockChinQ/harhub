import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  ForgeOperationStreamEvent,
  HarnessTemplateResponse
} from "../src/shared/types.js";

test("keeps Forge history private, bounded, expiring, and non-cacheable", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-forge-history-"));
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  let server: Server | undefined;

  try {
    const {
      beginForgeSessionOperation,
      createForgeSession,
      createSession,
      getForgeSession,
      listForgeSessions,
      loadState,
      recordForgeSessionFailure,
      recordForgeSessionFollowUp,
      recordForgeSessionTemplate,
      saveState
    } = await import("../src/state/index.js");

    const created = [];
    for (let index = 0; index < 13; index += 1) {
      created.push(await createForgeSession(
        "acct_demo",
        "ws_demo",
        `Build project ${index}`
      ));
    }
    const bounded = await listForgeSessions("acct_demo", "ws_demo");
    assert.equal(bounded.sessions.length, 12);
    assert.equal(bounded.cache.maxSessions, 12);
    assert.equal(bounded.cache.ttlDays, 30);
    assert.equal(bounded.sessions.some((item) => item.id === created[0].id), false);

    const resumable = created.at(-1);
    assert.ok(resumable);
    const answers = [{ question: "Who is this for?", answer: "Release engineers" }];
    await recordForgeSessionFollowUp(
      "acct_demo",
      "ws_demo",
      { requirement: resumable.requirement, answers, sessionId: resumable.id },
      {
        mode: "llm",
        sessionTitle: "Release Readiness",
        ready: false,
        questions: [{
          question: "What should it do?",
          component: {
            type: "multi-select",
            options: [{ label: "Review changes" }, { label: "Prepare a handoff" }],
            maxSelections: 2
          }
        }]
      }
    );
    const restoredQuestion = await getForgeSession("acct_demo", "ws_demo", resumable.id);
    assert.equal(restoredQuestion.title, "Release Readiness");
    assert.equal(restoredQuestion.answerCount, 1);
    assert.equal(restoredQuestion.followUp?.questions?.[0]?.question, "What should it do?");

    const template = exampleTemplate("# Project harness\n");
    await recordForgeSessionTemplate(
      "acct_demo",
      "ws_demo",
      { requirement: resumable.requirement, answers, sessionId: resumable.id },
      template
    );
    const restoredTemplate = await getForgeSession("acct_demo", "ws_demo", resumable.id);
    assert.equal(restoredTemplate.status, "complete");
    assert.equal(restoredTemplate.title, "Project");
    assert.equal(restoredTemplate.template?.files[0]?.content, "# Project harness\n");

    const authoritative = await createForgeSession(
      "acct_demo",
      "ws_demo",
      "Build from server-owned session state"
    );
    await recordForgeSessionFollowUp(
      "acct_demo",
      "ws_demo",
      { requirement: authoritative.requirement, answers: [], sessionId: authoritative.id },
      {
        mode: "llm",
        ready: false,
        questions: [
          {
            question: "Who is the primary user?",
            component: { type: "text", options: [] }
          },
          {
            question: "What must work in the first release?",
            component: { type: "text", options: [] }
          }
        ]
      }
    );
    await assert.rejects(
      beginForgeSessionOperation(
        "acct_demo",
        "ws_demo",
        authoritative.id,
        "operation-incomplete",
        "follow-up",
        [{ question: "Who is the primary user?", answer: "Release engineers" }]
      ),
      /Answer every current Forge question/
    );
    await assert.rejects(
      beginForgeSessionOperation(
        "acct_demo",
        "ws_demo",
        authoritative.id,
        "operation-incomplete-generate",
        "generate",
        [{ question: "Who is the primary user?", answer: "Release engineers" }]
      ),
      /Answer every current Forge question/
    );

    const priorAnswers = [
      { question: "Who is it for?", answer: "Release engineers" },
      { question: "What must work?", answer: "Verified handoffs" }
    ];
    const finalQuestion = "Which delivery constraint matters most?";
    const finalAnswer = { question: finalQuestion, answer: "No downtime" };
    const skipCurrentQuestion = await createForgeSession(
      "acct_demo",
      "ws_demo",
      "Generate without the current answer"
    );
    await recordForgeSessionFollowUp(
      "acct_demo",
      "ws_demo",
      {
        requirement: skipCurrentQuestion.requirement,
        answers: priorAnswers,
        sessionId: skipCurrentQuestion.id
      },
      {
        mode: "llm",
        ready: false,
        questions: [{
          question: finalQuestion,
          component: { type: "text", options: [] }
        }]
      }
    );
    const generatedWithoutCurrentAnswer = await beginForgeSessionOperation(
      "acct_demo",
      "ws_demo",
      skipCurrentQuestion.id,
      "operation-skip-current-answer",
      "generate"
    );
    assert.deepEqual(generatedWithoutCurrentAnswer.input.answers, priorAnswers);

    const answerAndGenerate = await createForgeSession(
      "acct_demo",
      "ws_demo",
      "Save the current answer before generating"
    );
    await recordForgeSessionFollowUp(
      "acct_demo",
      "ws_demo",
      {
        requirement: answerAndGenerate.requirement,
        answers: priorAnswers,
        sessionId: answerAndGenerate.id
      },
      {
        mode: "llm",
        ready: false,
        questions: [{
          question: finalQuestion,
          component: { type: "text", options: [] }
        }]
      }
    );
    const generatedWithCurrentAnswer = await beginForgeSessionOperation(
      "acct_demo",
      "ws_demo",
      answerAndGenerate.id,
      "operation-answer-and-generate",
      "generate",
      [finalAnswer]
    );
    assert.deepEqual(generatedWithCurrentAnswer.input.answers, [...priorAnswers, finalAnswer]);
    assert.equal(generatedWithCurrentAnswer.session.activeOperation?.operation, "generate");

    const begun = await beginForgeSessionOperation(
      "acct_demo",
      "ws_demo",
      authoritative.id,
      "operation-one",
      "follow-up",
      [
        { question: "Who is the primary user?", answer: "Release engineers" },
        { question: "What must work in the first release?", answer: "Verified handoffs" }
      ]
    );
    assert.equal(begun.session.status, "working");
    assert.equal(begun.session.activeOperation?.operationId, "operation-one");
    assert.deepEqual(begun.input.answers, [
      { question: "Who is the primary user?", answer: "Release engineers" },
      { question: "What must work in the first release?", answer: "Verified handoffs" }
    ]);
    const operationFailure = {
      operationId: "operation-one",
      operation: "follow-up" as const,
      code: "timeout" as const,
      message: "The provider timed out.",
      retryable: true,
      attempts: 3,
      durationMs: 70_000,
      occurredAt: new Date().toISOString()
    };
    await recordForgeSessionFailure(
      "acct_demo",
      "ws_demo",
      begun.input,
      operationFailure,
      "operation-one"
    );
    const failed = await getForgeSession("acct_demo", "ws_demo", authoritative.id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.failure?.operationId, "operation-one");
    assert.equal(failed.activeOperation, undefined);

    const retry = await beginForgeSessionOperation(
      "acct_demo",
      "ws_demo",
      authoritative.id,
      "operation-two",
      "generate"
    );
    assert.equal(retry.session.status, "working");
    assert.equal(retry.session.failure, undefined);
    await assert.rejects(
      recordForgeSessionTemplate(
        "acct_demo",
        "ws_demo",
        retry.input,
        template,
        "operation-one"
      ),
      /superseded by a newer session operation/
    );
    await recordForgeSessionTemplate(
      "acct_demo",
      "ws_demo",
      retry.input,
      template,
      "operation-two"
    );
    assert.equal(
      (await getForgeSession("acct_demo", "ws_demo", authoritative.id)).status,
      "complete"
    );

    const legacySingle = await createForgeSession(
      "acct_demo",
      "ws_demo",
      "Resume a legacy single-question session"
    );
    await recordForgeSessionFollowUp(
      "acct_demo",
      "ws_demo",
      { requirement: legacySingle.requirement, answers: [], sessionId: legacySingle.id },
      {
        mode: "llm",
        ready: false,
        question: "Which legacy workflow matters most?",
        component: { type: "text", options: [] }
      }
    );
    const resumedLegacySingle = await beginForgeSessionOperation(
      "acct_demo",
      "ws_demo",
      legacySingle.id,
      "legacy-single-operation",
      "follow-up",
      [{ question: "Which legacy workflow matters most?", answer: "Release handoffs" }]
    );
    assert.deepEqual(resumedLegacySingle.input.answers, [
      { question: "Which legacy workflow matters most?", answer: "Release handoffs" }
    ]);

    const legacy = await createForgeSession("acct_demo", "ws_demo", "Legacy local response");
    const legacyState = await loadState();
    const legacyRecord = legacyState.forgeSessions.find((item) => item.id === legacy.id);
    assert.ok(legacyRecord);
    legacyRecord.followUp = {
      mode: "local-fallback" as "llm",
      ready: false,
      question: "Legacy question",
      component: { type: "text", options: [] }
    };
    legacyRecord.template = {
      ...exampleTemplate("# Legacy generated content\n"),
      mode: "local-fallback" as "llm"
    };
    legacyRecord.status = "complete";
    await saveState(legacyState);
    const migratedLegacy = await getForgeSession("acct_demo", "ws_demo", legacy.id);
    assert.equal(migratedLegacy.followUp, undefined);
    assert.equal(migratedLegacy.template, undefined);
    assert.equal(migratedLegacy.status, "interviewing");

    const oversized = await createForgeSession("acct_demo", "ws_demo", "Build an oversized project");
    await assert.rejects(
      recordForgeSessionTemplate(
        "acct_demo",
        "ws_demo",
        { requirement: oversized.requirement, answers: [], sessionId: oversized.id },
        exampleTemplate("x".repeat(1_300_000))
      ),
      /too large to keep in history/
    );
    assert.equal(
      (await getForgeSession("acct_demo", "ws_demo", oversized.id)).status,
      "interviewing"
    );

    const state = await loadState();
    state.memberships.push({
      id: "forge-history-other-membership",
      accountId: "acct_other",
      workspaceId: "ws_demo",
      role: "member",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const expiring = state.forgeSessions.find((item) => item.id === oversized.id);
    assert.ok(expiring);
    expiring.expiresAt = new Date(Date.now() - 1_000).toISOString();
    await saveState(state);
    assert.equal(
      (await listForgeSessions("acct_demo", "ws_demo")).sessions.some(
        (item) => item.id === oversized.id
      ),
      false
    );
    await assert.rejects(
      getForgeSession("acct_other", "ws_demo", resumable.id),
      /Forge session not found/
    );

    const { createServerApp } = await import("../src/server/app.js");
    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const token = await createSession("acct_demo");
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    const archiveResponse = await fetch(`${baseUrl}/api/workspaces/ws_demo/forge/archive`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId: resumable.id })
    });
    assert.equal(archiveResponse.status, 200);
    assertPrivateNoStore(archiveResponse);
    assert.match(
      archiveResponse.headers.get("content-disposition") ?? "",
      /filename\*=UTF-8''project-harness\.zip/
    );
    assert.ok((await archiveResponse.arrayBuffer()).byteLength > 0);

    const createResponse = await fetch(`${baseUrl}/api/workspaces/ws_demo/forge/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requirement: "Browser history API verification" })
    });
    assert.equal(createResponse.status, 201);
    assertPrivateNoStore(createResponse);
    const apiSession = await createResponse.json() as { id: string; title: string };

    const missingAiResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/forge/sessions/${apiSession.id}/follow-up`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          requirement: "This client value must be ignored",
          clientAnswers: [{ question: "Injected", answer: "Injected" }]
        })
      }
    );
    assert.equal(missingAiResponse.status, 200);
    assertPrivateNoStore(missingAiResponse);
    assert.match(missingAiResponse.headers.get("content-type") ?? "", /application\/x-ndjson/);
    assert.ok(missingAiResponse.headers.get("x-harhub-operation-id"));
    const missingAiEvents = await readNdjson(missingAiResponse);
    const missingAiTerminal = missingAiEvents.at(-1);
    assert.equal(missingAiTerminal?.type, "error");
    assert.match(
      missingAiTerminal?.type === "error" ? missingAiTerminal.failure.message : "",
      /Forge AI is not configured/
    );
    const failedApiSession = await getForgeSession("acct_demo", "ws_demo", apiSession.id);
    assert.equal(failedApiSession.status, "failed");
    assert.equal(failedApiSession.requirement, "Browser history API verification");
    assert.deepEqual(failedApiSession.answers, []);

    const listResponse = await fetch(`${baseUrl}/api/workspaces/ws_demo/forge/sessions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(listResponse.status, 200);
    assertPrivateNoStore(listResponse);
    const apiList = await listResponse.json() as { sessions: Array<{ id: string }> };
    assert.ok(apiList.sessions.some((item) => item.id === apiSession.id));

    const detailResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/forge/sessions/${apiSession.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(detailResponse.status, 200);
    assertPrivateNoStore(detailResponse);
    assert.equal((await detailResponse.json() as { title: string }).title, apiSession.title);

    const deleteResponse = await fetch(
      `${baseUrl}/api/workspaces/ws_demo/forge/sessions/${apiSession.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(deleteResponse.status, 204);
    assertPrivateNoStore(deleteResponse);
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    }
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

function exampleTemplate(content: string): HarnessTemplateResponse {
  return {
    mode: "llm",
    generatedAt: new Date().toISOString(),
    profile: {
      name: "Project",
      slug: "project",
      summary: "A project harness.",
      targetUsers: ["Developers"],
      goals: ["Create a baseline"],
      constraints: [],
      successCriteria: ["The baseline is reviewable"],
      stackNotes: []
    },
    selectedAssets: [],
    files: [{ path: "AGENTS.md", content }]
  };
}

function assertPrivateNoStore(response: Response): void {
  assert.match(response.headers.get("cache-control") ?? "", /private/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.match(response.headers.get("pragma") ?? "", /no-cache/);
  assert.match(response.headers.get("vary") ?? "", /Authorization/i);
}

async function readNdjson(response: Response): Promise<ForgeOperationStreamEvent[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ForgeOperationStreamEvent);
}
