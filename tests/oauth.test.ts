import assert from "node:assert/strict";
import test from "node:test";
import { resolveGitHubEmail } from "../src/server/services/github-email.js";

test("uses a verified public email from the GitHub profile", () => {
  const resolved = resolveGitHubEmail(
    { id: 45992437, login: "user", email: " public@example.com " },
    [{ email: "public@example.com", verified: true }]
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

test("uses a deterministic unverified noreply address when GitHub email lookup is unavailable", () => {
  const resolved = resolveGitHubEmail(
    { id: 45992437, login: "User", email: "public@example.com" },
    []
  );

  assert.deepEqual(resolved, {
    email: "45992437+user@users.noreply.github.com",
    emailVerified: false
  });
});

test("requires the stable GitHub account ID for a fallback address", () => {
  assert.throws(
    () => resolveGitHubEmail({ login: "user", email: null }, []),
    /stable account ID/
  );
});
