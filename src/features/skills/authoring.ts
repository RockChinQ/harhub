import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  findNearestManifest,
  pathRelativeToRoot,
  resolveFromCwd
} from "../../shared/fs-utils.js";
import { slugify, stringValue } from "../../shared/markdown.js";
import type { SkillRecord } from "../../shared/types.js";
import { OFFICIAL_SKILL_NAME_PATTERN } from "./constants.js";
import { removeHarhubManifestArtifact, upsertHarhubManifest } from "./manifest.js";
import type { SkillMetadataUpdate } from "./types.js";
import { normalizeLifecycle, titleFromSlug, unique } from "./utils.js";

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
  writeFileSync(skillPath, skillMarkdown(slug, options.description));

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
    ...(normalizeLifecycle(input.lifecycleState)
      ? { lifecycleState: normalizeLifecycle(input.lifecycleState) }
      : {}),
    ...(Array.isArray(input.agents)
      ? { agents: unique(input.agents.map((agent) => agent.trim())) }
      : {}),
    replaceTags: Array.isArray(input.tags)
  });
}

export function deleteSkill(skill: SkillRecord): void {
  removeHarhubManifestArtifact(skill);
  rmSync(path.dirname(skill.source.absolutePath), { recursive: true, force: true });
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

function skillMarkdown(slug: string, inputDescription: string | undefined): string {
  const description =
    inputDescription?.trim() ||
    "Use this skill when an agent needs a repeatable procedure for a specific task.";

  return `---
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
`;
}
