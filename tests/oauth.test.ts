import assert from "node:assert/strict";
import test from "node:test";
import { resolveGitHubEmail } from "../src/server/services/github-email.js";

test("uses a verified non-primary GitHub email when the primary email is unavailable", () => {
  const email = resolveGitHubEmail(
    { id: 123, login: "octocat", email: null },
    [
      { email: "primary@example.com", primary: true, verified: false },
      { email: "verified@example.com", primary: false, verified: true }
    ]
  );

  assert.equal(email, "verified@example.com");
});

test("uses a stable GitHub noreply email when the email API is unavailable", () => {
  const email = resolveGitHubEmail(
    { id: 123, login: "octocat", email: null },
    undefined
  );

  assert.equal(email, "123+octocat@users.noreply.github.com");
});

test("prefers the verified primary GitHub email", () => {
  const email = resolveGitHubEmail(
    { id: 123, login: "octocat", email: null },
    [
      { email: "verified@example.com", primary: false, verified: true },
      { email: "primary@example.com", primary: true, verified: true }
    ]
  );

  assert.equal(email, "primary@example.com");
});
