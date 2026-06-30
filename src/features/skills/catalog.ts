import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SkillCatalog, SkillRecord } from "../../shared/types.js";

export const DEFAULT_CATALOG_PATH = ".harhub/skills.json";

export function createCatalog(skills: SkillCatalog["skills"]): SkillCatalog {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    skills: skills.sort((a, b) => a.id.localeCompare(b.id))
  };
}

export function readCatalog(catalogPath: string): SkillCatalog {
  if (!existsSync(catalogPath)) {
    throw new Error(
      `Catalog not found at ${catalogPath}. Run "harhub skills scan" first.`
    );
  }

  return JSON.parse(readFileSync(catalogPath, "utf8")) as SkillCatalog;
}

export function writeCatalog(catalogPath: string, catalog: SkillCatalog): void {
  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
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
