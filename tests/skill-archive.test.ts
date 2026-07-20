import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";

import {
  canonicalSkillFilesChecksumForStorage,
  discoverSkillsInArchive,
  legacySkillFilesChecksum,
  packageSkillDirectory,
  packageSkillFiles,
  scanSkills,
  SKILL_FILES_CHECKSUM_ALGORITHM,
  skillFilesChecksum,
  validateSkillArchive
} from "../src/features/skills/index.js";
import { contentHash } from "../src/shared/markdown.js";

test("discovers multiple Skills at arbitrary nested paths", async () => {
  const zip = new JSZip();
  zip.file("repo-main/skills/alpha/SKILL.md", validSkillMarkdown("alpha"));
  zip.file("repo-main/skills/alpha/scripts/run.sh", "#!/bin/sh\necho alpha\n");
  zip.file("repo-main/packages/deep/beta/SKILL.md", validSkillMarkdown("beta"));
  zip.file("repo-main/packages/deep/beta/references/guide.md", "# Beta guide\n");
  zip.file("repo-main/README.md", "# Repository\n");

  const candidates = await discoverSkillsInArchive(await zip.generateAsync({ type: "nodebuffer" }));
  assert.deepEqual(candidates.map((candidate) => candidate.name), ["beta", "alpha"]);
  assert.deepEqual(
    candidates.find((candidate) => candidate.name === "alpha")?.files.map((file) => file.path),
    ["scripts/run.sh", "SKILL.md"]
  );
  assert.deepEqual(
    candidates.find((candidate) => candidate.name === "beta")?.files.map((file) => file.path),
    ["references/guide.md", "SKILL.md"]
  );
});

test("does not use a section heading as the Skill display name", async () => {
  const zip = new JSZip();
  zip.file(
    "product-discovery/SKILL.md",
    `---\nname: product-discovery\ndescription: Discover product opportunities.\n---\n\n## Purpose\n\nUnderstand the customer problem.\n`
  );

  const candidates = await discoverSkillsInArchive(await zip.generateAsync({ type: "nodebuffer" }));

  assert.equal(candidates[0]?.displayName, "Product Discovery");
});

test("keeps a nested Skill out of its parent Skill file tree", async () => {
  const zip = new JSZip();
  zip.file("SKILL.md", validSkillMarkdown("parent"));
  zip.file("references/parent.md", "# Parent\n");
  zip.file("embedded/child/SKILL.md", validSkillMarkdown("child"));
  zip.file("embedded/child/script.js", "console.log('child')\n");

  const candidates = await discoverSkillsInArchive(await zip.generateAsync({ type: "nodebuffer" }));
  const parent = candidates.find((candidate) => candidate.name === "parent");
  const child = candidates.find((candidate) => candidate.name === "child");
  assert.deepEqual(parent?.files.map((file) => file.path), ["references/parent.md", "SKILL.md"]);
  assert.deepEqual(child?.files.map((file) => file.path), ["script.js", "SKILL.md"]);
});

test("packages separated files as a deterministic standard root archive", async () => {
  const files = [
    { path: "scripts/run.sh", content: Buffer.from("#!/bin/sh\necho ok\n") },
    { path: "SKILL.md", content: Buffer.from(validSkillMarkdown("demo-skill")) }
  ];
  const first = await packageSkillFiles(files);
  const second = await packageSkillFiles(files.slice().reverse());
  assert.deepEqual(first.buffer, second.buffer);
  assert.equal(first.checksum, contentHash(first.buffer));

  const validated = await validateSkillArchive(first.buffer);
  assert.equal(validated.checksum, first.checksum);
  const zip = await JSZip.loadAsync(first.buffer);
  assert.ok(zip.file("SKILL.md"));
  assert.ok(zip.file("scripts/run.sh"));
  assert.equal(zip.file("demo-skill/SKILL.md"), null);
});

test("uses a strict canonical order for collation-equivalent Unicode paths", () => {
  const files = [
    { path: "SKILL.md", content: Buffer.from(validSkillMarkdown("unicode-order")) },
    { path: "é.txt", content: Buffer.from("precomposed") },
    { path: "e\u0301.txt", content: Buffer.from("decomposed") }
  ];

  assert.equal(skillFilesChecksum(files), skillFilesChecksum(files.slice().reverse()));
});

