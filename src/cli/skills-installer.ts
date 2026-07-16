import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

import { validateSkillArchive } from "../features/skills/index.js";

export interface SkillsInstallOptions {
  agents?: string[];
  global?: boolean;
  copy?: boolean;
  yes?: boolean;
  all?: boolean;
  json?: boolean;
  cwd?: string;
}

export interface SkillsInstallResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function extractSkillArchive(buffer: Buffer, directory: string): Promise<void> {
  const archive = await validateSkillArchive(buffer);
  const zip = await JSZip.loadAsync(archive.buffer, { checkCRC32: true });
  const root = path.resolve(directory);

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const destination = path.resolve(root, ...entry.name.split("/"));
    if (destination !== root && !destination.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Skill zip contains an unsafe path: ${entry.name}`);
    }
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, await entry.async("nodebuffer"), { flag: "wx" });
  }
}

export async function installSkillDirectory(
  sourceDirectory: string,
  options: SkillsInstallOptions = {}
): Promise<SkillsInstallResult> {
  const cliPath = createRequire(import.meta.url).resolve("skills/bin/cli.mjs");
  const args = buildSkillsCliArgs(sourceDirectory, options);
  const captureOutput = options.json === true;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options.cwd ?? process.cwd(),
      env: process.env,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

export function buildSkillsCliArgs(
  sourceDirectory: string,
  options: SkillsInstallOptions
): string[] {
  const args = ["add", sourceDirectory];
  for (const agent of options.agents ?? []) args.push("--agent", agent);
  if (options.global) args.push("--global");
  if (options.copy) args.push("--copy");
  if (options.all) args.push("--all");
  if (options.yes || options.json) args.push("--yes");
  return args;
}
