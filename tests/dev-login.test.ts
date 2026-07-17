import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("allows passwordless account login only in development mode", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-dev-login-"));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.NODE_ENV = "development";
  process.env.HARHUB_STATE = path.join(temporaryDirectory, "state.json");
  let server: Server | undefined;

  try {
    const { createServerApp } = await import("../src/server/app.js");
    server = createServerApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const configResponse = await fetch(`${baseUrl}/api/auth/config`);
    assert.equal(configResponse.status, 200);
    assert.equal((await configResponse.json()).developmentLogin, true);

    const loginResponse = await fetch(`${baseUrl}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "developer@example.com" })
    });
    assert.equal(loginResponse.status, 200);
    assert.match(loginResponse.headers.get("cache-control") ?? "", /no-store/);
    const login = await loginResponse.json();
    assert.equal(login.account.email, "developer@example.com");
    assert.equal(login.workspaces.length, 1);

    const sessionResponse = await fetch(`${baseUrl}/api/session`, {
      headers: { Authorization: `Bearer ${login.token}` }
    });
    assert.equal(sessionResponse.status, 200);
    assert.equal((await sessionResponse.json()).account.email, "developer@example.com");
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server?.close((error) => error ? reject(error) : resolve())
      );
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousStatePath === undefined) delete process.env.HARHUB_STATE;
    else process.env.HARHUB_STATE = previousStatePath;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
