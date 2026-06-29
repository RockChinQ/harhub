#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_CATALOG_PATH,
  createCatalog,
  readCatalog,
  writeCatalog
} from "./catalog.js";
import { createSkillSkeleton, filterCatalog, findSkill, scanSkills, validateSkills } from "./skills.js";
import type { SkillRecord, ValidationIssue } from "./types.js";

interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean | string[]>;
}

async function main(argv: string[]): Promise<number> {
  const [command, subcommand, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command !== "skills") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }

  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    printSkillsHelp();
    return 0;
  }

  const parsed = parseArgs(rest);

  switch (subcommand) {
    case "scan":
      return runScan(parsed);
    case "validate":
      return runValidate(parsed);
    case "list":
      return runList(parsed);
    case "show":
      return runShow(parsed);
    case "create":
      return runCreate(parsed);
    default:
      console.error(`Unknown skills command: ${subcommand}`);
      printSkillsHelp();
      return 1;
  }
}

function runScan(parsed: ParsedArgs): number {
  const catalogPath = resolveCatalogPath(parsed);
  const roots = parsed.positionals.length > 0 ? parsed.positionals : [process.cwd()];
  const skills = scanSkills({ roots });
  const issues = validateSkills(skills);
  const catalog = createCatalog(skills);

  mkdirSync(path.dirname(catalogPath), { recursive: true });
  writeCatalog(catalogPath, catalog);

  if (parsed.options.json) {
    console.log(JSON.stringify({ catalogPath, skills, issues }, null, 2));
    return hasErrors(issues) ? 1 : 0;
  }

  console.log(`Scanned ${skills.length} skill(s).`);
  console.log(`Catalog: ${catalogPath}`);
  printIssues(issues);
  return hasErrors(issues) ? 1 : 0;
}

function runValidate(parsed: ParsedArgs): number {
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

function runList(parsed: ParsedArgs): number {
  const catalog = readCatalog(resolveCatalogPath(parsed));
  const skills = filterCatalog(catalog, {
    tag: optionString(parsed, "tag"),
    owner: optionString(parsed, "owner"),
    packageName: optionString(parsed, "package")
  });

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

function runShow(parsed: ParsedArgs): number {
  const query = parsed.positionals[0];
  if (!query) {
    console.error("Usage: harhub skills show <id|name|slug>");
    return 1;
  }

  const catalog = readCatalog(resolveCatalogPath(parsed));
  const skill = findSkill(catalog, query);

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
  console.log(`  package: ${skill.packageName ?? "-"}`);
  console.log(`  owner: ${skill.owner ?? "-"}`);
  console.log(`  lifecycle: ${skill.lifecycleState}`);
  console.log(`  tags: ${skill.tags.join(", ") || "-"}`);
  console.log(`  agents: ${skill.agents.join(", ") || "-"}`);
  console.log(`  source: ${skill.source.path}`);
  console.log(`  hash: ${skill.contentHash.slice(0, 12)}`);
  console.log("");
  console.log(skill.description || "No description.");
  return 0;
}

function runCreate(parsed: ParsedArgs): number {
  const name = parsed.positionals[0];
  if (!name) {
    console.error("Usage: harhub skills create <name> [--dir skills]");
    return 1;
  }

  const skillPath = createSkillSkeleton({
    name,
    dir: optionString(parsed, "dir") ?? "skills",
    description: optionString(parsed, "description"),
    owner: optionString(parsed, "owner"),
    tags: optionArray(parsed, "tag")
  });

  console.log(`Created ${skillPath}`);
  return 0;
}

function parseArgs(args: string[]): ParsedArgs {
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

    if (key === "tag") {
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

function resolveCatalogPath(parsed: ParsedArgs): string {
  return path.resolve(process.cwd(), optionString(parsed, "catalog") ?? DEFAULT_CATALOG_PATH);
}

function optionString(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.options[name];
  return typeof value === "string" ? value : undefined;
}

function optionArray(parsed: ParsedArgs, name: string): string[] {
  const value = parsed.options[name];
  if (!value) return [];
  return Array.isArray(value) ? value : [String(value)];
}

function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

function printIssues(issues: ValidationIssue[]): void {
  if (issues.length === 0) {
    console.log("No validation issues.");
    return;
  }

  for (const issue of issues) {
    const where = issue.path ? ` ${path.relative(process.cwd(), issue.path)}` : "";
    console.log(`[${issue.severity}] ${issue.code}${where}: ${issue.message}`);
  }
}

function printSkillTable(skills: SkillRecord[]): void {
  const rows = skills.map((skill) => ({
    skill: skill.displayName,
    name: skill.name,
    packageName: skill.packageName ?? "-",
    owner: skill.owner ?? "-",
    lifecycle: skill.lifecycleState,
    tags: skill.tags.join(", ") || "-"
  }));
  const headers = ["skill", "name", "package", "owner", "lifecycle", "tags"];
  const widths = headers.map((header) =>
    Math.max(
      header.length,
      ...rows.map((row) =>
        String(row[header === "package" ? "packageName" : header as keyof typeof row]).length
      )
    )
  );

  console.log(headers.map((header, index) => pad(header, widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(
      [
        pad(row.skill, widths[0]),
        pad(row.name, widths[1]),
        pad(row.packageName, widths[2]),
        pad(row.owner, widths[3]),
        pad(row.lifecycle, widths[4]),
        pad(row.tags, widths[5])
      ].join("  ")
    );
  }
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function printHelp(): void {
  console.log(`Harhub

Usage:
  harhub skills <command> [options]

Run "harhub skills help" for skill management commands.`);
}

function printSkillsHelp(): void {
  console.log(`Harhub Skills MVP

Usage:
  harhub skills scan [paths...] [--catalog .harhub/skills.json] [--json]
  harhub skills validate [paths...] [--json]
  harhub skills list [--catalog .harhub/skills.json] [--tag value] [--owner value] [--package value] [--json]
  harhub skills show <id|name|slug> [--catalog .harhub/skills.json] [--json]
  harhub skills create <name> [--dir skills] [--description text] [--owner owner] [--tag value]
`);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
