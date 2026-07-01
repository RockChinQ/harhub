import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createAssetCatalog,
  filterAssets,
  findAsset,
  readAssetCatalog,
  removeCatalogAsset,
  updateCatalogAsset,
  writeAssetCatalog
} from "../../features/assets/index.js";
import {
  createSkillSkeleton,
  scanSkills,
  validateSkills
} from "../../features/skills/index.js";
import {
  optionArray,
  optionString,
  resolveAssetCatalogPath
} from "../args.js";
import {
  hasErrors,
  printAssetTable,
  printIssues
} from "../format.js";
import type { ParsedArgs } from "../types.js";

export function runAssetsScan(parsed: ParsedArgs): number {
  const catalogPath = resolveAssetCatalogPath(parsed);
  const roots = parsed.positionals.length > 0 ? parsed.positionals : [process.cwd()];
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const catalog = createAssetCatalog(skills, issues);

  writeAssetCatalog(catalogPath, catalog);

  if (parsed.options.json) {
    console.log(JSON.stringify({ catalogPath, assets: catalog.assets, skills, issues }, null, 2));
    return hasErrors(issues) ? 1 : 0;
  }

  console.log(`Scanned ${catalog.assets.length} asset(s).`);
  console.log(`Skill assets: ${skills.length}`);
  console.log(`Catalog: ${catalogPath}`);
  printIssues(issues);
  return hasErrors(issues) ? 1 : 0;
}

export function runAssetsValidate(parsed: ParsedArgs): number {
  const roots = parsed.positionals.length > 0 ? parsed.positionals : [process.cwd()];
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const catalog = createAssetCatalog(skills, issues);

  if (parsed.options.json) {
    console.log(JSON.stringify({ assets: catalog.assets, skills, issues }, null, 2));
    return hasErrors(issues) ? 1 : 0;
  }

  console.log(`Validated ${catalog.assets.length} asset(s).`);
  printIssues(issues);
  return hasErrors(issues) ? 1 : 0;
}

export function runAssetsList(parsed: ParsedArgs): number {
  const assets = filterAssets(readAssetCatalog(resolveAssetCatalogPath(parsed)), {
    kind: optionString(parsed, "kind"),
    tag: optionString(parsed, "tag"),
    owner: optionString(parsed, "owner"),
    packageName: optionString(parsed, "package")
  });

  if (parsed.options.json) {
    console.log(JSON.stringify(assets, null, 2));
    return 0;
  }

  if (assets.length === 0) {
    console.log("No assets matched.");
    return 0;
  }

  printAssetTable(assets);
  return 0;
}

export function runAssetsShow(parsed: ParsedArgs): number {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub assets show <id|name|slug>");
    return 1;
  }

  const asset = findAsset(readAssetCatalog(resolveAssetCatalogPath(parsed)), query);
  if (!asset) {
    console.error(`Asset not found: ${query}`);
    return 1;
  }

  if (parsed.options.json) {
    console.log(JSON.stringify(asset, null, 2));
    return 0;
  }

  console.log(`${asset.displayName}`);
  console.log(`  id: ${asset.id}`);
  console.log(`  kind: ${asset.kind}`);
  console.log(`  name: ${asset.name}`);
  console.log(`  package: ${asset.packageName ?? "-"}`);
  console.log(`  owner: ${asset.owner ?? "-"}`);
  console.log(`  lifecycle: ${asset.lifecycleState}`);
  console.log(`  health: ${asset.health}`);
  console.log(`  tags: ${asset.tags.join(", ") || "-"}`);
  console.log(`  source: ${asset.source?.path ?? "-"}`);
  console.log("");
  console.log(asset.description || "No description.");
  return 0;
}

export function runAssetsCreate(parsed: ParsedArgs): number {
  const kind = optionString(parsed, "kind") ?? "skill";
  if (kind !== "skill") {
    console.error("Only skill assets are supported in this MVP.");
    return 1;
  }

  const name = parsed.positionals[0];
  if (!name) {
    console.error("Usage: harhub assets create <name> [--kind skill] [--dir skills]");
    return 1;
  }

  const skillPath = createSkillSkeleton({
    name,
    dir: optionString(parsed, "dir") ?? "skills",
    description: optionString(parsed, "description"),
    owner: optionString(parsed, "owner"),
    tags: optionArray(parsed, "tag")
  });

  console.log(`Created skill asset ${skillPath}`);
  return 0;
}

