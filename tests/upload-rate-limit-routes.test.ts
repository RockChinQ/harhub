import assert from "node:assert/strict";
import test from "node:test";

import { createServerApp } from "../src/server/app.js";

function mountedMiddlewarePaths() {
  const app = createServerApp();
  return (app as unknown as { _router: { stack: Array<{ name?: string; regexp?: RegExp }> } })._router.stack
    .filter((layer: { name?: string }) => layer.name === "<anonymous>")
    .map((layer: { regexp?: RegExp }) => String(layer.regexp));
}

test("upload rate limiter covers Project sync archives", () => {
  const mounted = mountedMiddlewarePaths();
  assert.ok(mounted.some((pattern: string) => pattern.includes("projects") && pattern.includes("sync")));
});
