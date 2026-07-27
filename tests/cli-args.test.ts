import assert from "node:assert/strict";
import test from "node:test";

import { optionString, optionStrings, parseArgs } from "../src/cli/args.js";

test("maps conventional short options to Harhub long option names", () => {
  const parsed = parseArgs([
    "-ygjr",
    "-o",
    "skill.zip",
    "-w",
    "ws_demo",
    "-d=Updated description",
    "-a"
  ]);

  assert.equal(parsed.options.yes, true);
  assert.equal(parsed.options.global, true);
  assert.equal(parsed.options.json, true);
  assert.equal(parsed.options.remote, true);
  assert.equal(parsed.options.all, true);
  assert.equal(optionString(parsed, "output"), "skill.zip");
  assert.equal(optionString(parsed, "workspace"), "ws_demo");
  assert.equal(optionString(parsed, "description"), "Updated description");
});

test("does not consume positionals after boolean long options", () => {
  const parsed = parseArgs(["--remote", "demo-skill", "--yes", "next"]);

  assert.equal(parsed.options.remote, true);
  assert.equal(parsed.options.yes, true);
  assert.deepEqual(parsed.positionals, ["demo-skill", "next"]);
});

test("supports repeated long options, inline values, and the option terminator", () => {
  const parsed = parseArgs([
    "--asset",
    "one",
    "--asset=two",
    "--answer=Target?=CLI=automation",
    "--kind",
    "skill",
    "--",
    "--not-an-option",
    "-g"
  ]);

  assert.deepEqual(optionStrings(parsed, "asset"), ["one", "two"]);
  assert.equal(optionString(parsed, "answer"), "Target?=CLI=automation");
  assert.equal(optionString(parsed, "kind"), "skill");
  assert.deepEqual(parsed.positionals, ["--not-an-option", "-g"]);
});

test("rejects unknown short options instead of silently treating them as positionals", () => {
  assert.throws(() => parseArgs(["-z"]), /Unknown short option: -z/);
});
