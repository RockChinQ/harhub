import path from "node:path";

import { analyzeStoredSkillFiles, type SkillPackageFile } from "../skills/index.js";
import { contentHash, parseMarkdown } from "../../shared/markdown.js";
import type {
  AssetHealth,
  ProjectInventoryArtifact,
  ProjectInventoryArtifactFormat,
  SkillValidationSeverity
} from "../../shared/types.js";

export const REPOSITORY_DETECTOR_VERSION = "repository-harness-v2";
const MAX_CANDIDATE_BYTES = 1024 * 1024;
export const REPOSITORY_SKILL_EXCLUDED_DIRECTORIES = [
  ".cache",
  ".git",
  ".harhub",
  ".hg",
  ".next",
  ".nox",
  ".nuxt",
  ".output",
  ".svn",
  ".tox",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "site-packages",
  "target",
  "venv"
] as const;
const EXCLUDED_REPOSITORY_PATH_SEGMENTS: ReadonlySet<string> = new Set(
  REPOSITORY_SKILL_EXCLUDED_DIRECTORIES
);

export interface RepositorySourceFile {
  path: string;
  content: Buffer;
}

export interface RepositorySkillPackage {
  rootPath: string;
  skillPath: string;
  files: SkillPackageFile[];
}

export function detectRepositoryInventory(
  inputFiles: RepositorySourceFile[]
): ProjectInventoryArtifact[] {
  const files = normalizeFiles(inputFiles)
    .filter((file) => !isRepositoryInventoryPathExcluded(file.path));
  const skillPackages = discoverRepositorySkillPackages(files);
  const skillRoots = skillPackages.map((candidate) => candidate.rootPath);
  const artifacts = [
    ...detectSkills(skillPackages),
    ...files.flatMap((file) => detectSingleFile(file, skillRoots))
  ];
  return artifacts.sort((left, right) =>
    `${left.kind}\0${left.path}`.localeCompare(`${right.kind}\0${right.path}`)
  );
}

export function isRepositoryInventoryCandidate(pathValue: string): boolean {
  const candidate = normalizePath(pathValue);
  if (!candidate) return false;
  if (repositorySkillRoot(candidate) !== undefined) return true;
  if (isInstructionPath(candidate)) return true;
  if (ruleFormat(candidate)) return true;
  return Boolean(mcpFormat(candidate));
}

/**
 * Find standards-compliant Skill directory boundaries anywhere in a repository.
 * Nested Skills are returned separately and never become files of their parent.
 */
export function discoverRepositorySkillPackages(
  inputFiles: RepositorySourceFile[]
): RepositorySkillPackage[] {
  const files = normalizeFiles(inputFiles)
    .filter((file) => !isRepositoryInventoryPathExcluded(file.path));
  const roots = skillRootPaths(files);
  return roots.map((rootPath) => {
    const nestedRoots = roots.filter((candidate) =>
      candidate !== rootPath && isRepositoryPathWithinRoot(candidate, rootPath)
    );
    const skillFiles = files
      .filter((file) => isRepositoryPathWithinRoot(file.path, rootPath))
      .filter((file) => !nestedRoots.some((nested) => isRepositoryPathWithinRoot(file.path, nested)))
      .map((file) => ({
        path: relativeRepositorySkillPath(file.path, rootPath),
        content: file.content
      }));
    return {
      rootPath,
      skillPath: rootPath === "." ? "SKILL.md" : `${rootPath}/SKILL.md`,
      files: skillFiles
    };
  });
}

export function repositorySkillRoot(pathValue: string): string | undefined {
  const candidate = normalizePath(pathValue);
  if (!candidate || path.posix.basename(candidate) !== "SKILL.md") return undefined;
  if (isRepositoryInventoryPathExcluded(candidate)) return undefined;
  return path.posix.dirname(candidate);
}

export function isRepositoryInventoryPathExcluded(pathValue: string): boolean {
  const candidate = normalizePath(pathValue);
  if (!candidate) return true;
  return candidate.split("/").some((segment) => EXCLUDED_REPOSITORY_PATH_SEGMENTS.has(segment));
}

export function isRepositoryPathWithinRoot(pathValue: string, rootPath: string): boolean {
  return rootPath === "." || pathValue.startsWith(`${rootPath}/`);
}

