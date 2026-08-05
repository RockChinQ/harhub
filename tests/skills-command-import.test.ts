import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import {
  importSkillsCommand,
  isPublicNetworkAddress,
  parseSkillsAddCommand
} from "../src/server/services/skills-command-import.js";

const commandExamples = [
  {
    command: "npx skills add https://clawhub.ai/matrixy/skills/agent-browser-clawdbot",
    source: "https://clawhub.ai/matrixy/skills/agent-browser-clawdbot",
    skills: []
  },
  {
    command: "npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices",
    source: "https://github.com/vercel-labs/agent-skills",
    skills: ["vercel-react-best-practices"]
  },
  {
    command: "npx -y skills@1.5.21 a github:vercel-labs/agent-skills -s frontend-design skill-creator --full-depth",
    source: "github:vercel-labs/agent-skills",
    skills: ["frontend-design", "skill-creator"]
  },
  {
    command: "pnpm dlx skills add 'owner/repo@Skill With Spaces' --copy --yes --agent codex cursor",
    source: "owner/repo@Skill With Spaces",
    skills: []
  },
  {
    command: "npx skills add owner/repo --metadata '{\"campaign\":\"harhub\"}'",
    source: "owner/repo",
    skills: []
  },
  {
    command: "bunx skills add https://github.com/acme/repo/tree/main/path/to/skill --all",
    source: "https://github.com/acme/repo/tree/main/path/to/skill",
    skills: ["*"]
  }
];

for (const example of commandExamples) {
  test(`parses supported skills add command: ${example.command}`, () => {
    const parsed = parseSkillsAddCommand(example.command);
    assert.equal(parsed.source, example.source);
    assert.deepEqual(parsed.skills, example.skills);
  });
}

test("accepts a bare source using skills add defaults", () => {
  assert.deepEqual(parseSkillsAddCommand("vercel-labs/agent-skills"), {
    source: "vercel-labs/agent-skills",
    skills: [],
    fullDepth: false
  });
});

test("rejects too many selected Skills", () => {
  const skills = Array.from({ length: 101 }, (_, index) => `skill-${index}`).join(" ");
  assert.throws(() => parseSkillsAddCommand(`npx skills add owner/repo --skill ${skills}`), /at most 100 Skills/);
});

test("rejects shell syntax and unsafe sources", () => {
  for (const command of [
    "x".repeat(8_193),
    "npx skills@latest add owner/repo",
    "npx skills remove demo",
    "npx skills add owner/repo && touch /tmp/pwned",
    "npx skills add $(touch /tmp/pwned)",
    "npx skills add owner/repo > /tmp/output",
    "npx skills add owner/repo --unknown-option value",
    "npx skills add owner/repo --metadata '{not-json}'",
    "npx skills add owner/repo --list",
    "npx skills add http://127.0.0.1/skill",
    "npx skills add https://[fd00::1]/skill",
    "npx skills add https://user:secret@example.com/skills.zip",
    "npx skills add https://example.com/skills.zip?token=secret",
    "npx skills add ./local-skills",
    "npx skills add git@github.com:private/repo.git"
  ]) assert.throws(() => parseSkillsAddCommand(command), command);
});

test("allows only globally routable network addresses", () => {
  for (const address of [
    "100.100.100.200",
    "198.18.0.1",
    "192.0.2.1",
    "2001:db8::1",
    "fec0::1",
    "::ffff:127.0.0.1"
  ]) assert.equal(isPublicNetworkAddress(address), false, address);
  assert.equal(isPublicNetworkAddress("8.8.8.8"), true);
  assert.equal(isPublicNetworkAddress("2606:4700:4700::1111"), true);
});

test("materializes nested GitLab namespaces against the correct immutable project", async () => {
  const commit = "c".repeat(40);
  const zip = new JSZip();
  zip.file(`repo-${commit}/skills/demo/SKILL.md`, "---\nname: demo\ndescription: Demo.\n---\n");
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  const urls: string[] = [];
  const imported = await importSkillsCommand(
    "npx skills add https://gitlab.com/group/subgroup/repo/-/tree/main/skills/demo",
    {
      fetchRemote: async (url) => {
        urls.push(url);
        return url.includes("/repository/commits/")
          ? { body: Buffer.from(JSON.stringify({ id: commit })), contentType: "application/json", finalUrl: url }
          : { body: archive, contentType: "application/zip", finalUrl: url };
      }
    }
  );
  assert.match(urls[0] ?? "", /projects\/group%2Fsubgroup%2Frepo\/repository\/commits\/main$/);
  assert.equal(imported.source.canonicalSource, `https://gitlab.com/group/subgroup/repo/-/tree/${commit}/skills/demo`);
  assert.equal(imported.candidates[0]?.name, "demo");
});

test("materializes GitHub through controlled fetches and pins an immutable commit", async () => {
  const commit = "a".repeat(40);
  const zip = new JSZip();
  zip.file(`agent-skills-${commit}/CLAUDE.md`, "README.md", { unixPermissions: 0o120777 });
  zip.file(
    `agent-skills-${commit}/skills/vercel-react-best-practices/SKILL.md`,
    "---\nname: vercel-react-best-practices\ndescription: React guidance.\n---\n"
  );
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  const urls: string[] = [];
  const imported = await importSkillsCommand(
    "npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices",
    {
      fetchRemote: async (url) => {
        urls.push(url);
        if (url.includes("api.github.com")) {
          return { body: Buffer.from(JSON.stringify({ sha: commit })), contentType: "application/json", finalUrl: url };
        }
        assert.equal(url, `https://github.com/vercel-labs/agent-skills/archive/${commit}.zip`);
        return { body: archive, contentType: "application/zip", finalUrl: url };
      }
    }
  );

  assert.equal(urls.length, 2);
  assert.equal(imported.candidates.length, 1);
  assert.equal(imported.candidates[0]?.name, "vercel-react-best-practices");
  assert.equal(imported.source.canonicalSource, `https://github.com/vercel-labs/agent-skills/tree/${commit}`);
  assert.equal(imported.resolvedSkills[0]?.ref, commit);
  assert.match(imported.source.resolvedContentDigest ?? "", /^sha256:[a-f0-9]{64}$/);
});

test("rejects repository zip bombs from declared size before inflating entries", async () => {
  const commit = "d".repeat(40);
  const zip = new JSZip();
  zip.file(`repo-${commit}/huge.bin`, Buffer.alloc(51 * 1024 * 1024));
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await assert.rejects(
    importSkillsCommand("npx skills add owner/repo", {
      fetchRemote: async (url) => url.includes("api.github.com")
        ? { body: Buffer.from(JSON.stringify({ sha: commit })), contentType: "application/json", finalUrl: url }
        : { body: archive, contentType: "application/zip", finalUrl: url }
    }),
    /extracted-size limit/
  );
});

test("requires an explicit selection when a source contains multiple Skills", async () => {
  const commit = "b".repeat(40);
  const zip = new JSZip();
  for (const name of ["alpha", "beta"]) {
    zip.file(`repo-${commit}/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${name}.\n---\n`);
  }
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(
    importSkillsCommand("npx skills add owner/repo", {
      fetchRemote: async (url) => url.includes("api.github.com")
        ? { body: Buffer.from(JSON.stringify({ sha: commit })), contentType: "application/json", finalUrl: url }
        : { body: archive, contentType: "application/zip", finalUrl: url }
    }),
    /use --skill <name> or --all/
  );
});
