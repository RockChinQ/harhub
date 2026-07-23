import path from "node:path";

import type { ParsedArgs } from "./types.js";
import {
  resolveHarhubApiUrl,
  resolveHarhubToken,
  resolveHarhubWorkspaceId
} from "./api.js";
import { fetchHarhub } from "./http.js";

export interface RemoteContext {
  apiUrl: string;
  workspaceId: string;
  token: string;
}

export interface WorkspaceRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export function resolveRemoteContext(parsed: ParsedArgs): RemoteContext {
  const apiUrl = resolveHarhubApiUrl(parsed);
  const workspaceId = resolveHarhubWorkspaceId(parsed);
  const token = resolveHarhubToken(parsed);
  if (!workspaceId) {
    throw new Error("A workspace is required. Run `harhub login` or pass --workspace <workspace-id>.");
  }
  if (!token) {
    throw new Error("Authentication is required. Run `harhub login` or pass --token <token>.");
  }
  return { apiUrl, workspaceId, token };
}

export function workspaceApiUrl(context: RemoteContext, requestPath: string): string {
  const suffix = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  return `${context.apiUrl}/api/workspaces/${encodeURIComponent(context.workspaceId)}${suffix}`;
}

export async function requestWorkspaceResponse(
  parsed: ParsedArgs,
  requestPath: string,
  options: WorkspaceRequestOptions = {}
): Promise<Response> {
  const context = resolveRemoteContext(parsed);
  const hasBody = options.body !== undefined;
  const response = await fetchHarhub(workspaceApiUrl(context, requestPath), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${context.token}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : {})
  });
  return response;
}

export async function requestWorkspaceJson<T = unknown>(
  parsed: ParsedArgs,
  requestPath: string,
  options: WorkspaceRequestOptions = {}
): Promise<T> {
  const response = await requestWorkspaceResponse(parsed, requestPath, options);
  const data = response.status === 204
    ? undefined
    : await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : `Harhub request failed with ${response.status}.`
    );
  }
  return data as T;
}

export async function downloadWorkspaceFile(
  parsed: ParsedArgs,
  requestPath: string,
  fallbackName: string,
  options: WorkspaceRequestOptions = {}
): Promise<{ buffer: Buffer; fileName: string }> {
  const response = await requestWorkspaceResponse(parsed, requestPath, options);
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new Error(
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : `Download failed with ${response.status}.`
    );
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    fileName: contentDispositionFileName(response.headers.get("content-disposition"), fallbackName)
  };
}

export function contentDispositionFileName(value: string | null, fallbackName: string): string {
  const encoded = value?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return safeDownloadFileName(decodeURIComponent(encoded), fallbackName);
    } catch {
      // Fall through to the basic filename when an intermediary returns malformed encoding.
    }
  }
  const basic = value?.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1] ?? "";
  return safeDownloadFileName(basic, fallbackName);
}

export function safeDownloadFileName(value: string, fallbackName: string): string {
  const candidate = path.basename(value.replace(/\\/g, "/")).trim();
  const fallback = path.basename(fallbackName.replace(/\\/g, "/")).trim() || "download.zip";
  return candidate && candidate !== "." && candidate !== ".." ? candidate : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
