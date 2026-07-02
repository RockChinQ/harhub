import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import type { SkillRecord } from "../../shared/types.js";

const SKIPPED_PACKAGE_DIRS = new Set([
  ".git",
  ".harhub",
  "dist",
  "node_modules"
]);

export async function packageSkillDirectory(skill: SkillRecord): Promise<{
  buffer: Buffer;
  fileName: string;
  rootDir: string;
}> {
  const rootDir = path.dirname(skill.source.absolutePath);
  const rootName = path.basename(rootDir);
  const zip = new JSZip();

  addDirectory(zip, rootDir, rootName);

  return {
    buffer: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE"
    }),
    fileName: `${skill.name}.zip`,
    rootDir
  };
}

function addDirectory(zip: JSZip, dir: string, zipDir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    const zipPath = path.posix.join(zipDir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_PACKAGE_DIRS.has(entry.name)) {
        addDirectory(zip, absolutePath, zipPath);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    const stat = statSync(absolutePath);
    zip.file(zipPath, readFileSync(absolutePath), {
      date: stat.mtime
    });
  }
}
