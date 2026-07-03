import { stringValue } from "../../shared/markdown.js";

export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function displayNameFromSkillFrontmatter(input: {
  frontmatter: Record<string, unknown>;
  title?: string;
  slug: string;
}): string {
  return (
    stringValue(input.frontmatter.display_name) ??
    stringValue(input.frontmatter.displayName) ??
    input.title ??
    titleFromSlug(input.slug)
  );
}
