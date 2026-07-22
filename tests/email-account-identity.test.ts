import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function withIsolatedState(
  name: string,
  run: (state: typeof import("../src/state/index.js")) => Promise<void>
): Promise<void> {
  const directory = mkdtempSync(path.join(os.tmpdir(), `harhub-${name}-`));
  const previousState = process.env.HARHUB_STATE;
  const previousDatabase = process.env.HARHUB_DATABASE_URL;
  process.env.HARHUB_STATE = path.join(directory, "state.json");
  delete process.env.HARHUB_DATABASE_URL;
  try {
    const state = await import(`../src/state/index.js?${name}=${Date.now()}`);
    await run(state);
  } finally {
    if (previousState === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousState;
    if (previousDatabase === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousDatabase;
    rmSync(directory, { recursive: true, force: true });
  }
}

test("uses verified normalized email as the Account identity across auth providers and provider subjects", async () => {
  await withIsolatedState("email-account-auth", async (state) => {
    const emailAccount = await state.signInForDevelopment({ email: "Owner@Example.com" });
    const github = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "github-subject-one",
      email: "owner@example.com",
      emailVerified: true,
      name: "GitHub User"
    });
    const google = await state.signInWithOAuthProfile({
      provider: "google",
      providerAccountId: "google-subject",
      email: " OWNER@example.com ",
      emailVerified: true,
      name: "Google User"
    });
    const changedGitHubSubject = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "github-subject-two",
      email: "owner@example.com",
      emailVerified: true,
      name: "GitHub User Again"
    });

    assert.equal(github.id, emailAccount.id);
    assert.equal(google.id, emailAccount.id);
    assert.equal(changedGitHubSubject.id, emailAccount.id);
    const snapshot = await state.loadState();
    assert.equal(snapshot.accounts.filter((account) => account.email === "owner@example.com").length, 1);
    assert.ok(snapshot.identities.length >= 3);
    assert.ok(snapshot.identities.every((identity) => identity.accountId === emailAccount.id));
    await assert.rejects(
      state.updateAccountProfile(emailAccount.id, { email: "different@example.com" }),
      /managed by sign-in/i
    );
  });
});

test("provider subject metadata cannot override email Account identity", async () => {
  await withIsolatedState("email-over-subject", async (state) => {
    const oldEmailAccount = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "same-provider-subject",
      email: "old@example.com",
      emailVerified: true,
      name: "Old Email"
    });
    const newEmailAccount = await state.signInForDevelopment({ email: "new@example.com" });

    const signedIn = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "same-provider-subject",
      email: "new@example.com",
      emailVerified: true,
      name: "New Email"
    });

    assert.equal(signedIn.id, newEmailAccount.id);
    const snapshot = await state.loadState();
    assert.equal(snapshot.accounts.find((account) => account.id === oldEmailAccount.id)?.email, "old@example.com");
    assert.equal(
      snapshot.identities.find(
        (identity) => identity.provider === "github" && identity.providerAccountId === "same-provider-subject"
      )?.accountId,
      newEmailAccount.id
    );
  });
});

test("verified OAuth ownership invalidates a password-only email preclaim", async () => {
  await withIsolatedState("password-email-preclaim", async (state) => {
    const preclaimed = await state.signInWithPassword({
      email: "victim@example.com",
      password: "attacker-password"
    });
    assert.equal(
      (await state.loadState()).accounts.find((account) => account.id === preclaimed.id)?.emailVerifiedAt,
      undefined
    );
    const attackerSession = await state.createSession(preclaimed.id);
    const legacyState = await state.loadState();
    legacyState.schemaVersion = 1;
    delete legacyState.accounts.find((account) => account.id === preclaimed.id)?.emailVerifiedAt;
    await state.saveState(legacyState);
    const migratedState = await state.loadState();
    assert.equal(migratedState.schemaVersion, 2);
    assert.equal(
      migratedState.accounts.find((account) => account.id === preclaimed.id)?.emailVerifiedAt,
      undefined
    );
    assert.ok(await state.authenticate(attackerSession));
    const staleState = await state.loadState();

    const verified = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "verified-owner",
      email: "victim@example.com",
      emailVerified: true,
      name: "Verified Owner"
    });
    assert.equal(verified.id, preclaimed.id);
    assert.ok(
      (await state.loadState()).accounts.find((account) => account.id === verified.id)?.emailVerifiedAt
    );
    assert.equal(await state.authenticate(attackerSession), undefined);
    staleState.workspaces[0]!.name = "stale local overwrite";
    await assert.rejects(state.saveState(staleState), /state changed.*retry/i);
    assert.equal(await state.authenticate(attackerSession), undefined);
    await assert.rejects(
      state.signInWithPassword({
        email: "victim@example.com",
        password: "attacker-password"
      }),
      /invalid email or password/i
    );
  });
});

test("cannot mint a stale password session across verified ownership claim", async () => {
  await withIsolatedState("atomic-password-session", async (state) => {
    const preclaimed = await state.signInWithPassword({
      email: "session-race@example.com",
      password: "attacker-password"
    });

    const passwordSignIn = state.signInWithPassword({
      email: "session-race@example.com",
      password: "attacker-password"
    }, true);
    const verifiedSignIn = state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "verified-session-owner",
      email: "session-race@example.com",
      emailVerified: true,
      name: "Verified Session Owner"
    }, true);

    const [passwordResult, verifiedResult] = await Promise.all([
      passwordSignIn,
      verifiedSignIn
    ]);
    assert.equal(passwordResult.account.id, preclaimed.id);
    assert.equal(verifiedResult.account.id, preclaimed.id);
    assert.equal(await state.authenticate(passwordResult.token), undefined);
    assert.equal(
      (await state.authenticate(verifiedResult.token))?.account.id,
      verifiedResult.account.id
    );
  });
});

