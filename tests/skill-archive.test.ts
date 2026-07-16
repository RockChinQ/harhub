import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

import { packageSkillDirectory, scanSkills, validateSkillArchive } from "../src/features/skills/index.js";
import { contentHash } from "../src/shared/markdown.js";

test("accepts a Skill archive with SKILL.md at its root without rewriting it", async () => {
  const zip = new JSZip();
  zip.file("SKILL.md", validSkillMarkdown());
  zip.file("scripts/run.sh", "#!/bin/sh\necho ok\n");
  const original = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const validated = await validateSkillArchive(original);
  assert.equal(validated.checksum, contentHash(original));
  assert.deepEqual(validated.buffer, original);
});

test("rejects a Skill archive with a wrapper directory", async () => {
  const zip = new JSZip();
  zip.file("demo-skill/SKILL.md", validSkillMarkdown());
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  await assert.rejects(
    validateSkillArchive(buffer),
    /SKILL.md file at the archive root/
  );
});

test("packages local Skills with SKILL.md at the archive root", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-package-skill-"));
  const skillDirectory = path.join(temporaryDirectory, "demo-skill");
  mkdirSync(path.join(skillDirectory, "references"), { recursive: true });
  writeFileSync(path.join(skillDirectory, "SKILL.md"), validSkillMarkdown());
  writeFileSync(path.join(skillDirectory, "references", "GUIDE.md"), "# Guide\n");

  try {
    const skill = scanSkills({ roots: [skillDirectory] })[0];
    assert.ok(skill);
    const packaged = await packageSkillDirectory(skill);
    const zip = await JSZip.loadAsync(packaged.buffer);
    assert.ok(zip.file("SKILL.md"));
    assert.ok(zip.file("references/GUIDE.md"));
    assert.equal(zip.file("demo-skill/SKILL.md"), null);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

function validSkillMarkdown(): string {
  return `---\nname: demo-skill\ndescription: Demonstrates a standard Skill archive.\n---\n\n# Demo Skill\n`;
}
