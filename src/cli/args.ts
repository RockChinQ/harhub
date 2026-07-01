import path from "node:path";
import { DEFAULT_ASSET_CATALOG_PATH } from "../features/assets/index.js";
import { DEFAULT_CATALOG_PATH } from "../features/skills/index.js";
import type { ParsedArgs } from "./types.js";

export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean | string[]> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey;
    const value = inlineValue ?? args[index + 1];

    if (inlineValue === undefined && (!value || value.startsWith("--"))) {
      options[key] = true;
      continue;
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    if (key === "tag" || key === "agent") {
      const current = options[key];
      options[key] = Array.isArray(current)
        ? [...current, value]
        : current
          ? [String(current), value]
          : [value];
    } else {
      options[key] = value;
    }
  }

  return { positionals, options };
}

export function resolveCatalogPath(parsed: ParsedArgs): string {
  return path.resolve(process.cwd(), optionString(parsed, "catalog") ?? DEFAULT_CATALOG_PATH);
}

export function resolveAssetCatalogPath(
  parsed: ParsedArgs,
  allowCatalogAlias = true
): string {
  return path.resolve(
    process.cwd(),
    optionString(parsed, "asset-catalog") ??
      (allowCatalogAlias ? optionString(parsed, "catalog") : undefined) ??
      DEFAULT_ASSET_CATALOG_PATH
  );
}

export function optionString(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.options[name];
  return typeof value === "string" ? value : undefined;
}

export function optionArray(parsed: ParsedArgs, name: string): string[] {
  const value = parsed.options[name];
  if (!value) return [];
  return Array.isArray(value) ? value : [String(value)];
}
