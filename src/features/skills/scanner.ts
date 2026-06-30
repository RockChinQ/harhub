import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  findNearestManifest,
  findSkillMarkdownFiles,
  getGitInfo,
  pathRelativeToRoot,
  resolveFromCwd
} from "../../shared/fs-utils.js";
import {
  contentHash,
  parseMarkdown,
  slugify,
  stringValue
} from "../../shared/markdown.js";
import type {
  SkillPackageManifest,
  SkillRecord
} from "../../shared/types.js";
import type { ScanOptions } from "./types.js";
import { normalizeLifecycle, titleFromSlug, unique } from "./utils.js";

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
      const id = `skill:${slugify(packageName)}:${slug}`;

      if (seen.has(id)) continue;
      seen.add(id);

      records.push({
        id,
        name: slug,
        displayName: parsed.title ?? titleFromSlug(slug),
        slug,
        description: stringValue(parsed.frontmatter.description) ?? "",
        owner: artifact?.owner ?? stringValue(manifest?.metadata?.owner),
        packageName,
        lifecycleState: normalizeLifecycle(manifest?.spec?.maturity) ?? "experimental",
        tags: unique([...(artifact?.tags ?? []), ...(manifest?.metadata?.tags ?? [])]),
        agents: unique([...(manifest?.spec?.compatibility?.agents ?? [])]),
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
