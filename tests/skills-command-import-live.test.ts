import assert from "node:assert/strict";
import test from "node:test";

import { importSkillsCommand } from "../src/server/services/skills-command-import.js";

const liveCases = process.env.HARHUB_RUN_LIVE_SKILLS_IMPORTS === "1" ? [
  {
    command: "npx skills add https://clawhub.ai/matrixy/skills/agent-browser-clawdbot",
    expected: ["agent-browser"]
  },
  {
    command: "npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices",
    expected: ["vercel-react-best-practices"]
  }
] : [];

for (const liveCase of liveCases) {
  test(`imports a live skills add source: ${liveCase.command}`, async () => {
    const result = await importSkillsCommand(liveCase.command);
    assert.deepEqual(result.candidates.map((candidate) => candidate.name), liveCase.expected);
    assert.ok(result.archive.byteLength > 0);
  });
}
