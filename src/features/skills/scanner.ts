import { readFileSync } from "node:fs";
import path from "node:path";
import {
  findSkillMarkdownFiles,
  getGitInfo,
  pathRelativeToRoot,
  resolveFromCwd
} from "../../shared/fs-utils.js";
import {
  parseMarkdown,
  slugify,
  stringValue
} from "../../shared/markdown.js";
import type { SkillRecord } from "../../shared/types.js";
import type { ScanOptions } from "./types.js";
import { displayNameFromSkillFrontmatter } from "./utils.js";

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
      const content = readFileSync(skillPath, "utf8");
      const parsed = parseMarkdown(content);
      const standardName = stringValue(parsed.frontmatter.name);
      const slug = standardName ?? slugify(path.basename(skillDir));
      const id = `skill:${slug}`;

      if (seen.has(id)) continue;
      seen.add(id);

      records.push({
        id,
        name: slug,
        displayName: displayNameFromSkillFrontmatter({
          frontmatter: parsed.frontmatter,
          title: parsed.title,
          slug
        }),
        slug,
        description: stringValue(parsed.frontmatter.description) ?? "",
        headings: parsed.headings,
        source: {
          root: sourceRoot,
          path: pathRelativeToRoot(sourceRoot, skillPath),
          absolutePath: skillPath,
          repository: git.repository,
          branch: git.branch,
          commit: git.commit
        }
      });
    }
  }

  return records;
}
