import { spawn } from "node:child_process";

import { hasBooleanOption, optionString } from "../args.js";
import { requestWorkspaceJson } from "../remote.js";
import type { ParsedArgs } from "../types.js";
import { proposalBody } from "./projects.js";

export async function runRepositoryCommand(subcommand: string, parsed: ParsedArgs): Promise<number> {
  try {
    switch (subcommand) {
      case "status":
        return output(parsed, await requestWorkspaceJson(parsed, "/github/status"), "GitHub integration");
      case "authorize":
        return authorize(parsed);
      case "installations":
        return output(parsed, await requestWorkspaceJson(parsed, "/github/installations"), "GitHub installations");
      case "list":
        return listRepositories(parsed);
      case "import":
        return importRepository(parsed);
      case "connect":
        return connectRepository(parsed);
      case "inventory":
        return output(parsed, await requestWorkspaceJson(parsed, `${projectPath(parsed)}/inventory`), "Repository inventory");
      case "scan":
        return output(parsed, await requestWorkspaceJson(parsed, `${projectPath(parsed)}/scans`, {
          method: "POST"
        }), "Started repository scan");
      case "policy":
        return updatePolicy(parsed);
      case "propose":
        return createProposal(parsed);
      case "open":
        return openProposal(parsed);
      default:
        throw new Error(`Unknown repositories command: ${subcommand}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function authorize(parsed: ParsedArgs): Promise<number> {
  const result = await requestWorkspaceJson<{ url: string }>(parsed, "/github/installations/authorize", {
    method: "POST",
    body: { redirectPath: optionString(parsed, "redirect") ?? "/projects" }
  });
  if (hasBooleanOption(parsed, "open")) openBrowser(result.url);
  return output(parsed, result, "GitHub App authorization URL");
}

async function listRepositories(parsed: ParsedArgs): Promise<number> {
  const installationId = requirePositional(parsed, 0, "installation-id");
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/github/installations/${encodeURIComponent(installationId)}/repositories`
  ), "GitHub repositories");
}

async function importRepository(parsed: ParsedArgs): Promise<number> {
  const installationId = requirePositional(parsed, 0, "installation-id");
  const repositoryId = requirePositional(parsed, 1, "repository-id");
  return output(parsed, await requestWorkspaceJson(parsed, "/github/repositories/import", {
    method: "POST",
    body: { installationId, repositoryId }
  }), "Imported GitHub repository");
}

async function connectRepository(parsed: ParsedArgs): Promise<number> {
  const projectId = requirePositional(parsed, 0, "project-id");
  const installationId = requirePositional(parsed, 1, "installation-id");
  const repositoryId = requirePositional(parsed, 2, "repository-id");
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/projects/${encodeURIComponent(projectId)}/github/connect`,
    { method: "POST", body: { installationId, repositoryId } }
  ), "Connected GitHub App repository");
}

async function updatePolicy(parsed: ParsedArgs): Promise<number> {
  const projectId = requirePositional(parsed, 0, "project-id");
  const artifactPath = requirePositional(parsed, 1, "artifact-path");
  const ownership = optionString(parsed, "ownership");
  if (ownership !== "library" && ownership !== "repository" && ownership !== "ignored") {
    throw new Error("--ownership must be library, repository, or ignored.");
  }
  const libraryAssetId = optionString(parsed, "library-asset");
  if (ownership === "library" && !libraryAssetId) {
    throw new Error("Library ownership requires --library-asset <asset-id>.");
  }
  const pinnedVersion = optionalPositiveInteger(optionString(parsed, "pinned-version"), "pinned version");
  const body = compact({ artifactPath, ownership, libraryAssetId, pinnedVersion });
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/projects/${encodeURIComponent(projectId)}/inventory/policies`,
    { method: "PUT", body }
  ), "Updated repository ownership policy");
}

async function createProposal(parsed: ParsedArgs): Promise<number> {
  const projectId = requirePositional(parsed, 0, "project-id");
  const kind = parsed.positionals[1] ?? optionString(parsed, "kind");
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/projects/${encodeURIComponent(projectId)}/proposals`,
    { method: "POST", body: proposalBody(kind, parsed) }
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

function projectPath(parsed: ParsedArgs): string {
  return `/projects/${encodeURIComponent(requirePositional(parsed, 0, "project-id"))}`;
}

function requirePositional(parsed: ParsedArgs, index: number, label: string): string {
  const value = parsed.positionals[index];
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}

function optionalPositiveInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function output(parsed: ParsedArgs, value: unknown, label: string): number {
  if (hasBooleanOption(parsed, "json")) {
    console.log(JSON.stringify(value, null, 2));
    return 0;
  }
  if (isRecord(value)) {
    const list = Array.isArray(value.repositories)
      ? value.repositories
      : Array.isArray(value.installations)
        ? value.installations
        : undefined;
    if (list) {
      if (list.length === 0) console.log(`No ${label.toLowerCase()} found.`);
      else for (const item of list) console.log(recordLine(item));
      return 0;
    }
    if (typeof value.url === "string") {
      console.log(value.url);
      return 0;
    }
  }
  console.log(label);
  return 0;
}

function recordLine(value: unknown): string {
  if (!isRecord(value)) return String(value);
  const repository = isRecord(value.repository) ? value.repository : value;
  return [repository.id, repository.fullName, repository.name, repository.accountLogin]
    .filter((item) => typeof item === "string" && item)
    .join("\t");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin"
    ? { file: "open", args: [url] }
    : process.platform === "win32"
      ? { file: "cmd.exe", args: ["/d", "/s", "/c", "start", "", url] }
      : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
}
