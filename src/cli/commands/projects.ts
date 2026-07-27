import { hasBooleanOption, optionString, optionStrings } from "../args.js";
import { requestWorkspaceJson } from "../remote.js";
import type { ParsedArgs } from "../types.js";

export async function runProjectCommand(subcommand: string, parsed: ParsedArgs): Promise<number> {
  try {
    switch (subcommand) {
      case "list":
        return output(parsed, await requestWorkspaceJson(parsed, "/projects"), "Projects");
      case "show":
        return output(parsed, await requestWorkspaceJson(parsed, projectPath(parsed)), "Project");
      case "create":
        return createProject(parsed);
      case "connect":
        return connectRepository(parsed);
      case "rotate-token":
        requireYes(parsed, "rotate this project's sync token");
        return output(parsed, await requestWorkspaceJson(parsed, `${projectPath(parsed)}/rotate-sync-token`, {
          method: "POST"
        }), "Rotated project sync token");
      case "delete":
      case "archive":
        requireYes(parsed, "archive this project");
        return output(parsed, await requestWorkspaceJson(parsed, projectPath(parsed), {
          method: "DELETE"
        }), "Archived project");
      case "inventory":
        return output(parsed, await requestWorkspaceJson(parsed, `${projectPath(parsed)}/inventory`), "Repository inventory");
      case "scan":
        return output(parsed, await requestWorkspaceJson(parsed, `${projectPath(parsed)}/scans`, {
          method: "POST"
        }), "Started repository scan");
      case "diff":
        return projectDiff(parsed);
      case "publish":
        return projectPublish(parsed);
      case "propose":
        return projectProposal(parsed);
      case "open":
        return openProposal(parsed);
      default:
        throw new Error(`Unknown projects command: ${subcommand}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function createProject(parsed: ParsedArgs): Promise<number> {
  const name = parsed.positionals[0] ?? optionString(parsed, "name");
  if (!name) throw new Error("Usage: harhub projects create <name> [--description text] [--repository owner/repo]");
  const result = await requestWorkspaceJson(parsed, "/projects", {
    method: "POST",
    body: compact({
      name,
      description: optionString(parsed, "description"),
      repository: optionString(parsed, "repository"),
      defaultBranch: optionString(parsed, "branch")
    })
  });
  return output(parsed, result, `Created project ${name}`);
}

async function connectRepository(parsed: ParsedArgs): Promise<number> {
  const projectId = requirePositional(parsed, 0, "project-id");
  const repository = parsed.positionals[1] ?? optionString(parsed, "repository");
  if (!repository) throw new Error("Usage: harhub projects connect <project-id> <owner/repository> [--branch main]");
  const result = await requestWorkspaceJson(parsed, `/projects/${encodeURIComponent(projectId)}/repository`, {
    method: "PUT",
    body: compact({ repository, defaultBranch: optionString(parsed, "branch") })
  });
  return output(parsed, result, `Connected ${repository}`);
}

async function projectDiff(parsed: ParsedArgs): Promise<number> {
  const projectId = requirePositional(parsed, 0, "project-id");
  const bindingId = requirePositional(parsed, 1, "binding-id");
  const selectedPath = optionString(parsed, "path");
  const query = selectedPath ? `?path=${encodeURIComponent(selectedPath)}` : "";
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/projects/${encodeURIComponent(projectId)}/bindings/${encodeURIComponent(bindingId)}/diff${query}`
  ), "Skill diff");
}

async function projectPublish(parsed: ParsedArgs): Promise<number> {
  const projectId = requirePositional(parsed, 0, "project-id");
  const bindingId = requirePositional(parsed, 1, "binding-id");
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/projects/${encodeURIComponent(projectId)}/bindings/${encodeURIComponent(bindingId)}/publish`,
    { method: "POST" }
  ), "Published repository Skill fork");
}

async function projectProposal(parsed: ParsedArgs): Promise<number> {
  const projectId = requirePositional(parsed, 0, "project-id");
  const kind = parsed.positionals[1] ?? optionString(parsed, "kind");
  const body = proposalBody(kind, parsed);
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/projects/${encodeURIComponent(projectId)}/proposals`,
    { method: "POST", body }
  ), `Created ${kind} proposal`);
}

async function openProposal(parsed: ParsedArgs): Promise<number> {
  const projectId = requirePositional(parsed, 0, "project-id");
  const proposalId = requirePositional(parsed, 1, "proposal-id");
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/projects/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(proposalId)}/open`,
    { method: "POST" }
  ), "Opened pull request");
}

export function proposalBody(kind: string | undefined, parsed: ParsedArgs): Record<string, unknown> {
  if (kind === "bootstrap") return { kind };
  if (kind === "add-library-skills") {
    const assetIds = optionStrings(parsed, "asset");
    if (assetIds.length === 0) throw new Error("add-library-skills requires at least one --asset <asset-id>.");
    return { kind, assetIds };
  }
  if (kind === "remove-skill") {
    const bindingId = optionString(parsed, "binding") ?? parsed.positionals[2];
    if (!bindingId) throw new Error("remove-skill requires --binding <binding-id>.");
    return { kind, bindingId };
  }
  throw new Error("Proposal kind must be bootstrap, add-library-skills, or remove-skill.");
}

function projectPath(parsed: ParsedArgs): string {
  return `/projects/${encodeURIComponent(requirePositional(parsed, 0, "project-id"))}`;
}

function requirePositional(parsed: ParsedArgs, index: number, label: string): string {
  const value = parsed.positionals[index];
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}

function requireYes(parsed: ParsedArgs, action: string): void {
  if (!hasBooleanOption(parsed, "yes")) throw new Error(`Pass --yes to ${action}.`);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function output(parsed: ParsedArgs, value: unknown, label: string): number {
  if (hasBooleanOption(parsed, "json")) {
    console.log(JSON.stringify(value, null, 2));
    return 0;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) console.log("No projects found.");
    else for (const item of value) console.log(projectLine(item));
    return 0;
  }
  if (isRecord(value)) {
    const list = Array.isArray(value.projects) ? value.projects : undefined;
    if (list) {
      if (list.length === 0) console.log("No projects found.");
      else for (const item of list) console.log(projectLine(item));
      return 0;
    }
    const project = isRecord(value.project) ? value.project : value;
    const name = typeof project.name === "string" ? project.name : undefined;
    const id = typeof project.id === "string" ? project.id : undefined;
    console.log(name || id ? `${label}: ${name ?? id}${name && id ? ` (${id})` : ""}` : label);
    if (typeof value.syncToken === "string") console.log(`Sync token: ${value.syncToken}`);
    return 0;
  }
  console.log(label);
  return 0;
}

function projectLine(value: unknown): string {
  if (!isRecord(value)) return String(value);
  return [value.id, value.name, value.status, isRecord(value.repository) ? `${value.repository.owner}/${value.repository.name}` : undefined]
    .filter((item) => typeof item === "string" && item)
    .join("\t");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
