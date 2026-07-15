import assert from "node:assert/strict";
import test from "node:test";
import { resolveGitHubEmail } from "../src/server/services/github-email.js";

test("uses the public email from the GitHub profile", () => {
  const email = resolveGitHubEmail({ email: " public@example.com " });

  assert.equal(email, "public@example.com");
});

test("rejects GitHub sign-in when the public email is unavailable", () => {
  assert.throws(
    () => resolveGitHubEmail({ email: null }),
    /GitHub sign-in requires a public email/
  );
});

test("rejects a blank GitHub public email", () => {
  assert.throws(
    () => resolveGitHubEmail({ email: "   " }),
    /GitHub sign-in requires a public email/
  );
});
