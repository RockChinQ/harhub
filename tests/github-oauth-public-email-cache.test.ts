import assert from "node:assert/strict";
import test from "node:test";

test("uses a cache-busted public GitHub email when the OAuth profile is stale", async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.GITHUB_CLIENT_ID;
  const originalClientSecret = process.env.GITHUB_CLIENT_SECRET;
  process.env.GITHUB_CLIENT_ID = "github-client";
  process.env.GITHUB_CLIENT_SECRET = "github-secret";

  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === "https://github.com/login/oauth/access_token") {
      return Response.json({ access_token: "github-access-token" });
    }
    if (url === "https://api.github.com/user") {
      return Response.json({ id: 45992437, login: "RockChinQ", name: "Rock", email: null });
    }
    if (url === "https://api.github.com/user/emails") {
      return Response.json({ message: "Resource not accessible" }, { status: 403 });
    }
    if (url.startsWith("https://api.github.com/users/RockChinQ?")) {
      return Response.json({
        id: 45992437,
        login: "RockChinQ",
        name: "Rock",
        email: "rockchinq@gmail.com"
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const { exchangeOAuthCode } = await import("../src/server/services/oauth.js");
    const profile = await exchangeOAuthCode({
      provider: "github",
      code: "oauth-code",
      redirectUri: "https://harhub.rcpd.cc/api/auth/oauth/github/callback"
    });

    assert.equal(profile.email, "rockchinq@gmail.com");
    assert.equal(profile.emailVerified, true);
    assert.ok(requestedUrls.some((url) => url.startsWith("https://api.github.com/users/RockChinQ?")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.GITHUB_CLIENT_ID;
    else process.env.GITHUB_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
    else process.env.GITHUB_CLIENT_SECRET = originalClientSecret;
  }
});
