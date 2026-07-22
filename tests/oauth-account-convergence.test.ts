import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("converges an existing GitHub identity with a same-email account", async () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "harhub-oauth-account-"));
  const previousStatePath = process.env.HARHUB_STATE;
  const previousDatabaseUrl = process.env.HARHUB_DATABASE_URL;
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  delete process.env.HARHUB_DATABASE_URL;

  try {
    const {
      authenticate,
      createSession,
      loadState,
      saveState,
      signInForDevelopment,
      signInWithOAuthProfile
    } = await import(`../src/state/index.js?oauth-account=${Date.now()}`);

    const identityAccount = await signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "45992437",
      email: "45992437+user@users.noreply.github.com",
      emailVerified: true,
      name: "Original GitHub Name"
    });
    const emailAccount = await signInForDevelopment({ email: "owner@example.com" });
    const emailAccountSession = await createSession(emailAccount.id);

    const before = await loadState();
    const identityWorkspaceId = before.memberships.find(
      (membership) => membership.accountId === identityAccount.id
    )?.workspaceId;
    const emailWorkspaceId = before.memberships.find(
      (membership) => membership.accountId === emailAccount.id
    )?.workspaceId;
    assert.ok(identityWorkspaceId);
    assert.ok(emailWorkspaceId);
    assert.notEqual(identityWorkspaceId, emailWorkspaceId);

    const now = new Date().toISOString();
    before.memberships.push({
      id: "duplicate-viewer-membership",
      accountId: identityAccount.id,
      workspaceId: emailWorkspaceId,
      role: "viewer",
      createdAt: now,
      updatedAt: now
    });
    await saveState(before);

    const unverifiedSignIn = await signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "45992437",
      email: "owner@example.com",
      emailVerified: false,
      name: "Unverified Email Response"
    });
    assert.equal(unverifiedSignIn.email, "45992437+user@users.noreply.github.com");
    assert.ok((await loadState()).accounts.some((account) => account.id === emailAccount.id));

    const signedIn = await signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "45992437",
      email: "owner@example.com",
      emailVerified: true,
      name: "Updated GitHub Name"
    });

    assert.equal(signedIn.id, identityAccount.id);
    assert.equal(signedIn.email, "owner@example.com");
    assert.equal(signedIn.name, "Updated GitHub Name");

    const after = await loadState();
    assert.equal(after.accounts.some((account) => account.id === emailAccount.id), false);
    assert.deepEqual(
      after.memberships
        .filter((membership) => membership.accountId === identityAccount.id)
        .map((membership) => membership.workspaceId)
        .sort(),
      [identityWorkspaceId, emailWorkspaceId].sort()
    );
    assert.equal(after.memberships.some((membership) => membership.accountId === emailAccount.id), false);
    const convergedMemberships = after.memberships.filter(
      (membership) =>
        membership.accountId === identityAccount.id && membership.workspaceId === emailWorkspaceId
    );
    assert.equal(convergedMemberships.length, 1);
    assert.equal(convergedMemberships[0]?.role, "owner");

    const identity = after.identities.find(
      (candidate) => candidate.provider === "github" && candidate.providerAccountId === "45992437"
    );
    assert.equal(identity?.accountId, identityAccount.id);
    assert.equal(identity?.email, "owner@example.com");

    const migratedSession = await authenticate(emailAccountSession);
    assert.equal(migratedSession?.account.id, identityAccount.id);

    const fallbackEmail = "999+private@users.noreply.github.com";
    const sameFallbackEmailAccount = await signInForDevelopment({ email: fallbackEmail });
    const firstUnverifiedOAuthAccount = await signInWithOAuthProfile({
      provider: "github",
      providerAccountId: "999",
      email: fallbackEmail,
      emailVerified: false,
      name: "Private GitHub User"
    });
    assert.notEqual(firstUnverifiedOAuthAccount.id, sameFallbackEmailAccount.id);
    const afterFirstUnverifiedOAuth = await loadState();
    assert.ok(
      afterFirstUnverifiedOAuth.accounts.some(
        (account) => account.id === sameFallbackEmailAccount.id
      )
    );
    assert.equal(
      afterFirstUnverifiedOAuth.identities.find(
        (identity) => identity.provider === "github" && identity.providerAccountId === "999"
      )?.accountId,
      firstUnverifiedOAuthAccount.id
    );

    await assert.rejects(
      signInWithOAuthProfile({
        provider: "github",
        providerAccountId: "not-numeric",
        email: "numeric-check@example.com",
        emailVerified: true,
        name: "Invalid GitHub Subject"
      }),
      /must be numeric/
    );

    const otherIdentityAccount = await signInWithOAuthProfile({
      provider: "google",
      providerAccountId: "google-other",
      email: "other@example.com",
      emailVerified: true,
      name: "Other Identity"
    });
    const multipleMatchState = await loadState();
    const identityBoundTemplate = multipleMatchState.accounts.find(
      (account) => account.id === otherIdentityAccount.id
    );
    assert.ok(identityBoundTemplate);
    multipleMatchState.accounts.unshift({
      ...identityBoundTemplate,
      id: "identityless-same-email-shadow",
      name: "Identityless Shadow"
    });
    await saveState(multipleMatchState);
    await assert.rejects(
      signInWithOAuthProfile({
        provider: "github",
        providerAccountId: "1001",
        email: "other@example.com",
        emailVerified: true,
        name: "Unsafe First Link"
      }),
      /already linked to another account/
    );

    const googleIdentityAccount = await signInWithOAuthProfile({
      provider: "google",
      providerAccountId: "google-stable",
      email: "google-original@example.com",
      emailVerified: true,
      name: "Google Identity"
    });
    const googleEmailAccount = await signInForDevelopment({ email: "google-owner@example.com" });
    const googleSignIn = await signInWithOAuthProfile({
      provider: "google",
      providerAccountId: "google-stable",
      email: "google-owner@example.com",
      emailVerified: true,
      name: "Updated Google Identity"
    });
    assert.equal(googleSignIn.id, googleIdentityAccount.id);
    assert.ok((await loadState()).accounts.some((account) => account.id === googleEmailAccount.id));

    const identityEmailConflictState = await loadState();
    const identityEmailConflictAccount = identityEmailConflictState.accounts.find(
      (account) => account.id === otherIdentityAccount.id
    );
    assert.ok(identityEmailConflictAccount);
    identityEmailConflictAccount.email = "renamed-account@example.com";
    await saveState(identityEmailConflictState);

    const ambiguousEmailState = await loadState();
    ambiguousEmailState.accounts.unshift(
      {
        ...identityBoundTemplate,
        id: "ambiguous-email-account-1",
        email: "ambiguous@example.com",
        name: "Ambiguous One"
      },
      {
        ...identityBoundTemplate,
        id: "ambiguous-email-account-2",
        email: "ambiguous@example.com",
        name: "Ambiguous Two"
      }
    );
    await saveState(ambiguousEmailState);
    await assert.rejects(
      signInWithOAuthProfile({
        provider: "github",
        providerAccountId: "2002",
        email: "ambiguous@example.com",
        emailVerified: true,
        name: "Ambiguous GitHub"
      }),
      /matches multiple accounts/
    );

    await assert.rejects(
      signInWithOAuthProfile({
        provider: "github",
        providerAccountId: "45992437",
        email: "other@example.com",
        emailVerified: true,
        name: "Unsafe Relink"
      }),
      /already linked to another account/
    );
    const afterConflict = await loadState();
    assert.equal(
      afterConflict.accounts.find((account) => account.id === identityAccount.id)?.email,
      "owner@example.com"
    );
    assert.ok(afterConflict.accounts.some((account) => account.id === otherIdentityAccount.id));
  } finally {
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    if (previousDatabaseUrl === undefined) delete process.env.HARHUB_DATABASE_URL;
    else process.env.HARHUB_DATABASE_URL = previousDatabaseUrl;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
