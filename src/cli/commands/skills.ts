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
  packageSkillDirectory,
  readCatalog,
  scanSkills,
  updateSkillFrontmatter,
  validateSkills,
  writeCatalog
} from "../../features/skills/index.js";
import {
  resolveHarhubApiUrl,
  resolveHarhubToken,
  resolveHarhubWorkspaceId,
  uploadSkillZip
} from "../api.js";
import {
  optionString,
  resolveAssetCatalogPath,
  resolveCatalogPath
} from "../args.js";
import {
  hasErrors,
  printIssues,
  printSkillTable
} from "../format.js";
import {
  canUseInteractiveTerminal,
  promptSecret,
  promptText,
  selectSkillsForUpload
} from "../interactive.js";
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
  const skills = filterCatalog(catalog);

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
  console.log(`  source: ${skill.source.path}`);
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
    description: optionString(parsed, "description")
  });

  console.log(`Created ${skillPath}`);
  return 0;
}

export async function runUpdate(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub skills update <id|name|slug> [--description text]");
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

  updateSkillFrontmatter(skill, readSkillUpdateInput(parsed));
  rescanAfterLocalMutation(parsed, [skill.source.root], catalogPath);

  if (parsed.options.json) {
    console.log(JSON.stringify({ updated: skill.id }, null, 2));
    return 0;
  }

  console.log(`Updated ${skill.displayName}`);
  return 0;
}

export async function runUpload(parsed: ParsedArgs): Promise<number> {
  const interactive = shouldUseInteractiveUpload(parsed);
  const roots = parsed.positionals.length > 0 ? parsed.positionals : [process.cwd()];
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);

  if (skills.length === 0) {
    if (parsed.options.json) {
      console.log(JSON.stringify({ uploaded: [], skills: [], issues }, null, 2));
      return 1;
    }

    console.error("No skills found.");
    printIssues(issues);
    return 1;
  }

  let selectedSkills = skills;

  if (interactive) {
    const selected = await selectSkillsForUpload({ skills, issues });
    if (!selected) {
      console.log("Upload cancelled.");
      return 0;
    }
    selectedSkills = selected;

    if (selectedSkills.length === 0) {
      console.error("No valid skills selected.");
      return 1;
    }
  }

  const selectedIds = new Set(selectedSkills.map((skill) => skill.id));
  const selectedIssues = issues.filter((issue) => !issue.skillId || selectedIds.has(issue.skillId));

  if (hasErrors(selectedIssues)) {
    if (parsed.options.json) {
      console.log(JSON.stringify({ uploaded: [], skills, issues }, null, 2));
      return 1;
    }

    console.error("Refusing to upload invalid skills.");
    printIssues(selectedIssues);
    return 1;
  }

  const apiUrl = interactive
    ? await promptText({ label: "Harhub URL", defaultValue: resolveHarhubApiUrl(parsed) }) ?? resolveHarhubApiUrl(parsed)
    : resolveHarhubApiUrl(parsed);
  const workspaceId = interactive
    ? await promptText({ label: "Workspace ID", defaultValue: resolveHarhubWorkspaceId(parsed), required: true })
    : resolveHarhubWorkspaceId(parsed);
  const token = interactive
    ? resolveHarhubToken(parsed) ?? await promptSecret("Access token")
    : resolveHarhubToken(parsed);

  if (!workspaceId) {
    console.error("A workspace id is required. Pass --workspace <workspace-id> or set HARHUB_WORKSPACE_ID.");
    return 1;
  }

  if (!token) {
    console.error("An access token is required. Pass --token or set HARHUB_TOKEN.");
    return 1;
  }

  const uploaded: Array<Record<string, unknown>> = [];

  for (const skill of selectedSkills) {
    const packaged = await packageSkillDirectory(skill);
    const response = await uploadSkillZip({
      apiUrl,
      workspaceId,
      token,
      fileName: packaged.fileName,
      buffer: packaged.buffer
    });

    uploaded.push({
      skill: skill.name,
      fileName: packaged.fileName,
      rootDir: packaged.rootDir,
      asset: response.uploaded
    });

    if (!parsed.options.json) {
      console.log(`Uploaded ${skill.name} from ${packaged.rootDir}`);
    }
  }

  if (parsed.options.json) {
    console.log(JSON.stringify({ uploaded, selected: selectedSkills, skills, issues }, null, 2));
  } else {
    console.log(`Uploaded ${uploaded.length} skill(s) to ${workspaceId}.`);
  }

  return 0;
}

function shouldUseInteractiveUpload(parsed: ParsedArgs): boolean {
  return (
    canUseInteractiveTerminal() &&
    !hasBooleanOption(parsed, "json") &&
    !hasBooleanOption(parsed, "all") &&
    !hasBooleanOption(parsed, "yes") &&
    !hasBooleanOption(parsed, "no-interactive")
  );
}

function hasBooleanOption(parsed: ParsedArgs, name: string): boolean {
  const value = parsed.options[name];
  return value === true || value === "true";
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
  return {
    description: optionString(parsed, "description")
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
  const workspaceId = resolveHarhubWorkspaceId(parsed);
  const token = resolveHarhubToken(parsed);
  const apiUrl = resolveHarhubApiUrl(parsed);

  if (!workspaceId) {
    console.error("A workspace id is required. Pass --workspace <workspace-id>.");
    return 1;
  }

  if (!token) {
    console.error("A token is required. Pass --token or set HARHUB_TOKEN.");
    return 1;
  }

  const pathParts = [`${apiUrl}/api/workspaces/${workspaceId}/skills`];
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
