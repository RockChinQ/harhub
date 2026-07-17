import { parse } from "yaml";

export interface ParsedSkillDocument {
  body: string;
  metadata?: Record<string, unknown>;
}

const FRONTMATTER_PATTERN = /^---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*(?:\r?\n|$)/;

export function parseSkillDocument(content: string): ParsedSkillDocument {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) return { body: content };

  try {
    const parsed = parse(match[1], { maxAliasCount: 20 });
    if (!isMetadataRecord(parsed)) return { body: content };

    return {
      metadata: parsed,
      body: content.slice(match[0].length).replace(/^\r?\n/, "")
    };
  } catch {
    return { body: content };
  }
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