export async function runAssetsUpload(parsed: ParsedArgs): Promise<number> {
  const zipPath = parsed.positionals[0];
  const workspaceId = optionString(parsed, "workspace");
  const token = optionString(parsed, "token") ?? process.env.HARHUB_TOKEN;
  const api = (optionString(parsed, "api") ?? "http://127.0.0.1:3310").replace(/\/+$/g, "");

  if (!zipPath || !workspaceId) {
    console.error("Usage: harhub assets upload <skill.zip> --workspace <workspace-id> --token <token>");
    return 1;
  }

  if (!token) {
    console.error("A token is required. Pass --token or set HARHUB_TOKEN.");
    return 1;
  }

  const absolutePath = path.resolve(process.cwd(), zipPath);
  const form = new FormData();
  form.set(
    "file",
    new Blob([readFileSync(absolutePath)], { type: "application/zip" }),
    path.basename(absolutePath)
  );

  setUploadMetadata(form, parsed);
  const response = await fetch(`${api}/api/workspaces/${workspaceId}/assets/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    console.error(typeof data?.error === "string" ? data.error : `Upload failed with ${response.status}`);
    return 1;
  }

  if (parsed.options.json) {
    console.log(JSON.stringify(data, null, 2));
    return 0;
  }

  console.log(`Uploaded ${data.uploaded?.displayName ?? path.basename(absolutePath)}`);
  console.log(`Object: ${data.uploaded?.storage?.key ?? "-"}`);
  return 0;
}

export async function runAssetsUpdate(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub assets update <id|name|slug> [--description text] [--owner owner] [--tag value]");
    return 1;
  }

  const input = readAssetUpdateInput(parsed);
  if (optionString(parsed, "workspace")) {
    return runAssetApiMutation(parsed, query, "PATCH", input, "Updated");
  }

  const catalogPath = resolveAssetCatalogPath(parsed);
  const catalog = readAssetCatalog(catalogPath);
  const asset = findAsset(catalog, query);
  if (!asset) {
    console.error(`Asset not found: ${query}`);
    return 1;
  }

  const nextCatalog = updateCatalogAsset(catalog, asset.id, input);
  writeAssetCatalog(catalogPath, nextCatalog);

  if (parsed.options.json) {
    console.log(JSON.stringify(findAsset(nextCatalog, asset.id), null, 2));
    return 0;
  }

  console.log(`Updated ${asset.displayName}`);
  return 0;
}

export async function runAssetsDelete(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub assets delete <id|name|slug>");
    return 1;
  }

  if (optionString(parsed, "workspace")) {
    return runAssetApiMutation(parsed, query, "DELETE", undefined, "Deleted");
  }

  const catalogPath = resolveAssetCatalogPath(parsed);
  const catalog = readAssetCatalog(catalogPath);
  const asset = findAsset(catalog, query);
  if (!asset) {
    console.error(`Asset not found: ${query}`);
    return 1;
  }

  writeAssetCatalog(catalogPath, removeCatalogAsset(catalog, asset.id));

  if (parsed.options.json) {
    console.log(JSON.stringify({ deleted: asset }, null, 2));
    return 0;
  }

  console.log(`Deleted ${asset.displayName}`);
  return 0;
}

export async function runAssetsRevalidate(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  const workspaceId = optionString(parsed, "workspace");
  if (!workspaceId) {
    return runAssetsValidate(parsed);
  }

  return runAssetApiMutation(
    parsed,
    query,
    "POST",
    {},
    query ? "Validated" : "Validated workspace",
    "validate"
  );
}

function setUploadMetadata(form: FormData, parsed: ParsedArgs): void {
  const name = optionString(parsed, "name");
  const description = optionString(parsed, "description");
  const owner = optionString(parsed, "owner");
  const tags = optionArray(parsed, "tag");
  if (name) form.set("name", name);
  if (description) form.set("description", description);
  if (owner) form.set("owner", owner);
  if (tags.length > 0) form.set("tags", tags.join(","));
}

function readAssetUpdateInput(parsed: ParsedArgs) {
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

async function runAssetApiMutation(
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

  const pathParts = [`${api}/api/workspaces/${workspaceId}/assets`];
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

  const label = data?.validated?.displayName ?? data?.uploaded?.displayName ?? query ?? "workspace";
  const issueCount = Array.isArray(data?.validatedIssues)
    ? data.validatedIssues.length
    : Array.isArray(data?.issues) ? data.issues.length : undefined;
  console.log(`${action} ${label}${issueCount === undefined ? "" : ` (${issueCount} issue(s))`}`);
  return 0;
}
