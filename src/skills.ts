import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  findNearestManifest,
  findSkillMarkdownFiles,
  getGitInfo,
  pathRelativeToRoot,
  resolveFromCwd
} from "./fs-utils.js";
import {
  contentHash,
  parseMarkdown,
  slugify,
  stringValue
} from "./markdown.js";
import type {
  SkillCatalog,
  SkillLifecycleState,
  SkillPackageManifest,
  SkillRecord,
  ValidationIssue
} from "./types.js";

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /\b(?:password|token|secret|api[_-]?key)\s*[:=]\s*["']?[^\s"']{12,}/i
];

const OFFICIAL_SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STANDARD_FRONTMATTER_KEYS = new Set(["name", "description"]);

export interface ScanOptions {
  roots: string[];
}

export interface SkillMetadataUpdate {
  description?: string;
  owner?: string;
  tags?: string[];
  lifecycleState?: string;
  agents?: string[];
}

export function scanSkills(options: ScanOptions): SkillRecord[] {
  const roots = options.roots.length > 0 ? options.roots : [process.cwd()];
  const records: SkillRecord[] = [];
  const seen = new Set<string>();

  for (const inputRoot of roots) {
    const scanRoot = resolveFromCwd(inputRoot);
    const git = getGitInfo(scanRoot);
    const sourceRoot = git.root ?? scanRoot;

    for (const skillPath of findSkillMarkdownFiles(scanRoot)) {
      const skillDir = path.dirname(skillPath);
      const manifestInfo = findNearestManifest(skillDir, scanRoot);
      const manifest = manifestInfo.manifest;
      const content = readFileSync(skillPath, "utf8");
      const parsed = parseMarkdown(content);
      const artifact = findManifestArtifact(manifest, manifestInfo.path, skillPath);
      const packageName =
        stringValue(manifest?.metadata?.name) ??
        slugify(path.basename(path.dirname(skillDir))) ??
        "local";
      const standardName = stringValue(parsed.frontmatter.name);
      const slug = standardName ?? slugify(path.basename(skillDir));
      const displayName = parsed.title ?? titleFromSlug(slug);
      const id = `skill:${slugify(packageName)}:${slug}`;

      if (seen.has(id)) {
        continue;
      }

      seen.add(id);
      records.push({
        id,
        name: slug,
        displayName,
        slug,
        description:
          stringValue(parsed.frontmatter.description) ??
          "",
        owner:
          artifact?.owner ??
          stringValue(manifest?.metadata?.owner),
        packageName,
        lifecycleState:
          normalizeLifecycle(manifest?.spec?.maturity) ??
          "experimental",
        tags: unique([
          ...(artifact?.tags ?? []),
          ...(manifest?.metadata?.tags ?? [])
        ]),
        agents: unique([
          ...(manifest?.spec?.compatibility?.agents ?? [])
        ]),
        contentHash: contentHash(content),
        headings: parsed.headings,
        resources: listSkillResources(skillDir),
        source: {
          root: sourceRoot,
          path: pathRelativeToRoot(sourceRoot, skillPath),
          absolutePath: skillPath,
          repository: git.repository,
          branch: git.branch,
          commit: git.commit
        },
        discoveredAt: new Date().toISOString()
      });
    }
  }

  return records;
}

