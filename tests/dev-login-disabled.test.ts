import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("does not expose development login in production mode", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-prod-login-"));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStatePath = process.env.HARHUB_STATE;
  process.env.NODE_ENV = "production";
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
    assert.equal((await configResponse.json()).developmentLogin, false);

    const loginResponse = await fetch(`${baseUrl}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@harhub.local" })
    });
    assert.equal(loginResponse.status, 404);
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
