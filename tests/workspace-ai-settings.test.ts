import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("stores encrypted AI credentials per workspace without returning the key", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-ai-settings-"));
  const statePath = path.join(temporaryDirectory, "state.json");
  const previousStatePath = process.env.HARHUB_STATE;
  const previousEncryptionKey = process.env.HARHUB_ENCRYPTION_KEY;
  process.env.HARHUB_STATE = statePath;
  process.env.HARHUB_ENCRYPTION_KEY = "workspace-settings-test-encryption-key";

  try {
    const {
      createWorkspaceForAccount,
      getWorkspaceAiRuntimeConfiguration,
      getWorkspaceAiSettings,
      loadState,
      saveState,
      updateWorkspaceAiSettings
    } = await import("../src/state/index.js");

    const initial = await getWorkspaceAiSettings("acct_demo", "ws_demo");
    assert.equal(initial.configured, false);
    assert.equal(initial.canManage, true);

    const saved = await updateWorkspaceAiSettings("acct_demo", "ws_demo", {
      provider: "openai-compatible",
      baseUrl: "https://provider.example/v1/",
      model: "workspace-model",
      apiKey: "sk-workspace-secret"
    });
    assert.equal(saved.configured, true);
    assert.equal(saved.baseUrl, "https://provider.example/v1");
    assert.equal(saved.apiKeyHint, "••••cret");
    assert.equal("apiKey" in saved, false);

    const runtime = await getWorkspaceAiRuntimeConfiguration("acct_demo", "ws_demo");
    assert.equal(runtime?.apiKey, "sk-workspace-secret");
    assert.equal(runtime?.model, "workspace-model");

    const storedState = readFileSync(statePath, "utf8");
    assert.doesNotMatch(storedState, /sk-workspace-secret/);
    assert.match(storedState, /"encryptedApiKey": "v1:/);

    const state = await loadState();
    state.memberships.push({
      id: "member-settings-test",
      accountId: "acct_member",
      workspaceId: "ws_demo",
      role: "member",
      createdAt: new Date().toISOString()
    });
    await saveState(state);
    assert.equal((await getWorkspaceAiSettings("acct_member", "ws_demo")).canManage, false);
    await assert.rejects(
      updateWorkspaceAiSettings("acct_member", "ws_demo", {
        provider: "openai-compatible",
        baseUrl: "https://provider.example/v1",
        model: "forbidden-model"
      }),
      /Workspace admin access is required/
    );

    const secondWorkspace = await createWorkspaceForAccount("acct_demo", { name: "Second" });
    assert.equal(
      await getWorkspaceAiRuntimeConfiguration("acct_demo", secondWorkspace.id),
      undefined
    );
  } finally {
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    if (previousEncryptionKey === undefined) delete process.env.HARHUB_ENCRYPTION_KEY;
    else process.env.HARHUB_ENCRYPTION_KEY = previousEncryptionKey;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
