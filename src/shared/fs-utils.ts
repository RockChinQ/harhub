import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([
  ".git",
  ".harhub",
  "dist",
  "node_modules",
  ".next",
  ".turbo",
  "coverage"
]);

export function resolveFromCwd(value: string): string {
  return path.resolve(process.cwd(), value);
}

export function ensureArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function findSkillMarkdownFiles(root: string): string[] {
  const results: string[] = [];

  function visit(current: string): void {
    const entries = readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          visit(path.join(current, entry.name));
        }
        continue;
      }

      if (entry.isFile() && entry.name === "SKILL.md") {
        results.push(path.join(current, entry.name));
      }
    }
  }

  if (existsSync(root) && statSync(root).isDirectory()) {
    visit(root);
  }

  return results.sort();
}

export interface GitInfo {
  root?: string;
  repository?: string;
  branch?: string;
  commit?: string;
}

export function getGitInfo(root: string): GitInfo {
  function run(args: string[]): string | undefined {
    try {
      return execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
    } catch {
      return undefined;
    }
  }

  return {
    root: run(["rev-parse", "--show-toplevel"]),
    repository: run(["remote", "get-url", "origin"]),
    branch: run(["branch", "--show-current"]),
    commit: run(["rev-parse", "HEAD"])
  };
}

export function pathRelativeToRoot(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}
