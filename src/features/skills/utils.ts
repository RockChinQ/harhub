import type { SkillLifecycleState } from "../../shared/types.js";

export function normalizeLifecycle(value: unknown): SkillLifecycleState | undefined {
  if (
    value === "experimental" ||
    value === "stable" ||
    value === "deprecated" ||
    value === "archived"
  ) {
    return value;
  }

  return undefined;
}

export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}