test("migrates an unversioned checksum produced by a different runtime locale", () => {
  const files = [
    { path: "SKILL.md", content: Buffer.from("skill") },
    { path: "z.txt", content: Buffer.from("z") },
    { path: "ä.txt", content: Buffer.from("a-umlaut") },
    { path: "å.txt", content: Buffer.from("a-ring") }
  ];
  const script = `
    import { legacySkillFilesChecksum } from "./src/features/skills/archive.ts";

    const files = [
      { path: "SKILL.md", content: Buffer.from("skill") },
      { path: "z.txt", content: Buffer.from("z") },
      { path: "ä.txt", content: Buffer.from("a-umlaut") },
      { path: "å.txt", content: Buffer.from("a-ring") }
    ];
    console.log(JSON.stringify({
      locale: new Intl.Collator().resolvedOptions().locale,
      legacy: legacySkillFilesChecksum(files),
      differsFromEnglish: legacySkillFilesChecksum(files) !== legacySkillFilesChecksum(files, "en")
    }));
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, LANG: "sv_SE.UTF-8", LC_ALL: "sv_SE.UTF-8" }
    }
  );

  assert.equal(child.status, 0, child.stderr);
  const legacy = JSON.parse(child.stdout) as {
    locale: string;
    legacy: string;
    differsFromEnglish: boolean;
  };
  const canonical = skillFilesChecksum(files);
  assert.equal(legacy.locale, "sv-SE");
  assert.equal(legacy.differsFromEnglish, true);
  assert.notEqual(legacy.legacy, canonical);
  assert.notEqual(legacy.legacy, legacySkillFilesChecksum(files, "en"));
  assert.equal(
    canonicalSkillFilesChecksumForStorage(files, { checksum: legacy.legacy }),
    canonical
  );
});

test("migrates a legacy checksum when collation-tied paths arrive in a different order", () => {
  const skill = { path: "SKILL.md", content: Buffer.from("skill") };
  const precomposed = { path: "é.txt", content: Buffer.from("precomposed") };
  const decomposed = { path: "e\u0301.txt", content: Buffer.from("decomposed") };
  const producerFiles = [skill, precomposed, decomposed];
  const retrievedFiles = [skill, decomposed, precomposed];
  const legacy = legacySkillFilesChecksum(producerFiles, "en");
  const canonical = skillFilesChecksum(retrievedFiles);

  assert.equal(precomposed.path.localeCompare(decomposed.path, "en"), 0);
  assert.notEqual(legacy, legacySkillFilesChecksum(retrievedFiles, "en"));
  assert.equal(
    canonicalSkillFilesChecksumForStorage(retrievedFiles, { checksum: legacy }),
    canonical
  );
});

test("does not interpret a legacy checksum as the versioned canonical algorithm", () => {
  const files = [
    { path: "SKILL.md", content: Buffer.from(validSkillMarkdown("versioned-checksum")) },
    { path: "scripts/helper.js", content: Buffer.from("export const ready = true;\n") }
  ];
  const legacyManifest = files
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path, "en"))
    .map((file) => `${Buffer.byteLength(file.path)}:${file.path}:${file.content.byteLength}:${contentHash(file.content)}`)
    .join("\n");

  assert.equal(
    canonicalSkillFilesChecksumForStorage(files, {
      checksum: contentHash(legacyManifest),
      checksumAlgorithm: SKILL_FILES_CHECKSUM_ALGORITHM
    }),
    undefined
  );
});

test("rejects a public Skill archive with a wrapper directory", async () => {
  const zip = new JSZip();
  zip.file("demo-skill/SKILL.md", validSkillMarkdown("demo-skill"));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  await assert.rejects(validateSkillArchive(buffer), /SKILL.md file at the archive root/);
});

test("packages local Skills with SKILL.md at the archive root", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-package-skill-"));
  const skillDirectory = path.join(temporaryDirectory, "demo-skill");
  mkdirSync(path.join(skillDirectory, "references"), { recursive: true });
  writeFileSync(path.join(skillDirectory, "SKILL.md"), validSkillMarkdown("demo-skill"));
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

function validSkillMarkdown(name: string): string {
  return `---\nname: ${name}\ndescription: Demonstrates a standard Skill archive.\n---\n\n# ${name}\n`;
}
