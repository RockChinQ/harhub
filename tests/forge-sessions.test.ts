import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { HarnessTemplateResponse } from "../src/shared/types.js";

test("keeps Forge history private, bounded, expiring, and non-cacheable", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-forge-history-"));
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  let server: Server | undefined;

  try {
    const {
      createForgeSession,
      createSession,
      getForgeSession,
      listForgeSessions,
      loadState,
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
        mode: "local-fallback",
        ready: false,
        question: "What should it do?",
        component: {
          type: "multi-select",
          options: [{ label: "Review changes" }, { label: "Prepare a handoff" }],
          maxSelections: 2
        }
      }
    );
    const restoredQuestion = await getForgeSession("acct_demo", "ws_demo", resumable.id);
    assert.equal(restoredQuestion.answerCount, 1);
    assert.equal(restoredQuestion.followUp?.question, "What should it do?");

    const template = exampleTemplate("# Project harness\n");
    await recordForgeSessionTemplate(
      "acct_demo",
      "ws_demo",
      { requirement: resumable.requirement, answers, sessionId: resumable.id },
      template
    );
    const restoredTemplate = await getForgeSession("acct_demo", "ws_demo", resumable.id);
    assert.equal(restoredTemplate.status, "complete");
    assert.equal(restoredTemplate.template?.files[0]?.content, "# Project harness\n");

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

    const createResponse = await fetch(`${baseUrl}/api/workspaces/ws_demo/forge/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requirement: "Browser history API verification" })
    });
    assert.equal(createResponse.status, 201);
    assertPrivateNoStore(createResponse);
    const apiSession = await createResponse.json() as { id: string; title: string };

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
    mode: "local-fallback",
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
