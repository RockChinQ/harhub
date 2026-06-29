import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SkillCatalog } from "./types.js";

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