export function validateSkills(records: SkillRecord[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, string>();

  if (records.length === 0) {
    issues.push({
      severity: "error",
      code: "no-skills-found",
      message: "No SKILL.md files were found in the provided paths."
    });
  }

  for (const record of records) {
    const content = readFileSync(record.source.absolutePath, "utf8");
    const parsed = parseMarkdown(content);
    const skillDirName = path.basename(path.dirname(record.source.absolutePath));
    const frontmatterKeys = Object.keys(parsed.frontmatter);

    if (ids.has(record.id)) {
      issues.push({
        severity: "error",
        code: "duplicate-skill-id",
        message: `Duplicate skill id "${record.id}".`,
        path: record.source.absolutePath,
        skillId: record.id
      });
    }
    ids.set(record.id, record.source.absolutePath);

    if (!parsed.hasFrontmatter) {
      issues.push({
        severity: "error",
        code: "missing-frontmatter",
        message:
          parsed.frontmatterError ??
          "SKILL.md must start with YAML frontmatter containing name and description.",
        path: record.source.absolutePath,
        skillId: record.id
      });
    }

    const standardName = stringValue(parsed.frontmatter.name);
    if (!standardName) {
      issues.push({
        severity: "error",
        code: "missing-name",
        message: "Skill frontmatter must include a name field.",
        path: record.source.absolutePath,
        skillId: record.id
      });
    } else if (!OFFICIAL_SKILL_NAME_PATTERN.test(standardName)) {
      issues.push({
        severity: "error",
        code: "invalid-name",
        message:
          "Skill name must be a lowercase slug with only letters, numbers, and hyphens, up to 64 characters.",
        path: record.source.absolutePath,
        skillId: record.id
      });
    } else if (standardName !== skillDirName) {
      issues.push({
        severity: "warning",
        code: "name-directory-mismatch",
        message: `Skill name "${standardName}" should match its parent directory "${skillDirName}".`,
        path: record.source.absolutePath,
        skillId: record.id
      });
    }

    const description = stringValue(parsed.frontmatter.description);
    if (!description) {
      issues.push({
        severity: "error",
        code: "missing-description",
        message: "Skill frontmatter must include a description field.",
        path: record.source.absolutePath,
        skillId: record.id
      });
    } else if (description.length > 1024) {
      issues.push({
        severity: "error",
        code: "description-too-long",
        message: "Skill description must be 1024 characters or fewer.",
        path: record.source.absolutePath,
        skillId: record.id
      });
    } else if (description.length < 24) {
      issues.push({
        severity: "warning",
        code: "thin-description",
        message:
          "Skill description should clearly explain what the skill does and when to use it.",
        path: record.source.absolutePath,
        skillId: record.id
      });
    }

    for (const key of frontmatterKeys) {
      if (!STANDARD_FRONTMATTER_KEYS.has(key)) {
        issues.push({
          severity: "warning",
          code: "non-standard-frontmatter",
          message: `Frontmatter field "${key}" is Harhub-specific or non-standard; prefer harhub.yaml for registry metadata.`,
          path: record.source.absolutePath,
          skillId: record.id
        });
      }
    }

    if (!record.headings[0]) {
      issues.push({
        severity: "warning",
        code: "missing-title",
        message: "Skill body should have an H1 title for human readers.",
        path: record.source.absolutePath,
        skillId: record.id
      });
    }

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        issues.push({
          severity: "error",
          code: "possible-secret",
          message: "Skill content appears to contain a secret or credential.",
          path: record.source.absolutePath,
          skillId: record.id
        });
      }
    }

    for (const broken of findBrokenLocalLinks(record.source.absolutePath, content)) {
      issues.push({
        severity: "error",
        code: "broken-local-link",
        message: `Referenced local path does not exist: ${broken}`,
        path: record.source.absolutePath,
        skillId: record.id
      });
    }
  }

  return issues;
}

export function filterCatalog(
  catalog: SkillCatalog,
  filters: { tag?: string; owner?: string; packageName?: string }
): SkillRecord[] {
  return catalog.skills.filter((skill) => {
    if (filters.tag && !skill.tags.includes(filters.tag)) return false;
    if (filters.owner && skill.owner !== filters.owner) return false;
    if (filters.packageName && skill.packageName !== filters.packageName) return false;
    return true;
  });
}

export function findSkill(catalog: SkillCatalog, query: string): SkillRecord | undefined {
  const normalized = query.toLowerCase();
  return catalog.skills.find(
    (skill) =>
      skill.id.toLowerCase() === normalized ||
      skill.slug.toLowerCase() === normalized ||
      skill.name.toLowerCase() === normalized ||
      skill.displayName.toLowerCase() === normalized
  );
}

/*
 * The official Skill contract lives inside SKILL.md. Harhub metadata is kept in
 * harhub.yaml so registry fields do not change how agents load a skill.
 */
