import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createWorkspaceAssetShare,
  DEFAULT_HARHUB_API_URL,
  downloadPublicAssetShare,
  getPublicAssetShare,
  resolveHarhubApiUrl,
  resolveHarhubToken,
  resolveHarhubWorkspaceId,
  revokeWorkspaceAssetShare
} from "../api.js";
import type { ParsedArgs } from "../types.js";
import { optionString } from "../args.js";
import { extractSkillArchive, installSkillDirectory } from "../skills-installer.js";

export async function runInstall(parsed: ParsedArgs): Promise<number> {
  const reference = parsed.positionals[0];
  if (!reference) {
    console.error("Usage: harhub install <share-url|token>");
    return 1;
  }

  const target = resolveShareReference(reference, resolveHarhubApiUrl(parsed));
  const share = await getPublicAssetShare(target.apiUrl, target.token);
  const buffer = await downloadPublicAssetShare(share.downloadUrl);

  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-install-"));
  try {
    await extractSkillArchive(buffer, temporaryDirectory);
    const result = await installSkillDirectory(temporaryDirectory, {
      agents: parseAgents(optionString(parsed, "agent")),
      global: hasBooleanOption(parsed, "global"),
      copy: hasBooleanOption(parsed, "copy"),
      yes: hasBooleanOption(parsed, "yes"),
      all: hasBooleanOption(parsed, "all"),
      json: hasBooleanOption(parsed, "json")
    });
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() || result.stdout.trim() || `skills installer exited with code ${result.exitCode}.`
      );
    }

    if (hasBooleanOption(parsed, "json")) {
      console.log(JSON.stringify({
        share,
        installed: true,
        installer: "skills",
        output: result.stdout.trim()
      }, null, 2));
    } else {
      console.log(`Installed ${share.asset.displayName}.`);
    }
    return 0;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function runShare(parsed: ParsedArgs): Promise<number> {
  const assetQuery = parsed.positionals[0];
  if (!assetQuery) {
    console.error("Usage: harhub share <asset-id|name|slug>");
    return 1;
  }

  const connection = authenticatedConnection(parsed);
  if (!connection) return 1;
  const share = await createWorkspaceAssetShare({ ...connection, assetQuery });

  if (parsed.options.json) {
    console.log(JSON.stringify(share, null, 2));
  } else {
    console.log(`Shared ${share.asset.displayName}`);
    console.log(`URL: ${share.shareUrl}`);
    console.log(`Harhub CLI: ${share.cliCommand}`);
    console.log(`Skills CLI: ${share.skillsCliCommand}`);
  }
  return 0;
}

function parseAgents(value: string | undefined): string[] | undefined {
  const agents = value?.split(",").map((agent) => agent.trim()).filter(Boolean);
  return agents && agents.length > 0 ? agents : undefined;
}

function hasBooleanOption(parsed: ParsedArgs, name: string): boolean {
  const value = parsed.options[name];
  return value === true || value === "true";
}

export async function runUnshare(parsed: ParsedArgs): Promise<number> {
  const assetQuery = parsed.positionals[0];
  if (!assetQuery) {
    console.error("Usage: harhub unshare <asset-id|name|slug>");
    return 1;
  }

  const connection = authenticatedConnection(parsed);
  if (!connection) return 1;
  await revokeWorkspaceAssetShare({ ...connection, assetQuery });

  if (parsed.options.json) {
    console.log(JSON.stringify({ unshared: assetQuery }, null, 2));
  } else {
    console.log(`Stopped sharing ${assetQuery}.`);
  }
  return 0;
}

export function resolveShareReference(
  reference: string,
  fallbackApiUrl = DEFAULT_HARHUB_API_URL
): { apiUrl: string; token: string } {
  if (/^https?:\/\//i.test(reference)) {
    const url = new URL(reference);
    const match = url.pathname.match(/\/(?:s|api\/public\/shares)\/([^/]+)(?:\/download)?\/?$/);
    if (!match) throw new Error("The URL is not a Harhub share URL.");
    return {
      apiUrl: url.origin,
      token: decodeURIComponent(match[1])
    };
  }

  if (!/^[A-Za-z0-9_-]+$/.test(reference)) {
    throw new Error("The share token is invalid.");
  }
  return { apiUrl: fallbackApiUrl.replace(/\/+$/g, ""), token: reference };
}

function authenticatedConnection(parsed: ParsedArgs): {
  apiUrl: string;
  workspaceId: string;
  token: string;
} | undefined {
  const apiUrl = resolveHarhubApiUrl(parsed);
  const workspaceId = resolveHarhubWorkspaceId(parsed);
  const token = resolveHarhubToken(parsed);
  if (!workspaceId) {
    console.error("A workspace is required. Run `harhub login` or pass --workspace <workspace-id>.");
    return undefined;
  }
  if (!token) {
    console.error("Authentication is required. Run `harhub login` or pass --token <token>.");
    return undefined;
  }
  return { apiUrl, workspaceId, token };
}
