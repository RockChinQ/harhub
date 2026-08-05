import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RateLimitClock {
  now(): number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  key?: (request: Pick<Request, "ip">) => string | undefined;
  clock?: RateLimitClock;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1) {
    throw new Error("Rate-limit windowMs must be a positive integer.");
  }
  if (!Number.isSafeInteger(options.max) || options.max < 1) {
    throw new Error("Rate-limit max must be a positive integer.");
  }

  const entries = new Map<string, RateLimitEntry>();
  const clock = options.clock ?? { now: () => Date.now() };
  const readKey = options.key ?? ((request) => request.ip);

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = clock.now();
    const key = readKey(request) ?? "unknown";
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      entries.set(key, entry);
    }

    if (entry.count >= options.max) {
      response.setHeader("Retry-After", Math.max(1, Math.ceil((entry.resetAt - now) / 1000)));
      response.status(429).json({
        error: "Too many requests. Try again later.",
        code: "rate_limit_exceeded"
      });
      return;
    }

    entry.count += 1;
    next();
  };
}
