import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

test("completes the OAuth device authorization grant", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-device-flow-"));
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  const { createServerApp } = await import("../src/server/app.js");
  const server = createServerApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const metadataResponse = await fetch(
      `${baseUrl}/.well-known/oauth-authorization-server`
    );
    const metadata = await metadataResponse.json();
    assert.equal(metadata.device_authorization_endpoint, `${baseUrl}/api/oauth/device/code`);
    assert.equal(metadata.token_endpoint, `${baseUrl}/api/oauth/token`);

    const authorizationResponse = await fetch(`${baseUrl}/api/oauth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "harhub-cli",
        scope: "harhub:cli"
      })
    });
    assert.equal(authorizationResponse.status, 200);
    const authorization = await authorizationResponse.json();
    assert.match(authorization.user_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(authorization.interval, 5);

    const pendingResponse = await pollToken(baseUrl, authorization.device_code);
    assert.equal(pendingResponse.status, 400);
    assert.equal((await pendingResponse.json()).error, "authorization_pending");

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@harhub.local", password: "harhub" })
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();

    const approveResponse = await fetch(`${baseUrl}/api/oauth/device/authorization`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${login.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userCode: authorization.user_code,
        action: "approve"
      })
    });
    assert.equal(approveResponse.status, 200);
    assert.equal((await approveResponse.json()).status, "approved");

    const tokenResponse = await pollToken(baseUrl, authorization.device_code);
    assert.equal(tokenResponse.status, 200);
    const token = await tokenResponse.json();
    assert.equal(token.token_type, "Bearer");
    assert.equal(token.scope, "harhub:cli");
    assert.equal(typeof token.access_token, "string");

    const sessionResponse = await fetch(`${baseUrl}/api/session`, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    assert.equal(sessionResponse.status, 200);
    const session = await sessionResponse.json();
    assert.equal(session.account.email, "admin@harhub.local");
    assert.equal(session.workspaces[0].id, "ws_demo");

    const reusedResponse = await pollToken(baseUrl, authorization.device_code);
    assert.equal(reusedResponse.status, 400);
    assert.equal((await reusedResponse.json()).error, "invalid_grant");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    rmSync(temporaryDirectory, { recursive: true, force: true });
    delete process.env.HARHUB_STATE;
  }
});

function pollToken(baseUrl: string, deviceCode: string): Promise<Response> {
  return fetch(`${baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: "harhub-cli"
    })
  });
}
