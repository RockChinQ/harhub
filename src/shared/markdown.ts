import { createHash } from "node:crypto";
import YAML from "yaml";

export interface ParsedMarkdown {
  hasFrontmatter: boolean;
  frontmatterError?: string;
  frontmatter: Record<string, unknown>;
  body: string;
  title?: string;
  description: string;
  headings: string[];
  links: string[];
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const { frontmatter, body, hasFrontmatter, frontmatterError } =
    splitFrontmatter(content);
  const headings = Array.from(body.matchAll(/^#{1,6}\s+(.+)$/gm)).map((match) =>
    match[1]?.trim() ?? ""
  );
  const title = headings[0];
  const description =
    stringValue(frontmatter.description) ?? firstParagraphAfterTitle(body);
  const links = Array.from(body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)).map(
    (match) => match[1]?.trim() ?? ""
  );

  return {
    frontmatter,
    hasFrontmatter,
    frontmatterError,
    body,
    title,
    description,
    headings,
    links
  };
}

export function contentHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function splitFrontmatter(content: string): {
  hasFrontmatter: boolean;
  frontmatterError?: string;
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content.startsWith("---\n")) {
    return { hasFrontmatter: false, frontmatter: {}, body: content };
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    return {
      hasFrontmatter: false,
      frontmatterError: "YAML frontmatter is not closed.",
      frontmatter: {},
      body: content
    };
  }

  const raw = content.slice(4, end);
  const body = content.slice(end + 4).replace(/^\n/, "");

  try {
    return {
      hasFrontmatter: true,
      frontmatter: (YAML.parse(raw) as Record<string, unknown>) ?? {},
      body
    };
  } catch {
    return {
      hasFrontmatter: false,
      frontmatterError: "YAML frontmatter could not be parsed.",
      frontmatter: {},
      body: content
    };
  }
}

function firstParagraphAfterTitle(body: string): string {
  const lines = body
    .replace(/^#\s+.+$/m, "")
    .split(/\r?\n/)
    .map((line) => line.trim());

  const paragraph: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("#") || line.startsWith("```")) {
      if (paragraph.length > 0) break;
      continue;
    }

    if (line.startsWith("- ") || /^\d+\.\s/.test(line)) {
      if (paragraph.length > 0) break;
      continue;
    }

    paragraph.push(line);
  }

  return paragraph.join(" ").trim();
}
