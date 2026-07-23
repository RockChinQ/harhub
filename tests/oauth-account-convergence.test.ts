import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AccountRecord } from "../src/state/types.js";

test("converges all historical same-email Accounts independently of auth provider or subject", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-email-account-convergence-"));
  const previousStatePath = process.env.HARHUB_STATE;
  const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  delete process.env.HARHUB_DATABASE_URL;

  try {
    const state = await import(`../src/state/index.js?email-account-convergence=${Date.now()}`);
    const canonical = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "github-metadata",
      email: "owner@example.com",
      emailVerified: true,
      name: "Owner"
    });
    const before = await state.loadState();
    const canonicalRecord = before.accounts.find((account: AccountRecord) => account.id === canonical.id);
    assert.ok(canonicalRecord);
    const duplicateId = "historical-same-email-account";
    before.accounts.push({
      ...canonicalRecord,
      id: duplicateId,
      name: "Historical Duplicate",
      createdAt: new Date(Date.parse(canonicalRecord.createdAt) + 1_000).toISOString(),
      updatedAt: new Date(Date.parse(canonicalRecord.updatedAt) + 1_000).toISOString()
    });
    await state.saveState(before);
    const duplicateWorkspace = await state.createWorkspaceForAccount(duplicateId, {
      name: "Historical Workspace"
    });
    const duplicateSession = await state.createSession(duplicateId);

    const signedIn = await state.signInWithOAuthProfile({
      provider: "google",
      providerAccountId: "google-metadata",
      email: " OWNER@example.com ",
      emailVerified: true,
      name: "Owner via Google"
    });

    assert.equal(signedIn.id, canonical.id);
    const after = await state.loadState();
    assert.equal(after.accounts.some((account: AccountRecord) => account.id === duplicateId), false);
    assert.equal(
      after.memberships.filter(
        (membership: { accountId: string; workspaceId: string }) =>
          membership.accountId === canonical.id && membership.workspaceId === duplicateWorkspace.id
      ).length,
      1
    );
    assert.equal(
      after.memberships.find(
        (membership: { accountId: string; workspaceId: string; role: string }) =>
          membership.accountId === canonical.id && membership.workspaceId === duplicateWorkspace.id
      )?.role,
      "owner"
    );
    assert.ok(after.identities.every(
      (identity: { accountId: string }) => identity.accountId === canonical.id
    ));
    assert.equal((await state.authenticate(duplicateSession))?.account.id, canonical.id);
  } finally {
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    if (previousDatabaseUrl === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousDatabaseUrl;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
