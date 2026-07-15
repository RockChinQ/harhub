import type { ParsedArgs } from "./types.js";
import type {
  AssetShareResponse,
  SessionPayload
} from "../shared/types.js";
import {
  HARHUB_CLI_CLIENT_ID,
  HARHUB_CLI_SCOPE,
  OAUTH_DEVICE_GRANT_TYPE,
  type OAuthDeviceAuthorizationResponse,
  type OAuthDeviceTokenError,
  type OAuthDeviceTokenResponse
} from "../shared/oauth.js";
import { optionString } from "./args.js";
import { readCliConfig } from "./config.js";
import { fetchHarhub } from "./http.js";

export const DEFAULT_HARHUB_API_URL = "https://harhub.rcpd.cc";

export function resolveHarhubApiUrl(parsed: ParsedArgs): string {
  return normalizeApiUrl(
    explicitHarhubApiUrl(parsed) ?? DEFAULT_HARHUB_API_URL
  );
}

export function resolveHarhubToken(parsed: ParsedArgs): string | undefined {
  return (
    optionString(parsed, "token") ??
    process.env.HARHUB_TOKEN ??
    process.env.HARHUB_ACCESS_TOKEN ??
    readCliConfigForTarget(parsed)?.accessToken
  );
}

export function resolveHarhubWorkspaceId(parsed: ParsedArgs): string | undefined {
  return (
    optionString(parsed, "workspace") ??
    process.env.HARHUB_WORKSPACE_ID ??
    process.env.HARHUB_WORKSPACE ??
    readCliConfigForTarget(parsed)?.workspaceId
  );
}

function readCliConfigForTarget(parsed: ParsedArgs) {
  const config = readCliConfig();
  const targetApiUrl = normalizeApiUrl(
    explicitHarhubApiUrl(parsed) ?? DEFAULT_HARHUB_API_URL
  );
  if (config && normalizeApiUrl(config.apiUrl) !== targetApiUrl) {
    return undefined;
  }
  return config;
}

function explicitHarhubApiUrl(parsed: ParsedArgs): string | undefined {
  return optionString(parsed, "url") ?? optionString(parsed, "api");
}

function normalizeApiUrl(value: string): string {
  return value.replace(/\/+$/g, "");
}

export async function requestDeviceAuthorization(
  apiUrl: string
): Promise<OAuthDeviceAuthorizationResponse> {
  return requestForm<OAuthDeviceAuthorizationResponse>(
    `${apiUrl}/api/oauth/device/code`,
    {
      client_id: HARHUB_CLI_CLIENT_ID,
      scope: HARHUB_CLI_SCOPE
    }
  );
}

export async function pollDeviceToken(
  apiUrl: string,
  deviceCode: string
): Promise<OAuthDeviceTokenResponse | OAuthDeviceTokenError> {
  const response = await fetchHarhub(`${apiUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: OAUTH_DEVICE_GRANT_TYPE,
      device_code: deviceCode,
      client_id: HARHUB_CLI_CLIENT_ID
    })
  });
  const data = await response.json().catch(() => undefined);
  if (isDeviceTokenResponse(data) || isDeviceTokenError(data)) return data;
  throw new Error(`OAuth token request failed with ${response.status}.`);
}

export async function getHarhubSession(
  apiUrl: string,
  token: string
): Promise<SessionPayload> {
  const response = await fetchHarhub(`${apiUrl}/api/session`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Session request failed with ${response.status}.`
    );
  }
  return data as SessionPayload;
}

export async function revokeHarhubSession(
  apiUrl: string,
  token: string
): Promise<void> {
  const response = await fetchHarhub(`${apiUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(`Logout request failed with ${response.status}.`);
  }
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

  const response = await fetchHarhub(
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

export async function createWorkspaceAssetShare(input: {
  apiUrl: string;
  workspaceId: string;
  token: string;
  assetQuery: string;
}): Promise<AssetShareResponse> {
  return requestAssetShare(input, "POST");
}

export async function revokeWorkspaceAssetShare(input: {
  apiUrl: string;
  workspaceId: string;
  token: string;
  assetQuery: string;
}): Promise<void> {
  const response = await fetchHarhub(assetShareApiUrl(input), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${input.token}` }
  });
  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => undefined);
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Unshare failed with ${response.status}.`
    );
  }
}

export async function getPublicAssetShare(
  apiUrl: string,
  shareToken: string
): Promise<AssetShareResponse> {
  const response = await fetchHarhub(
    `${apiUrl}/api/public/shares/${encodeURIComponent(shareToken)}`
  );
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Share request failed with ${response.status}.`
    );
  }
  return data as AssetShareResponse;
}

export async function downloadPublicAssetShare(downloadUrl: string): Promise<Buffer> {
  const response = await fetchHarhub(downloadUrl);
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Download failed with ${response.status}.`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function requestAssetShare(
  input: {
    apiUrl: string;
    workspaceId: string;
    token: string;
    assetQuery: string;
  },
  method: "POST" | "GET"
): Promise<AssetShareResponse> {
  const response = await fetchHarhub(assetShareApiUrl(input), {
    method,
    headers: { Authorization: `Bearer ${input.token}` }
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Share request failed with ${response.status}.`
    );
  }
  return data as AssetShareResponse;
}

function assetShareApiUrl(input: {
  apiUrl: string;
  workspaceId: string;
  assetQuery: string;
}): string {
  return `${input.apiUrl}/api/workspaces/${encodeURIComponent(input.workspaceId)}/assets/${encodeURIComponent(input.assetQuery)}/share`;
}

async function requestForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetchHarhub(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(
      typeof data?.error_description === "string"
        ? data.error_description
        : typeof data?.error === "string"
          ? data.error
          : `Request failed with ${response.status}.`
    );
  }
  return data as T;
}

function isDeviceTokenResponse(value: unknown): value is OAuthDeviceTokenResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as OAuthDeviceTokenResponse).access_token === "string" &&
      (value as OAuthDeviceTokenResponse).token_type === "Bearer"
  );
}

function isDeviceTokenError(value: unknown): value is OAuthDeviceTokenError {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as OAuthDeviceTokenError).error === "string"
  );
}
