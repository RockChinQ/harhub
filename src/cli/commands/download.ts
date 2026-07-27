import { existsSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hasBooleanOption, optionString } from "../args.js";
import {
  downloadWorkspaceFile,
  requestWorkspaceJson
} from "../remote.js";
import type { ParsedArgs } from "../types.js";

interface RemoteAsset {
  id?: string;
  name?: string;
  slug?: string;
  displayName?: string;
  version?: number;
}

export async function runDownload(parsed: ParsedArgs): Promise<number> {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub download <asset-id|name|slug> [--version <number>] [--output <path>]");
    return 1;
  }

  try {
    const asset = await requestWorkspaceJson<RemoteAsset>(
      parsed,
      `/assets/${encodeURIComponent(query)}`
    );
    const version = readVersion(optionString(parsed, "version"), asset.version);
    const fallbackName = `${asset.slug ?? asset.name ?? query}-v${version}.zip`;
    const downloaded = await downloadWorkspaceFile(
      parsed,
      `/assets/${encodeURIComponent(query)}/versions/${version}/download`,
      fallbackName
    );
    const outputPath = resolveOutputPath(optionString(parsed, "output"), downloaded.fileName);
    if (existsSync(outputPath) && !hasBooleanOption(parsed, "yes") && !hasBooleanOption(parsed, "force")) {
      throw new Error(`${outputPath} already exists. Pass --yes to overwrite it.`);
    }
    writeFileSync(outputPath, downloaded.buffer);

    if (hasBooleanOption(parsed, "json")) {
      console.log(JSON.stringify({
        asset,
        version,
        path: outputPath,
        fileName: downloaded.fileName,
        bytes: downloaded.buffer.byteLength
      }, null, 2));
    } else {
      console.log(`Downloaded ${asset.displayName ?? asset.name ?? query} v${version} to ${outputPath}`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function readVersion(value: string | undefined, current: number | undefined): number {
  const version = value === undefined ? current : Number(value);
  if (!Number.isSafeInteger(version) || Number(version) < 1) {
    throw new Error("Version must be a positive integer.");
  }
  return Number(version);
}

function resolveOutputPath(value: string | undefined, fileName: string): string {
  const candidate = path.resolve(process.cwd(), value ?? fileName);
  return existsSync(candidate) && statSync(candidate).isDirectory()
    ? path.join(candidate, fileName)
    : candidate;
}
