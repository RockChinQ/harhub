import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimitMiddleware, type RateLimitClock } from "../src/server/middleware/rate-limit.js";
import type { Request, Response } from "express";

function responseRecorder() {
  let statusCode = 200;
  let payload: unknown;
  const headers = new Map<string, string>();
  return {
    response: {
      setHeader(name: string, value: string | number) {
        headers.set(name.toLowerCase(), String(value));
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        payload = value;
        return this;
      }
    },
    result: () => ({ statusCode, payload, headers })
  };
}

function invoke(middleware: ReturnType<typeof createRateLimitMiddleware>, ip: string) {
  const recorder = responseRecorder();
  let continued = false;
  middleware({ ip } as Request, recorder.response as Response, () => { continued = true; });
  return { continued, ...recorder.result() };
}

test("rate limiter blocks a client after the configured request budget", () => {
  let now = 1_000;
  const clock: RateLimitClock = { now: () => now };
  const middleware = createRateLimitMiddleware({
    windowMs: 60_000,
    max: 2,
    clock,
    key: (request: Pick<Request, "ip">) => request.ip
  });

  assert.equal(invoke(middleware, "203.0.113.8").continued, true);
  assert.equal(invoke(middleware, "203.0.113.8").continued, true);

  const blocked = invoke(middleware, "203.0.113.8");
  assert.equal(blocked.continued, false);
  assert.equal(blocked.statusCode, 429);
  assert.deepEqual(blocked.payload, {
    error: "Too many requests. Try again later.",
    code: "rate_limit_exceeded"
  });
  assert.equal(blocked.headers.get("retry-after"), "60");

  now += 60_000;
  assert.equal(invoke(middleware, "203.0.113.8").continued, true);
});

test("rate limiter keeps independent budgets per client key", () => {
  const middleware = createRateLimitMiddleware({
    windowMs: 60_000,
    max: 1,
    key: (request: Pick<Request, "ip">) => request.ip
  });

  assert.equal(invoke(middleware, "198.51.100.1").continued, true);
  assert.equal(invoke(middleware, "198.51.100.2").continued, true);
});

test("rate limiter bounds distinct client keys without evicting active budgets", () => {
  let now = 1_000;
  const clock: RateLimitClock = { now: () => now };
  const middleware = createRateLimitMiddleware({
    windowMs: 60_000,
    max: 1,
    maxKeys: 2,
    clock,
    key: (request: Pick<Request, "ip">) => request.ip
  });

  assert.equal(invoke(middleware, "198.51.100.1").continued, true);
  assert.equal(invoke(middleware, "198.51.100.2").continued, true);
  assert.equal(invoke(middleware, "198.51.100.3").continued, true);
  assert.equal(invoke(middleware, "198.51.100.4").statusCode, 429);
  assert.equal(invoke(middleware, "198.51.100.1").statusCode, 429);

  now += 60_000;
  assert.equal(invoke(middleware, "198.51.100.3").continued, true);
  assert.equal(invoke(middleware, "198.51.100.4").continued, true);
  assert.equal(invoke(middleware, "198.51.100.5").continued, true);
  assert.equal(invoke(middleware, "198.51.100.6").statusCode, 429);
});
