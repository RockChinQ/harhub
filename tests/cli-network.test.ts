import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import test from "node:test";
import { EnvHttpProxyAgent } from "undici";
import { waitForDeviceToken } from "../src/cli/commands/auth.js";
import {
  closeHarhubHttp,
  createEnvProxyDispatcher,
  fetchHarhub,
  HarhubNetworkError
} from "../src/cli/http.js";

test("configures the CLI dispatcher from lowercase proxy variables", async () => {
  const dispatcher = createEnvProxyDispatcher({
    https_proxy: "http://127.0.0.1:7890",
    no_proxy: "localhost"
  });
  assert.ok(dispatcher instanceof EnvHttpProxyAgent);
  await dispatcher.close();
  assert.equal(createEnvProxyDispatcher({}), undefined);
});

test("routes CLI fetch requests through the configured environment proxy", async () => {
  const target = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  const proxy = createConnectProxy();
  const originalEnvironment = {
    http_proxy: process.env.http_proxy,
    HTTP_PROXY: process.env.HTTP_PROXY,
    no_proxy: process.env.no_proxy,
    NO_PROXY: process.env.NO_PROXY
  };

  await Promise.all([listen(target), listen(proxy)]);
  const targetAddress = target.address();
  const proxyAddress = proxy.address();
  assert.ok(targetAddress && typeof targetAddress === "object");
  assert.ok(proxyAddress && typeof proxyAddress === "object");
  process.env.http_proxy = `http://127.0.0.1:${proxyAddress.port}`;
  delete process.env.HTTP_PROXY;
  process.env.no_proxy = "";
  delete process.env.NO_PROXY;

  try {
    const response = await fetchHarhub(
      `http://127.0.0.1:${targetAddress.port}/health`
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await closeHarhubHttp();
    restoreEnvironment(originalEnvironment);
    await Promise.all([close(target), close(proxy)]);
  }
});

test("retries a transient network failure while polling an approved device", async () => {
  let pollCount = 0;
  const messages: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...values: unknown[]) => messages.push(values.join(" "));

  try {
    const token = await waitForDeviceToken(
      "https://harhub.rcpd.cc",
      {
        device_code: "device-code",
        expires_in: 60,
        interval: 5
      },
      {
        wait: async () => undefined,
        poll: async () => {
          pollCount += 1;
          if (pollCount === 1) {
            const timeout = Object.assign(new Error("Connect Timeout Error"), {
              code: "UND_ERR_CONNECT_TIMEOUT"
            });
            throw new HarhubNetworkError(
              "https://harhub.rcpd.cc/api/oauth/token",
              new TypeError("fetch failed", { cause: timeout })
            );
          }
          return {
            access_token: "access-token",
            token_type: "Bearer" as const,
            scope: "harhub:cli"
          };
        }
      }
    );

    assert.equal(token, "access-token");
    assert.equal(pollCount, 2);
    assert.match(messages[0] ?? "", /UND_ERR_CONNECT_TIMEOUT/);
    assert.match(messages[0] ?? "", /Retrying device authorization/);
  } finally {
    console.error = originalConsoleError;
  }
});

function createConnectProxy(): Server {
  const proxy = createServer();
  proxy.on("connect", (request, clientSocket, head) => {
    const [hostname, portText] = (request.url ?? "").split(":");
    const port = Number(portText);
    const serverSocket = connect(port, hostname, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    serverSocket.on("error", () => clientSocket.destroy());
  });
  return proxy;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

function restoreEnvironment(environment: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
