import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createAssetCatalog,
  writeAssetCatalog
} from "../../features/assets/index.js";
import {
  createCatalog,
  createSkillSkeleton,
  deleteSkill,
  filterCatalog,
  findSkill,
  readCatalog,
  scanSkills,
  updateSkillMetadata,
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

export async function runUpdate(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub skills update <id|name|slug> [--description text] [--owner owner] [--tag value]");
    return 1;
  }

  if (optionString(parsed, "workspace")) {
    return runSkillApiMutation(parsed, query, "PATCH", readSkillUpdateInput(parsed), "Updated");
  }

  const catalogPath = resolveCatalogPath(parsed);
  const catalog = readCatalog(catalogPath);
  const skill = findSkill(catalog, query);
  if (!skill) {
    console.error(`Skill not found: ${query}`);
    return 1;
  }

  updateSkillMetadata(skill, readSkillUpdateInput(parsed));
  rescanAfterLocalMutation(parsed, [skill.source.root], catalogPath);

  if (parsed.options.json) {
    console.log(JSON.stringify({ updated: skill.id }, null, 2));
    return 0;
  }

  console.log(`Updated ${skill.displayName}`);
  return 0;
}

export async function runDelete(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub skills delete <id|name|slug>");
    return 1;
  }

  if (optionString(parsed, "workspace")) {
    return runSkillApiMutation(parsed, query, "DELETE", undefined, "Deleted");
  }

  const catalogPath = resolveCatalogPath(parsed);
  const catalog = readCatalog(catalogPath);
  const skill = findSkill(catalog, query);
  if (!skill) {
    console.error(`Skill not found: ${query}`);
    return 1;
  }

  deleteSkill(skill);
  rescanAfterLocalMutation(parsed, [skill.source.root], catalogPath);

  if (parsed.options.json) {
    console.log(JSON.stringify({ deleted: skill.id }, null, 2));
    return 0;
  }

  console.log(`Deleted ${skill.displayName}`);
  return 0;
}

export async function runRevalidate(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  const workspaceId = optionString(parsed, "workspace");
  if (!workspaceId) {
    return runValidate(parsed);
  }

  return runSkillApiMutation(
    parsed,
    query,
    "POST",
    {},
    query ? "Validated" : "Validated workspace",
    "validate"
  );
}

function rescanAfterLocalMutation(
  parsed: ParsedArgs,
  roots: string[],
  catalogPath: string
): void {
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const assetCatalog = createAssetCatalog(skills, issues);

  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeCatalog(catalogPath, createCatalog(skills));
  writeAssetCatalog(resolveAssetCatalogPath(parsed, false), assetCatalog);
}

function readSkillUpdateInput(parsed: ParsedArgs) {
  const tags = optionArray(parsed, "tag");
  const agents = optionArray(parsed, "agent");
  return {
    description: optionString(parsed, "description"),
    owner: optionString(parsed, "owner"),
    tags: tags.length > 0 ? tags : undefined,
    lifecycleState: optionString(parsed, "lifecycle"),
    agents: agents.length > 0 ? agents : undefined
  };
}

async function runSkillApiMutation(
  parsed: ParsedArgs,
  query: string | undefined,
  method: "PATCH" | "DELETE" | "POST",
  body: unknown,
  action: string,
  suffix?: string
): Promise<number> {
  const workspaceId = optionString(parsed, "workspace");
  const token = optionString(parsed, "token") ?? process.env.HARHUB_TOKEN;
  const api = (optionString(parsed, "api") ?? "http://127.0.0.1:3310").replace(/\/+$/g, "");

  if (!workspaceId) {
    console.error("A workspace id is required. Pass --workspace <workspace-id>.");
    return 1;
  }

  if (!token) {
    console.error("A token is required. Pass --token or set HARHUB_TOKEN.");
    return 1;
  }

  const pathParts = [`${api}/api/workspaces/${workspaceId}/skills`];
  if (query) pathParts.push(encodeURIComponent(query));
  if (suffix) pathParts.push(suffix);
  const response = await fetch(pathParts.join("/"), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && method !== "DELETE" ? { "Content-Type": "application/json" } : {})
    },
    ...(body && method !== "DELETE" ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    if (parsed.options.json && data) {
      console.log(JSON.stringify(data, null, 2));
      return 1;
    }
    console.error(typeof data?.error === "string" ? data.error : `${action} failed with ${response.status}`);
    return 1;
  }

  if (parsed.options.json) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }

  const label = data?.validated?.displayName ?? query ?? "workspace";
  const issueCount = Array.isArray(data?.validatedIssues)
    ? data.validatedIssues.length
    : Array.isArray(data?.issues) ? data.issues.length : undefined;
  console.log(`${action} ${label}${issueCount === undefined ? "" : ` (${issueCount} issue(s))`}`);
  return 0;
}
