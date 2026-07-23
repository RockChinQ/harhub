import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/cli/app.js";

async function capture(callback: () => Promise<number>): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => { lines.push(values.join(" ")); };
  try {
    return { code: await callback(), output: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

test("routes every remote management command group to its help", async () => {
  for (const group of ["assets", "skills", "projects", "repositories", "forge"]) {
    const result = await capture(() => runCli([group, "-h"]));
    assert.equal(result.code, 0, group);
    assert.match(result.output, new RegExp(`Harhub ${group === "repositories" ? "Repositories" : group[0].toUpperCase() + group.slice(1)}`));
  }
});

test("documents standalone download and conventional short options at the root", async () => {
  const result = await capture(() => runCli(["--help"]));
  assert.equal(result.code, 0);
  assert.match(result.output, /harhub download/);
  assert.match(result.output, /-y --yes/);
  assert.match(result.output, /harhub projects/);
  assert.match(result.output, /harhub forge/);
});

test("accepts short help after command-group subcommands and standalone download", async () => {
  const project = await capture(() => runCli(["projects", "create", "-h"]));
  assert.equal(project.code, 0);
  assert.match(project.output, /Harhub Projects/);

  const download = await capture(() => runCli(["download", "-h"]));
  assert.equal(download.code, 0);
  assert.match(download.output, /Harhub Download/);
});