export function createSkillSkeleton(options: {
  name: string;
  dir: string;
  description?: string;
  owner?: string;
  tags: string[];
}): string {
  const slug = slugify(options.name);
  if (!OFFICIAL_SKILL_NAME_PATTERN.test(slug)) {
    throw new Error(
      "Skill name must resolve to a lowercase slug with only letters, numbers, and hyphens, up to 64 characters."
    );
  }

  const skillRoot = resolveFromCwd(options.dir);
  const skillDir = path.join(skillRoot, slug);
  const skillPath = path.join(skillDir, "SKILL.md");

  if (existsSync(skillPath)) {
    throw new Error(`Skill already exists at ${skillPath}`);
  }

  mkdirSync(skillDir, { recursive: true });
  mkdirSync(path.join(skillDir, "references"), { recursive: true });
  mkdirSync(path.join(skillDir, "scripts"), { recursive: true });

  const description =
    options.description?.trim() ||
    "Use this skill when an agent needs a repeatable procedure for a specific task.";

  writeFileSync(
    skillPath,
    `---
name: ${slug}
description: ${JSON.stringify(description)}
---

# ${titleFromSlug(slug)}

Use this skill when an agent needs a repeatable procedure for a specific task.

## Procedure

1. Describe the trigger condition.
2. List the required context to gather.
3. Define the steps the agent should follow.
4. Add validation or handoff criteria.

## Validation

- The skill has a clear trigger condition.
- The instructions are specific enough to be reused.
- References and scripts are checked into the same skill directory.
`
  );

  upsertHarhubManifest(skillRoot, {
    path: `${slug}/SKILL.md`,
    owner: options.owner,
    tags: options.tags
  });

  return skillPath;
}

export function updateSkillMetadata(
  skill: SkillRecord,
  input: SkillMetadataUpdate
): void {
  if (typeof input.description === "string") {
    updateSkillDescription(skill, input.description);
  }

  const skillDir = path.dirname(skill.source.absolutePath);
  const manifestInfo = findNearestManifest(skillDir, skill.source.root);
  const manifestRoot = manifestInfo.path
    ? path.dirname(manifestInfo.path)
    : path.dirname(skillDir);
  const artifactPath = pathRelativeToRoot(manifestRoot, skill.source.absolutePath);

  upsertHarhubManifest(manifestRoot, {
    path: artifactPath,
    ...(typeof input.owner === "string" ? { owner: input.owner.trim() } : {}),
    ...(Array.isArray(input.tags) ? { tags: unique(input.tags.map((tag) => tag.trim())) } : {}),
    ...(normalizeLifecycle(input.lifecycleState) ? {
      lifecycleState: normalizeLifecycle(input.lifecycleState)
    } : {}),
    ...(Array.isArray(input.agents) ? {
      agents: unique(input.agents.map((agent) => agent.trim()))
    } : {}),
    replaceTags: Array.isArray(input.tags)
  });
}

export function deleteSkill(skill: SkillRecord): void {
  removeHarhubManifestArtifact(skill);
  rmSync(path.dirname(skill.source.absolutePath), { recursive: true, force: true });
}

function normalizeLifecycle(value: unknown): SkillLifecycleState | undefined {
  if (
    value === "experimental" ||
    value === "stable" ||
    value === "deprecated" ||
    value === "archived"
  ) {
    return value;
  }

  return undefined;
}

function findManifestArtifact(
  manifest: SkillPackageManifest | undefined,
  manifestPath: string | undefined,
  skillPath: string
):
  | {
      owner?: string;
      tags?: string[];
    }
  | undefined {
  if (!manifest || !manifestPath) return undefined;
  const manifestDir = path.dirname(manifestPath);
  const relativeSkillPath = pathRelativeToRoot(manifestDir, skillPath);

  return manifest.spec?.artifacts?.find(
    (artifact) => artifact.type === "skill" && artifact.path === relativeSkillPath
  );
}

function findBrokenLocalLinks(skillPath: string, content: string): string[] {
  const parsed = parseMarkdown(content);
  const skillDir = path.dirname(skillPath);
  const broken: string[] = [];

  for (const link of parsed.links) {
    if (
      !link ||
      link.startsWith("#") ||
      /^[a-z]+:\/\//i.test(link) ||
      link.startsWith("mailto:")
    ) {
      continue;
    }

    const cleanLink = link.split("#")[0]?.trim();
    if (!cleanLink) continue;

    const target = path.resolve(skillDir, decodeURIComponent(cleanLink));
    if (!existsSync(target)) {
      broken.push(cleanLink);
    }
  }

  return broken;
}

function listSkillResources(skillDir: string): SkillRecord["resources"] {
  return {
    scripts: listResourceDir(skillDir, "scripts"),
    references: listResourceDir(skillDir, "references"),
    assets: listResourceDir(skillDir, "assets")
  };
}

