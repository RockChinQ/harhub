import { existsSync, writeFileSync } from "node:fs";
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

export async function runInstall(parsed: ParsedArgs): Promise<number> {
  const reference = parsed.positionals[0];
  if (!reference) {
    console.error("Usage: harhub install <share-url|token>");
    return 1;
  }

  const target = resolveShareReference(reference, resolveHarhubApiUrl(parsed));
  const share = await getPublicAssetShare(target.apiUrl, target.token);
  const buffer = await downloadPublicAssetShare(share.downloadUrl);
  const outputPath = availableDownloadPath(process.cwd(), share.fileName);
  writeFileSync(outputPath, buffer, { flag: "wx" });

  if (parsed.options.json) {
    console.log(JSON.stringify({ share, path: outputPath, bytes: buffer.byteLength }, null, 2));
  } else {
    console.log(`Downloaded ${share.asset.displayName} to ${outputPath}`);
  }
  return 0;
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
    console.log(`CLI: ${share.cliCommand}`);
  }
  return 0;
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

function availableDownloadPath(directory: string, requestedName: string): string {
  const safeName = safeZipName(requestedName);
  const extension = path.extname(safeName);
  const stem = path.basename(safeName, extension);
  let candidate = path.join(directory, safeName);
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = path.join(directory, `${stem}-${suffix}${extension}`);
    suffix += 1;
  }
  return candidate;
}

function safeZipName(value: string): string {
  const baseName = path.basename(value.replaceAll("\\", "/"));
  const cleaned = baseName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const name = cleaned || "skill.zip";
  return name.toLowerCase().endsWith(".zip") ? name : `${name}.zip`;
}
