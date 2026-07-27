import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function toolResult(value: unknown): CallToolResult {
  const structuredContent = asStructuredContent(value);
  return {
    content: [{
      type: "text",
      text: JSON.stringify(structuredContent, null, 2)
    }],
    structuredContent
  };
}

export function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

function asStructuredContent(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}
