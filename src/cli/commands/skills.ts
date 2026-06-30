import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createAssetCatalog,
  writeAssetCatalog
} from "../../features/assets/index.js";
import {
  createCatalog,
  createSkillSkeleton,
  filterCatalog,
  findSkill,
  readCatalog,
  scanSkills,
  validateSkills,
  writeCatalog
} from "../../features/skills/index.js";
import {
  optionArray,
  optionString,
  resolveAssetCatalogPath,
  resolveCatalogPath
} from "../args.js";
import {
  hasErrors,
  printIssues,
  printSkillTable
} from "../format.js";
import type { ParsedArgs } from "../types.js";

export function runScan(parsed: ParsedArgs): number {
  const catalogPath = resolveCatalogPath(parsed);
  const assetCatalogPath = resolveAssetCatalogPath(parsed, false);
  const roots = parsed.positionals.length > 0 ? parsed.positionals : [process.cwd()];
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const assetCatalog = createAssetCatalog(skills, issues);

  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeCatalog(catalogPath, createCatalog(skills));
  writeAssetCatalog(assetCatalogPath, assetCatalog);

  if (parsed.options.json) {
    console.log(JSON.stringify({ catalogPath, assetCatalogPath, skills, assets: assetCatalog.assets, issues }, null, 2));
    return hasErrors(issues) ? 1 : 0;
  }

  console.log(`Scanned ${skills.length} skill(s).`);
  console.log(`Catalog: ${catalogPath}`);
  console.log(`Asset catalog: ${assetCatalogPath}`);
  printIssues(issues);
  return hasErrors(issues) ? 1 : 0;
}

export function runValidate(parsed: ParsedArgs): number {
  const roots = parsed.positionals.length > 0 ? parsed.positionals : [process.cwd()];
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);

  if (parsed.options.json) {
    console.log(JSON.stringify({ skills, issues }, null, 2));
    return hasErrors(issues) ? 1 : 0;
  }

  console.log(`Validated ${skills.length} skill(s).`);
  printIssues(issues);
  return hasErrors(issues) ? 1 : 0;
}

export function runList(parsed: ParsedArgs): number {
  const catalog = readCatalog(resolveCatalogPath(parsed));
  const skills = filterCatalog(catalog, {
    tag: optionString(parsed, "tag"),
    owner: optionString(parsed, "owner"),
    packageName: optionString(parsed, "package")
  });

  if (parsed.options.json) {
    console.log(JSON.stringify(skills, null, 2));
    return 0;
  }

  if (skills.length === 0) {
    console.log("No skills matched.");
    return 0;
  }

  printSkillTable(skills);
  return 0;
}

export function runShow(parsed: ParsedArgs): number {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub skills show <id|name|slug>");
    return 1;
  }

  const skill = findSkill(readCatalog(resolveCatalogPath(parsed)), query);
  if (!skill) {
    console.error(`Skill not found: ${query}`);
    return 1;
  }

  if (parsed.options.json) {
    console.log(JSON.stringify(skill, null, 2));
    return 0;
  }

  console.log(`${skill.displayName}`);
  console.log(`  id: ${skill.id}`);
  console.log(`  name: ${skill.name}`);
  console.log(`  package: ${skill.packageName ?? "-"}`);
  console.log(`  owner: ${skill.owner ?? "-"}`);
  console.log(`  lifecycle: ${skill.lifecycleState}`);
  console.log(`  tags: ${skill.tags.join(", ") || "-"}`);
  console.log(`  agents: ${skill.agents.join(", ") || "-"}`);
  console.log(`  source: ${skill.source.path}`);
  console.log(`  hash: ${skill.contentHash.slice(0, 12)}`);
  console.log("");
  console.log(skill.description || "No description.");
  return 0;
}

export function runCreate(parsed: ParsedArgs): number {
  const name = parsed.positionals[0];
  if (!name) {
    console.error("Usage: harhub skills create <name> [--dir skills]");
    return 1;
  }

  const skillPath = createSkillSkeleton({
    name,
    dir: optionString(parsed, "dir") ?? "skills",
    description: optionString(parsed, "description"),
    owner: optionString(parsed, "owner"),
    tags: optionArray(parsed, "tag")
  });

  console.log(`Created ${skillPath}`);
  return 0;
}