export function repositorySkillSourcePath(rootPath: string, packagePath: string): string {
  return rootPath === "." ? packagePath : `${rootPath}/${packagePath}`;
}

function detectSkills(packages: RepositorySkillPackage[]): ProjectInventoryArtifact[] {
  return packages.map(({ rootPath: root, files: skillFiles }) => {
    const oversize = skillFiles.find((file) => file.content.byteLength > MAX_CANDIDATE_BYTES);
    if (oversize) {
      return invalidArtifact({
        kind: "skill",
        format: "agent-skill",
        path: root,
        name: path.posix.basename(root),
        message: `${oversize.path} exceeds the 1 MB repository inventory limit.`,
        size: skillFiles.reduce((total, file) => total + file.content.byteLength, 0),
        fileCount: skillFiles.length,
        digest: directoryDigest(skillFiles)
      });
    }

    try {
      const skill = analyzeStoredSkillFiles(skillFiles);
      return {
        id: artifactId("skill", root),
        kind: "skill",
        format: "agent-skill",
        path: root,
        name: skill.displayName,
        description: skill.description,
        digest: skill.checksum,
        fileCount: skill.fileCount,
        size: skill.size,
        health: skill.health,
        validation: skill.validation,
        issues: skill.validationIssues.map((issue) => ({
          severity: issue.severity,
          message: issue.message
        })),
        relationship: skill.validation.errors > 0 ? "blocked" : "review-required"
      };
    } catch (error) {
      return invalidArtifact({
        kind: "skill",
        format: "agent-skill",
        path: root,
        name: path.posix.basename(root),
        message: error instanceof Error ? error.message : String(error),
        size: skillFiles.reduce((total, file) => total + file.content.byteLength, 0),
        fileCount: skillFiles.length,
        digest: directoryDigest(skillFiles)
      });
    }
  });
}

function detectSingleFile(
  file: RepositorySourceFile,
  skillRoots: string[]
): ProjectInventoryArtifact[] {
  if (skillRoots.some((root) => isRepositoryPathWithinRoot(file.path, root))) {
    return [];
  }
  const instruction = instructionFormat(file.path);
  if (instruction) return [markdownArtifact(file, "instruction", instruction)];
  const rule = ruleFormat(file.path);
  if (rule) return [markdownArtifact(file, "rule", rule)];
  const mcp = mcpFormat(file.path);
  if (mcp) return [mcpArtifact(file, mcp)];
  return [];
}

function markdownArtifact(
  file: RepositorySourceFile,
  kind: "instruction" | "rule",
  format: ProjectInventoryArtifactFormat
): ProjectInventoryArtifact {
  const tooLarge = file.content.byteLength > MAX_CANDIDATE_BYTES;
  const text = tooLarge ? "" : file.content.toString("utf8");
  const parsed = parseMarkdown(text);
  const issues: Array<{ severity: SkillValidationSeverity; message: string }> = [];
  if (tooLarge) issues.push({ severity: "error", message: "File exceeds the 1 MB repository inventory limit." });
  else if (!text.trim()) issues.push({ severity: "error", message: "File is empty." });
  if (parsed.frontmatterError) issues.push({ severity: "warning", message: parsed.frontmatterError });
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return {
    id: artifactId(kind, file.path),
    kind,
    format,
    path: file.path,
    name: parsed.title ?? friendlyFileName(file.path),
    description: parsed.description || `${friendlyFileName(file.path)} repository harness instructions.`,
    digest: contentHash(file.content),
    fileCount: 1,
    size: file.content.byteLength,
    health: healthFromCounts(errors, warnings),
    validation: { errors, warnings },
    issues,
    relationship: errors > 0 ? "blocked" : "review-required"
  };
}

