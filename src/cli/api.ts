import type { ParsedArgs } from "./types.js";
import { optionString } from "./args.js";

export function resolveHarhubApiUrl(parsed: ParsedArgs): string {
  return (
    optionString(parsed, "url") ??
    optionString(parsed, "api") ??
    process.env.HARHUB_URL ??
    process.env.HARHUB_API_URL ??
    "http://127.0.0.1:3310"
  ).replace(/\/+$/g, "");
}

export function resolveHarhubToken(parsed: ParsedArgs): string | undefined {
  return (
    optionString(parsed, "token") ??
    process.env.HARHUB_TOKEN ??
    process.env.HARHUB_ACCESS_TOKEN
  );
}

export function resolveHarhubWorkspaceId(parsed: ParsedArgs): string | undefined {
  return (
    optionString(parsed, "workspace") ??
    process.env.HARHUB_WORKSPACE_ID ??
    process.env.HARHUB_WORKSPACE
  );
}

export async function uploadSkillZip(input: {
  apiUrl: string;
  workspaceId: string;
  token: string;
  fileName: string;
  buffer: Buffer;
}): Promise<Record<string, any>> {
  const form = new FormData();
  const bytes = new Uint8Array(input.buffer.byteLength);
  bytes.set(input.buffer);

  form.set(
    "file",
    new Blob([bytes], { type: "application/zip" }),
    input.fileName
  );

  const response = await fetch(
    `${input.apiUrl}/api/workspaces/${input.workspaceId}/assets/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`
      },
      body: form
    }
  );
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Upload failed with ${response.status}`
    );
  }

  return data as Record<string, any>;
}
