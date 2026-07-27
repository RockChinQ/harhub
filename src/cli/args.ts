import path from "node:path";
import { DEFAULT_ASSET_CATALOG_PATH } from "../features/assets/index.js";
import { DEFAULT_CATALOG_PATH } from "../features/skills/index.js";
import type { ParsedArgs } from "./types.js";

interface ShortOption {
  name: string;
  value: boolean;
}

const SHORT_OPTIONS: Record<string, ShortOption> = {
  a: { name: "all", value: false },
  b: { name: "branch", value: true },
  c: { name: "content", value: true },
  d: { name: "description", value: true },
  f: { name: "file", value: true },
  g: { name: "global", value: false },
  h: { name: "help", value: false },
  j: { name: "json", value: false },
  o: { name: "output", value: true },
  r: { name: "remote", value: false },
  t: { name: "token", value: true },
  u: { name: "url", value: true },
  v: { name: "version", value: true },
  w: { name: "workspace", value: true },
  y: { name: "yes", value: false }
};

const BOOLEAN_LONG_OPTIONS = new Set([
  "all",
  "copy",
  "force",
  "global",
  "help",
  "json",
  "no-browser",
  "no-interactive",
  "open",
  "remote",
  "share",
  "yes"
]);

const VALUE_LONG_OPTIONS = new Set([
  "agent",
  "answer",
  "answers-file",
  "asset",
  "asset-catalog",
  "binding",
  "branch",
  "catalog",
  "content",
  "content-file",
  "description",
  "dir",
  "editor",
  "file",
  "installation",
  "kind",
  "library-asset",
  "name",
  "output",
  "ownership",
  "path",
  "pinned-version",
  "project",
  "proposal",
  "redirect",
  "repository",
  "repository-id",
  "requirement",
  "requirement-file",
  "selected-file",
  "state",
  "tab",
  "token",
  "url",
  "version",
  "workspace"
]);

export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean | string[]> = {};
  let terminated = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (terminated) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      terminated = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const rawOption = arg.slice(2);
      const equalsIndex = rawOption.indexOf("=");
      const rawKey = equalsIndex >= 0 ? rawOption.slice(0, equalsIndex) : rawOption;
      const inlineValue = equalsIndex >= 0 ? rawOption.slice(equalsIndex + 1) : undefined;
      if (!rawKey) throw new Error("Invalid option: --");
      if (inlineValue !== undefined) {
        setOption(options, rawKey, inlineValue);
        continue;
      }
      if (BOOLEAN_LONG_OPTIONS.has(rawKey)) {
        setOption(options, rawKey, true);
        continue;
      }
      const value = args[index + 1];
      if (VALUE_LONG_OPTIONS.has(rawKey)) {
        if (value === undefined || value === "--") {
          throw new Error(`Option --${rawKey} requires a value.`);
        }
        index += 1;
        setOption(options, rawKey, value);
        continue;
      }
      if (value === undefined || value === "--" || value.startsWith("--")) {
        setOption(options, rawKey, true);
        continue;
      }
      index += 1;
      setOption(options, rawKey, value);
      continue;
    }
    if (arg.startsWith("-") && arg !== "-") {
      index = parseShortOptions(args, index, options);
      continue;
    }
    positionals.push(arg);
  }

  return { positionals, options };
}

function parseShortOptions(
  args: string[],
  index: number,
  options: Record<string, string | boolean | string[]>
): number {
  const raw = args[index].slice(1);
  for (let offset = 0; offset < raw.length; offset += 1) {
    const shortName = raw[offset];
    const definition = SHORT_OPTIONS[shortName];
    if (!definition) throw new Error(`Unknown short option: -${shortName}`);
    if (!definition.value) {
      setOption(options, definition.name, true);
      continue;
    }

    let value = raw.slice(offset + 1);
    if (value.startsWith("=")) value = value.slice(1);
    if (!value) {
      value = args[index + 1] ?? "";
      if (!value || value === "--") throw new Error(`Option -${shortName} requires a value.`);
      index += 1;
    }
    setOption(options, definition.name, value);
    return index;
  }
  return index;
}

function setOption(
  options: Record<string, string | boolean | string[]>,
  name: string,
  value: string | boolean
): void {
  const current = options[name];
  if (current === undefined || (current === true && value === true)) {
    options[name] = value;
    return;
  }
  const values = Array.isArray(current) ? current : [String(current)];
  values.push(String(value));
  options[name] = values;
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
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.at(-1);
  return undefined;
}

export function optionStrings(parsed: ParsedArgs, name: string): string[] {
  const value = parsed.options[name];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}

export function hasBooleanOption(parsed: ParsedArgs, name: string): boolean {
  const value = parsed.options[name];
  return value === true || value === "true" || (Array.isArray(value) && value.at(-1) === "true");
}