function listResourceDir(skillDir: string, resourceDir: string): string[] {
  const dir = path.join(skillDir, resourceDir);
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${resourceDir}/${entry.name}`)
    .sort();
}

function upsertHarhubManifest(
  skillRoot: string,
  artifact: {
    path: string;
    owner?: string;
    tags?: string[];
    lifecycleState?: SkillLifecycleState;
    agents?: string[];
    replaceTags?: boolean;
  }
): void {
  const manifestPath = path.join(skillRoot, "harhub.yaml");
  const manifest =
    (existsSync(manifestPath)
      ? YAML.parse(readFileSync(manifestPath, "utf8"))
      : undefined) as SkillPackageManifest | undefined;

  const next: SkillPackageManifest = manifest ?? {
    apiVersion: "harhub.io/v1",
    kind: "HarnessPackage",
    metadata: {
      name: slugify(path.basename(skillRoot)) || "local-skills"
    },
    spec: {
      maturity: "experimental",
      artifacts: []
    }
  };

  next.metadata ??= {};
  next.spec ??= {};
  next.spec.artifacts ??= [];

  if (artifact.owner && !next.metadata.owner) {
    next.metadata.owner = artifact.owner;
  }

  if (artifact.tags && artifact.tags.length > 0 && !artifact.replaceTags) {
    next.metadata.tags = unique([...(next.metadata.tags ?? []), ...artifact.tags]);
  }

  if (artifact.lifecycleState) {
    next.spec.maturity = artifact.lifecycleState;
  }

  if (artifact.agents) {
    next.spec.compatibility ??= {};
    next.spec.compatibility.agents = artifact.agents;
  }

  const existing = next.spec.artifacts.find(
    (item) => item.type === "skill" && item.path === artifact.path
  );

  if (existing) {
    if (Object.hasOwn(artifact, "owner")) {
      if (artifact.owner) {
        existing.owner = artifact.owner;
      } else {
        delete existing.owner;
      }
    }

    if (artifact.tags) {
      if (artifact.replaceTags) {
        existing.tags = artifact.tags;
      } else {
        existing.tags = unique([...(existing.tags ?? []), ...artifact.tags]);
      }
    }
  } else {
    next.spec.artifacts.push({
      type: "skill",
      path: artifact.path,
      ...(artifact.owner ? { owner: artifact.owner } : {}),
      ...(artifact.tags && artifact.tags.length > 0 ? { tags: artifact.tags } : {})
    });
  }

  writeFileSync(manifestPath, YAML.stringify(next));
}

function updateSkillDescription(skill: SkillRecord, description: string): void {
  const content = readFileSync(skill.source.absolutePath, "utf8");
  const frontmatter = splitSkillFrontmatter(content);
  const nextFrontmatter = {
    ...frontmatter.frontmatter,
    name: stringValue(frontmatter.frontmatter.name) ?? skill.name,
    description: description.trim()
  };

  writeFileSync(
    skill.source.absolutePath,
    `---\n${YAML.stringify(nextFrontmatter).trimEnd()}\n---\n\n${frontmatter.body.trimStart()}`
  );
}

function removeHarhubManifestArtifact(skill: SkillRecord): void {
  const skillDir = path.dirname(skill.source.absolutePath);
  const manifestInfo = findNearestManifest(skillDir, skill.source.root);
  if (!manifestInfo.path) return;

  const manifest =
    (YAML.parse(readFileSync(manifestInfo.path, "utf8")) as SkillPackageManifest | undefined) ??
    undefined;
  if (!manifest?.spec?.artifacts) return;

  const manifestRoot = path.dirname(manifestInfo.path);
  const artifactPath = pathRelativeToRoot(manifestRoot, skill.source.absolutePath);
  manifest.spec.artifacts = manifest.spec.artifacts.filter(
    (artifact) => artifact.type !== "skill" || artifact.path !== artifactPath
  );

  writeFileSync(manifestInfo.path, YAML.stringify(manifest));
}

function splitSkillFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---\n")) {
    return { frontmatter: {}, body: content };
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {}, body: content };
  }

  const raw = content.slice(4, end);
  const body = content.slice(end + 4).replace(/^\n/, "");
  return {
    frontmatter: (YAML.parse(raw) as Record<string, unknown>) ?? {},
    body
  };
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}
