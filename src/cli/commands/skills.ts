import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type { AssetRecord } from "../../shared/types.js";
import {
  createAssetCatalog,
  writeAssetCatalog
} from "../../features/assets/index.js";
import {
  createCatalog,
  createSkillSkeleton,
  deleteSkill,
  discoverSkillsInArchive,
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
  createWorkspaceAssetShare,
  resolveHarhubApiUrl,
  resolveHarhubToken,
  resolveHarhubWorkspaceId,
  uploadSkillZip
} from "../api.js";
import {
  hasBooleanOption,
  optionString,
  resolveAssetCatalogPath,
  resolveCatalogPath
} from "../args.js";
import {
  hasErrors,
  printAssetTable,
  printIssues,
  printSkillTable
} from "../format.js";
import {
  canUseInteractiveTerminal,
  selectSkillsForUpload
} from "../interactive.js";
import type { ParsedArgs } from "../types.js";
import { downloadWorkspaceFile, requestWorkspaceJson, resolveRemoteContext } from "../remote.js";

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

export async function runList(parsed: ParsedArgs): Promise<number> {
  if (isRemote(parsed)) {
    try {
      const payload = await requestWorkspaceJson<unknown>(parsed, "/assets?kind=skill");
      const skills = normalizeRemoteSkills(payload);
      if (hasBooleanOption(parsed, "json")) {
        console.log(JSON.stringify(skills, null, 2));
      } else if (skills.length === 0) {
        console.log("No remote skills matched.");
      } else {
        printAssetTable(skills);
      }
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }
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

export async function runShow(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub skills show <id|name|slug>");
    return 1;
  }

  if (isRemote(parsed)) {
    try {
      const skill = await requestWorkspaceJson<AssetRecord>(parsed, `/assets/${encodeURIComponent(query)}`);
      if (hasBooleanOption(parsed, "json")) {
        console.log(JSON.stringify(skill, null, 2));
      } else {
        console.log(skill.displayName ?? skill.name ?? query);
        console.log(`  id: ${skill.id}`);
        console.log(`  name: ${skill.name}`);
        console.log(`  version: ${skill.version}`);
        console.log(`  health: ${skill.health}`);
        console.log("");
        console.log(skill.description || "No description.");
      }
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
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

  if (optionString(parsed, "workspace") || hasBooleanOption(parsed, "remote")) {
    console.error("Uploaded skill packages are immutable. Update the local Skill and upload a new zip.");
    return 1;
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

  const apiUrl = resolveHarhubApiUrl(parsed);
  const workspaceId = resolveHarhubWorkspaceId(parsed);
  const token = resolveHarhubToken(parsed);

  if (!workspaceId) {
    console.error("A workspace is required. Run `harhub login` or pass --workspace <workspace-id>.");
    return 1;
  }

  if (!token) {
    console.error("Authentication is required. Run `harhub login` or pass --token <token>.");
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
    const uploadedAsset = response.uploaded?.[0];
    if (!uploadedAsset) throw new Error(`Harhub did not import ${skill.name}.`);
    const share = hasBooleanOption(parsed, "share")
      ? await createWorkspaceAssetShare({
          apiUrl,
          workspaceId,
          token,
          assetQuery: uploadedAsset.id
        })
      : undefined;

    uploaded.push({
      skill: skill.name,
      fileName: packaged.fileName,
      rootDir: packaged.rootDir,
      asset: uploadedAsset,
      ...(share ? { share } : {})
    });

    if (!parsed.options.json) {
      console.log(`Uploaded ${skill.name} from ${packaged.rootDir}`);
      if (share) console.log(`Share: ${share.shareUrl}`);
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

function isRemote(parsed: ParsedArgs): boolean {
  return Boolean(optionString(parsed, "workspace")) || hasBooleanOption(parsed, "remote");
}

export async function runEdit(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub skills edit <id|name|slug> [--file SKILL.md] [--content text|--content-file path]");
    return 1;
  }

  try {
    const contentValue = optionString(parsed, "content");
    const contentFile = optionString(parsed, "content-file");
    if (contentValue !== undefined && contentFile !== undefined) {
      throw new Error("Use either --content or --content-file, not both.");
    }

    const asset = await requestWorkspaceJson<AssetRecord>(parsed, `/assets/${encodeURIComponent(query)}`);
    const version = asset.version;
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
      throw new Error("The remote Skill does not have a downloadable version.");
    }
    const downloaded = await downloadWorkspaceFile(
      parsed,
      `/assets/${encodeURIComponent(query)}/versions/${version}/download`,
      `${asset.slug ?? asset.name ?? query}-v${version}.zip`
    );
    const zip = await JSZip.loadAsync(downloaded.buffer, { checkCRC32: true });
    const filePath = safeSkillFilePath(optionString(parsed, "file") ?? "SKILL.md");
    const entry = zip.file(filePath);
    if (!entry) throw new Error(`File not found in Skill package: ${filePath}`);
    const original = await entry.async("string");
    const next = contentValue !== undefined
      ? contentValue
      : contentFile !== undefined
        ? readFileSync(path.resolve(process.cwd(), contentFile), "utf8")
        : editWithConfiguredEditor(original, filePath, optionString(parsed, "editor"));
    if (next === original) {
      throw new Error("No changes were made.");
    }
    zip.file(filePath, next);
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      platform: "UNIX"
    });
    const candidates = await discoverSkillsInArchive(buffer);
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    if (!candidate || candidate.skillPath !== "SKILL.md" || candidate.rootPath !== ".") {
      throw new Error("Edited package must contain exactly one SKILL.md at its root.");
    }
    const errors = candidate.validationIssues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      throw new Error(`Edited Skill is invalid: ${errors.map((issue) => issue.message).join("; ")}`);
    }
    if (candidate.name !== asset.name) {
      throw new Error(`Editing a remote Skill cannot change its name from ${asset.name} to ${candidate.name}.`);
    }

    const context = resolveRemoteContext(parsed);
    const response = await uploadSkillZip({
      ...context,
      fileName: downloaded.fileName,
      buffer
    });
    const uploaded = response.uploaded?.[0];
    if (!uploaded) throw new Error("Harhub did not return the edited Skill version.");
    if (hasBooleanOption(parsed, "json")) {
      console.log(JSON.stringify({ asset: uploaded, file: filePath }, null, 2));
    } else {
      console.log(`Updated ${uploaded.displayName ?? uploaded.name ?? query} by uploading version ${uploaded.version}.`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function normalizeRemoteSkills(value: unknown): AssetRecord[] {
  if (Array.isArray(value)) return value as AssetRecord[];
  if (value && typeof value === "object") {
    const payload = value as { assets?: unknown; skills?: unknown };
    if (Array.isArray(payload.assets)) return payload.assets as AssetRecord[];
    if (Array.isArray(payload.skills)) return payload.skills as AssetRecord[];
  }
  throw new Error("Harhub returned an unexpected remote Skill list response.");
}

function safeSkillFilePath(value: string): string {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid Skill file path: ${value}`);
  }
  return normalized;
}

function editWithConfiguredEditor(original: string, filePath: string, configured?: string): string {
  const editor = configured ?? process.env.VISUAL ?? process.env.EDITOR;
  if (!editor) throw new Error("Set $EDITOR, pass --editor <command>, or provide --content/--content-file.");
  const directory = mkdtempSync(path.join(tmpdir(), "harhub-edit-"));
  const temporaryPath = path.join(directory, path.basename(filePath));
  try {
    writeFileSync(temporaryPath, original);
    const result = spawnSync(editor, [temporaryPath], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Editor exited with status ${result.status}.`);
    return readFileSync(temporaryPath, "utf8");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function runDelete(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub skills delete <id|name|slug>");
    return 1;
  }

  if (optionString(parsed, "workspace") || hasBooleanOption(parsed, "remote")) {
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
  const remote = optionString(parsed, "workspace") || hasBooleanOption(parsed, "remote");
  if (!remote) {
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
  method: "DELETE" | "POST",
  body: unknown,
  action: string,
  suffix?: string
): Promise<number> {
  const workspaceId = resolveHarhubWorkspaceId(parsed);
  const token = resolveHarhubToken(parsed);
  const apiUrl = resolveHarhubApiUrl(parsed);

  if (!workspaceId) {
    console.error("A workspace is required. Run `harhub login` or pass --workspace <workspace-id>.");
    return 1;
  }

  if (!token) {
    console.error("Authentication is required. Run `harhub login` or pass --token <token>.");
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
