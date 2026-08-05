import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimitMiddleware, type RateLimitClock } from "../src/server/middleware/rate-limit.js";
import type { Request } from "express";

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

test("rate limiter blocks a client after the configured request budget", () => {
  let now = 1_000;
  const clock: RateLimitClock = { now: () => now };
  const middleware = createRateLimitMiddleware({
    windowMs: 60_000,
    max: 2,
    clock,
    key: (request: Pick<Request, "ip">) => request.ip
  });
  const request = { ip: "203.0.113.8" };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const recorder = responseRecorder();
    let continued = false;
    middleware(request, recorder.response, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(recorder.result().statusCode, 200);
  }

  const blocked = responseRecorder();
  let continued = false;
  middleware(request, blocked.response, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(blocked.result().statusCode, 429);
  assert.deepEqual(blocked.result().payload, {
    error: "Too many requests. Try again later.",
    code: "rate_limit_exceeded"
  });
  assert.equal(blocked.result().headers.get("retry-after"), "60");

  now += 60_000;
  const reset = responseRecorder();
  middleware(request, reset.response, () => { continued = true; });
  assert.equal(continued, true);
});

test("rate limiter keeps independent budgets per client key", () => {
  const middleware = createRateLimitMiddleware({
    windowMs: 60_000,
    max: 1,
    key: (request: Pick<Request, "ip">) => request.ip
  });

  for (const ip of ["198.51.100.1", "198.51.100.2"]) {
    const recorder = responseRecorder();
    let continued = false;
    middleware({ ip }, recorder.response, () => { continued = true; });
    assert.equal(continued, true);
  }
});
