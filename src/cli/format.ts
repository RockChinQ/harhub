import path from "node:path";
import type {
  AssetRecord,
  SkillRecord,
  ValidationIssue
} from "../shared/types.js";

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export function printIssues(issues: ValidationIssue[]): void {
  if (issues.length === 0) {
    console.log("No validation issues.");
    return;
  }

  for (const issue of issues) {
    const where = issue.path ? ` ${path.relative(process.cwd(), issue.path)}` : "";
    console.log(`[${issue.severity}] ${issue.code}${where}: ${issue.message}`);
  }
}

export function printSkillTable(skills: SkillRecord[]): void {
  const rows = skills.map((skill) => ({
    skill: skill.displayName,
    name: skill.name,
    packageName: skill.packageName ?? "-",
    owner: skill.owner ?? "-",
    lifecycle: skill.lifecycleState,
    tags: skill.tags.join(", ") || "-"
  }));
  const headers = ["skill", "name", "package", "owner", "lifecycle", "tags"];
  const widths = tableWidths(headers, rows);

  console.log(headers.map((header, index) => pad(header, widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log([
      pad(row.skill, widths[0]),
      pad(row.name, widths[1]),
      pad(row.packageName, widths[2]),
      pad(row.owner, widths[3]),
      pad(row.lifecycle, widths[4]),
      pad(row.tags, widths[5])
    ].join("  "));
  }
}

export function printAssetTable(assets: AssetRecord[]): void {
  const rows = assets.map((asset) => ({
    asset: asset.displayName,
    kind: asset.kind,
    packageName: asset.packageName ?? "-",
    owner: asset.owner ?? "-",
    health: asset.health,
    lifecycle: asset.lifecycleState,
    tags: asset.tags.join(", ") || "-"
  }));
  const headers = ["asset", "kind", "package", "owner", "health", "lifecycle", "tags"];
  const widths = tableWidths(headers, rows);

  console.log(headers.map((header, index) => pad(header, widths[index])).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log([
      pad(row.asset, widths[0]),
      pad(row.kind, widths[1]),
      pad(row.packageName, widths[2]),
      pad(row.owner, widths[3]),
      pad(row.health, widths[4]),
      pad(row.lifecycle, widths[5]),
      pad(row.tags, widths[6])
    ].join("  "));
  }
}

function tableWidths<T extends Record<string, string>>(
  headers: string[],
  rows: T[]
): number[] {
  return headers.map((header) =>
    Math.max(
      header.length,
      ...rows.map((row) =>
        String(row[header === "package" ? "packageName" : header as keyof T]).length
      )
    )
  );
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}
