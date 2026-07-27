import assert from "node:assert/strict";
import test from "node:test";
import { resolveGitHubEmail } from "../src/server/services/github-email.js";
import {
  buildGitHubOAuthProfile,
  OAuthEmailVerificationRequiredError
} from "../src/server/services/oauth.js";

test("uses a verified public email from the GitHub profile", () => {
  const resolved = resolveGitHubEmail(
    { id: 45992437, login: "user", email: " public@example.com " },
    []
  );

  assert.deepEqual(resolved, { email: "public@example.com", emailVerified: true });
});

test("uses the verified primary email when the GitHub profile is private", () => {
  const resolved = resolveGitHubEmail(
    { id: 45992437, login: "user", email: null },
    [
      { email: "secondary@example.com", primary: false, verified: true },
      { email: "primary@example.com", primary: true, verified: true }
    ]
  );

  assert.deepEqual(resolved, { email: "primary@example.com", emailVerified: true });
});

test("uses any verified email when GitHub returns no verified primary email", () => {
  const resolved = resolveGitHubEmail(
    { id: 45992437, login: "user", email: null },
    [
      { email: "unverified@example.com", primary: true, verified: false },
      { email: "verified@example.com", primary: false, verified: true }
    ]
  );

  assert.deepEqual(resolved, { email: "verified@example.com", emailVerified: true });
});

test("rejects GitHub login when no verified email is available", () => {
  assert.throws(
    () => resolveGitHubEmail(
      { id: 45992437, login: "User", email: null },
      []
    ),
    /verified email/i
  );
});

test("does not require a stable GitHub account ID when a verified email is available", () => {
  const resolved = resolveGitHubEmail(
    { login: "user", email: null },
    [{ email: "owner@example.com", primary: true, verified: true }]
  );
  assert.deepEqual(resolved, { email: "owner@example.com", emailVerified: true });
});

test("returns a pending email proof when GitHub cannot expose a verified email", () => {
  assert.throws(
    () => buildGitHubOAuthProfile(
      { id: 45992437, login: "private-user", name: "Private User", email: null },
      []
    ),
    (error: unknown) => {
      assert.ok(error instanceof OAuthEmailVerificationRequiredError);
      assert.deepEqual(error.proof, {
        provider: "github",
        providerAccountId: "45992437",
        name: "Private User"
      });
      return true;
    }
  );
});
