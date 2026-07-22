import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";

interface Workflow {
  jobs?: Record<string, {
    needs?: string | string[];
    uses?: string;
    steps?: Array<{ run?: string }>;
  }>;
}

test("runs the full quality gate before building a deployable image", () => {
  const ci = readWorkflow("ci.yml");
  const qualityCommands = ci.jobs?.quality?.steps
    ?.flatMap((step) => step.run ? [step.run] : []) ?? [];
  assert.deepEqual(qualityCommands, [
    "npm ci",
    "npm run check",
    "npm test",
    "npm run build"
  ]);

  const deployment = readWorkflow("build-docker-image.yml");
  assert.equal(deployment.jobs?.quality?.uses, "./.github/workflows/ci.yml");
  assert.equal(deployment.jobs?.build?.needs, "quality");
  assert.equal(deployment.jobs?.["deploy-dev"]?.needs, "build");
});

test("tests packages before publishing them to npm", () => {
  const publish = readWorkflow("publish-npm.yml");
  const commands = publish.jobs?.publish?.steps
    ?.flatMap((step) => step.run ? [step.run] : []) ?? [];
  assert.ok(commands.indexOf("npm test") > commands.indexOf("npm run check"));
  assert.ok(commands.indexOf("npm run build") > commands.indexOf("npm test"));
});

function readWorkflow(fileName: string): Workflow {
  return parseYaml(readFileSync(
    path.resolve(".github/workflows", fileName),
    "utf8"
  )) as Workflow;
}