function mcpArtifact(
  file: RepositorySourceFile,
  format: ProjectInventoryArtifactFormat
): ProjectInventoryArtifact {
  const issues: Array<{ severity: SkillValidationSeverity; message: string }> = [];
  if (file.content.byteLength > MAX_CANDIDATE_BYTES) {
    issues.push({ severity: "error", message: "File exceeds the 1 MB repository inventory limit." });
  } else if (file.path.endsWith(".json")) {
    try {
      const value = JSON.parse(file.content.toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        issues.push({ severity: "error", message: "MCP configuration must be a JSON object." });
      }
    } catch {
      issues.push({ severity: "error", message: "MCP configuration is not valid JSON." });
    }
  }
  const errors = issues.length;
  return {
    id: artifactId("mcp", file.path),
    kind: "mcp",
    format,
    path: file.path,
    name: friendlyFileName(file.path),
    description: "Repository MCP configuration.",
    digest: contentHash(file.content),
    fileCount: 1,
    size: file.content.byteLength,
    health: errors ? "error" : "valid",
    validation: { errors, warnings: 0 },
    issues,
    relationship: errors ? "blocked" : "review-required"
  };
}

function normalizeFiles(files: RepositorySourceFile[]): RepositorySourceFile[] {
  const normalized = files.map((file) => ({
    path: normalizePath(file.path),
    content: file.content
  }));
  if (normalized.some((file) => !file.path)) throw new Error("Repository inventory contains an unsafe path.");
  const unique = new Map<string, RepositorySourceFile>();
  for (const file of normalized) {
    if (unique.has(file.path)) throw new Error(`Repository inventory contains duplicate path ${file.path}.`);
    unique.set(file.path, file);
  }
  return Array.from(unique.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function normalizePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) return "";
  return normalized;
}

function skillRootPaths(files: RepositorySourceFile[]): string[] {
  return files.flatMap((file) => {
    const root = repositorySkillRoot(file.path);
    return root === undefined ? [] : [root];
  });
}

function relativeRepositorySkillPath(filePath: string, rootPath: string): string {
  return rootPath === "." ? filePath : path.posix.relative(rootPath, filePath);
}

function isInstructionPath(value: string): boolean {
  return Boolean(instructionFormat(value));
}

function instructionFormat(value: string): ProjectInventoryArtifactFormat | undefined {
  if (/(^|\/)AGENTS\.md$/.test(value)) return "agents-instructions";
  if (/(^|\/)CLAUDE\.md$/.test(value)) return "claude-instructions";
  if (value === ".github/copilot-instructions.md" || /^\.github\/instructions\/.+\.instructions\.md$/.test(value)) {
    return "copilot-instructions";
  }
  return undefined;
}

function ruleFormat(value: string): ProjectInventoryArtifactFormat | undefined {
  if (/^\.harness\/rules\/.+/.test(value)) return "harhub-rule";
  if (/^\.cursor\/rules\/.+\.(?:md|mdc)$/.test(value)) return "cursor-rule";
  if (/^\.windsurf\/rules\/.+\.(?:md|mdc)$/.test(value)) return "windsurf-rule";
  return undefined;
}

function mcpFormat(value: string): ProjectInventoryArtifactFormat | undefined {
  if (/^\.harness\/mcp\/.+/.test(value)) return "harhub-mcp";
  if ([".mcp.json", ".vscode/mcp.json", ".cursor/mcp.json"].includes(value)) return "mcp-json";
  return undefined;
}

function invalidArtifact(input: {
  kind: "skill";
  format: "agent-skill";
  path: string;
  name: string;
  message: string;
  digest: string;
  fileCount: number;
  size: number;
}): ProjectInventoryArtifact {
  return {
    id: artifactId(input.kind, input.path),
    kind: input.kind,
    format: input.format,
    path: input.path,
    name: input.name,
    description: "Invalid repository Skill.",
    digest: input.digest,
    fileCount: input.fileCount,
    size: input.size,
    health: "error",
    validation: { errors: 1, warnings: 0 },
    issues: [{ severity: "error", message: input.message }],
    relationship: "blocked"
  };
}

function directoryDigest(files: SkillPackageFile[]): string {
  const manifest = files
    .slice()
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    .map((file) => `${Buffer.byteLength(file.path)}:${file.path}:${file.content.byteLength}:${contentHash(file.content)}`)
    .join("\n");
  return contentHash(manifest);
}

function artifactId(kind: string, artifactPath: string): string {
  return `repository-artifact:${contentHash(`${kind}\0${artifactPath}`)}`;
}

function friendlyFileName(value: string): string {
  const name = path.posix.basename(value).replace(/\.(?:md|mdc|json)$/i, "");
  return name
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function healthFromCounts(errors: number, warnings: number): AssetHealth {
  if (errors) return "error";
  if (warnings) return "warning";
  return "valid";
}
