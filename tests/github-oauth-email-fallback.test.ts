import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("GitHub callback requests email-code verification when the emails API is unavailable", async (context) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "harhub-github-oauth-fallback-"));
  const previousEnvironment = {
    HARHUB_STATE: process.env.HARHUB_STATE,
    HARHUB_DATABASE_URL: process.env.HARHUB_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    HARHUB_EMAIL_FROM: process.env.HARHUB_EMAIL_FROM,
    HARHUB_PUBLIC_URL: process.env.HARHUB_PUBLIC_URL
  };
  process.env.HARHUB_STATE = path.join(directory, "state.json");
  delete process.env.HARHUB_DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.HARHUB_PUBLIC_URL;
  process.env.GITHUB_CLIENT_ID = "github-client";
  process.env.GITHUB_CLIENT_SECRET = "github-secret";
  process.env.RESEND_API_KEY = "resend-test-key";
  process.env.HARHUB_EMAIL_FROM = "Harhub Test <test@example.com>";

  const originalFetch = globalThis.fetch;
  context.mock.method(globalThis, "fetch", async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://github.com/login/oauth/access_token") {
      return new Response(JSON.stringify({ access_token: "github-user-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url === "https://api.github.com/user") {
      return new Response(
        JSON.stringify({ id: 45992437, login: "private-user", name: "Private User", email: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url === "https://api.github.com/user/emails") {
      return new Response(JSON.stringify({ message: "Resource not accessible by integration" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }
    return originalFetch(input, init);
  });

  let server: Server | undefined;
  try {
    const { createServerApp } = await import(`../src/server/app.js?oauth-fallback=${Date.now()}`);
    const state = await import(`../src/state/index.js?oauth-fallback=${Date.now()}`);
    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const startResponse = await originalFetch(`${baseUrl}/api/auth/oauth/github/start`, {
      redirect: "manual"
    });
    assert.equal(startResponse.status, 302);
    const authorizationUrl = new URL(startResponse.headers.get("location")!);
    const stateValue = authorizationUrl.searchParams.get("state");
    assert.ok(stateValue);

    const callbackResponse = await originalFetch(
      `${baseUrl}/api/auth/oauth/github/callback?state=${encodeURIComponent(stateValue)}&code=oauth-code`
    );
    const html = await callbackResponse.text();
    assert.equal(callbackResponse.status, 200);
    assert.match(html, /harhub\.oauth_email_verification/);
    assert.doesNotMatch(html, /harhub\.auth_error.*verified email/i);

    const snapshot = await state.loadState();
    assert.equal(snapshot.oauthEmailVerifications.length, 1);
    assert.equal(snapshot.oauthEmailVerifications[0]?.providerAccountId, "45992437");
    assert.equal(snapshot.identities.length, 0);
  } finally {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