test("verified convergence revokes sessions from an unverified duplicate", async () => {
  await withIsolatedState("verified-target-duplicate", async (state) => {
    const verified = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "verified-target",
      email: "duplicate-owner@example.com",
      emailVerified: true,
      name: "Verified Owner"
    });
    const preclaim = await state.signInWithPassword({
      email: "temporary-preclaim@example.com",
      password: "attacker-password"
    });
    const duplicateState = await state.loadState();
    duplicateState.accounts.find((account) => account.id === preclaim.id)!.email =
      "duplicate-owner@example.com";
    await state.saveState(duplicateState);
    const attackerSession = await state.createSession(preclaim.id);

    const converged = await state.signInWithOAuthProfile({
      provider: "google",
      providerAccountId: "verified-target-google",
      email: "duplicate-owner@example.com",
      emailVerified: true,
      name: "Verified Owner"
    });

    assert.equal(converged.id, verified.id);
    assert.equal(await state.authenticate(attackerSession), undefined);
    assert.equal(
      (await state.loadState()).accounts.filter(
        (account) => account.email === "duplicate-owner@example.com"
      ).length,
      1
    );
    await assert.rejects(
      state.signInWithPassword({
        email: "duplicate-owner@example.com",
        password: "attacker-password"
      }),
      /invalid email or password/i
    );
  });
});

test("password sign-in does not merge unverified duplicate accounts", async () => {
  await withIsolatedState("password-no-merge", async (state) => {
    const first = await state.signInWithPassword({
      email: "duplicate@example.com",
      password: "first-password"
    });
    const second = await state.signInWithPassword({
      email: "temporary@example.com",
      password: "second-password"
    });
    const duplicateState = await state.loadState();
    duplicateState.accounts.find((account) => account.id === second.id)!.email =
      "duplicate@example.com";
    await state.saveState(duplicateState);

    assert.equal(
      (await state.signInWithPassword({
        email: "duplicate@example.com",
        password: "second-password"
      })).id,
      second.id
    );
    assert.equal(
      (await state.signInWithPassword({
        email: "duplicate@example.com",
        password: "first-password"
      })).id,
      first.id
    );
    assert.equal(
      (await state.loadState()).accounts.filter(
        (account) => account.email === "duplicate@example.com"
      ).length,
      2
    );
  });
});

test("unverified password preclaim cannot accept an email invitation", async () => {
  await withIsolatedState("unverified-invitation", async (state) => {
    const invitation = await state.inviteWorkspaceMember("acct_demo", "ws_demo", {
      email: "invited-owner@example.com",
      role: "member"
    });
    const preclaim = await state.signInWithPassword({
      email: "invited-owner@example.com",
      password: "attacker-password",
      inviteToken: invitation.token
    });
    assert.equal(
      (await state.loadState()).memberships.some(
        (membership) =>
          membership.accountId === preclaim.id && membership.workspaceId === "ws_demo"
      ),
      false
    );
    await assert.rejects(
      state.acceptWorkspaceInvitation(preclaim.id, invitation.token),
      /verify your account email/i
    );

    const verified = await state.signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "invited-owner",
      email: "invited-owner@example.com",
      emailVerified: true,
      name: "Invited Owner"
    });
    assert.equal(verified.id, preclaim.id);
    assert.equal(
      (await state.loadState()).memberships.some(
        (membership) =>
          membership.accountId === verified.id && membership.workspaceId === "ws_demo"
      ),
      true
    );
  });
});

test("serializes concurrent first sign-ins for the same normalized email", async () => {
  await withIsolatedState("concurrent-email-account", async (state) => {
    const signIns = Array.from({ length: 20 }, (_, index) => {
      if (index % 3 === 0) {
        return state.signInForDevelopment({ email: " Concurrent@Example.com " });
      }
      return state.signInWithOAuthProfile({
        provider: index % 3 === 1 ? "github" : "google",
        providerAccountId: `subject-${index}`,
        email: index % 2 === 0 ? "CONCURRENT@example.com" : "concurrent@example.com",
        emailVerified: true,
        name: `Concurrent ${index}`
      });
    });
    const accounts = await Promise.all(signIns);
    assert.equal(new Set(accounts.map((account) => account.id)).size, 1);
    const snapshot = await state.loadState();
    assert.equal(
      snapshot.accounts.filter((account) => account.email === "concurrent@example.com").length,
      1
    );
  });
});

test("rejects OAuth sign-in without a provider-verified email", async () => {
  await withIsolatedState("verified-email-required", async (state) => {
    await assert.rejects(
      state.signInWithOAuthProfile({
        provider: "github",
        providerAccountId: "anything",
        email: "fallback@users.noreply.github.com",
        emailVerified: false,
        name: "No Verified Email"
      }),
      /verified email/i
    );
    const snapshot = await state.loadState();
    assert.equal(snapshot.accounts.some((account) => account.email === "fallback@users.noreply.github.com"), false);
  });
});
