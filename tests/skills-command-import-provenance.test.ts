import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import JSZip from "jszip";

import { importSkillsCommand, provenanceUrl } from "../src/server/services/skills-command-import.js";

async function skillArchive(name: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("SKILL.md", `---\nname: ${name}\ndescription: Demo.\n---\n`);
  return zip.generateAsync({ type: "nodebuffer" });
}

test("removes query strings, fragments, and userinfo from persisted provenance URLs", () => {
  assert.equal(
    provenanceUrl("https://user:secret@example.com/skills.zip?download=1#section"),
    "https://example.com/skills.zip"
  );
});

test("preserves well-known source provenance and verified artifact evidence", async () => {
  const archive = await skillArchive("demo-skill");
  const digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
  const source = "https://example.com/skills/demo-skill";
  const indexUrl = `${source}/.well-known/agent-skills/index.json`;
  const artifactUrl = "https://cdn.example.com/demo-skill.zip";
  const result = await importSkillsCommand(`npx skills add ${source}`, {
    fetchRemote: async (url) => {
      if (url === indexUrl) {
        return {
          body: Buffer.from(JSON.stringify({
            $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
            skills: [{
              name: "demo-skill",
              type: "archive",
              description: "Demo.",
              url: artifactUrl,
              digest
            }]
          })),
          contentType: "application/json",
          finalUrl: url
        };
      }
      if (url === artifactUrl) return { body: archive, contentType: "application/zip", finalUrl: url };
      throw new Error(`not found: ${url}`);
    }
  });

  assert.deepEqual(result.command, { source, skills: [], fullDepth: false });
  assert.equal(result.candidates[0]?.name, "demo-skill");
  assert.equal(result.source.type, "well-known");
  assert.equal(result.source.canonicalSource, indexUrl);
  assert.match(result.source.resolvedContentDigest ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.resolvedSkills[0]?.source, source);
  assert.equal(result.resolvedSkills[0]?.sourceType, "well-known");
  assert.equal(result.resolvedSkills[0]?.skillPath, `${indexUrl}#demo-skill`);
  assert.match(result.resolvedSkills[0]?.computedHash ?? "", /^[a-f0-9]{64}$/);
});

test("rejects a well-known artifact whose bytes do not match its declared digest", async () => {
  const archive = await skillArchive("demo-skill");
  const source = "https://example.com/skills/demo-skill";
  await assert.rejects(
    importSkillsCommand(`npx skills add ${source}`, {
      fetchRemote: async (url) => url.endsWith("index.json")
        ? {
            body: Buffer.from(JSON.stringify({
              $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
              skills: [{ name: "demo-skill", type: "archive", description: "Demo.", url: "https://cdn.example.com/demo.zip", digest: `sha256:${"0".repeat(64)}` }]
            })),
            contentType: "application/json",
            finalUrl: url
          }
        : { body: archive, contentType: "application/zip", finalUrl: url }
    }),
    /Digest mismatch/
  );
});
