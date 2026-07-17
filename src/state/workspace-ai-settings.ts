import type {
  WorkspaceAiSettings,
  WorkspaceAiSettingsUpdate
} from "../shared/types.js";
import { requireWorkspaceAdmin, requireWorkspaceMembership } from "./records.js";
import { decryptWorkspaceSecret, encryptWorkspaceSecret } from "./secrets.js";
import { loadState, saveState } from "./store.js";
import type { WorkspaceAiConfigurationRecord } from "./types.js";

export const DEFAULT_WORKSPACE_AI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_WORKSPACE_AI_MODEL = "gpt-5.6";

export interface WorkspaceAiRuntimeConfiguration {
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
}

export async function getWorkspaceAiSettings(
  accountId: string,
  workspaceId: string
): Promise<WorkspaceAiSettings> {
  const state = await loadState();
  const membership = requireWorkspaceMembership(state, accountId, workspaceId);
  const settings = state.workspaceAiConfigurations.find(
    (item) => item.workspaceId === workspaceId
  );
  return toPublicSettings(workspaceId, settings, ["owner", "admin"].includes(membership.role));
}

export async function updateWorkspaceAiSettings(
  accountId: string,
  workspaceId: string,
  input: WorkspaceAiSettingsUpdate
): Promise<WorkspaceAiSettings> {
  const state = await loadState();
  requireWorkspaceAdmin(state, accountId, workspaceId);
  if (input.provider !== "openai-compatible") throw new Error("Unsupported AI provider.");

  const current = state.workspaceAiConfigurations.find(
    (item) => item.workspaceId === workspaceId
  );
  const apiKey = input.apiKey?.trim();
  const encryptedApiKey = input.clearApiKey
    ? undefined
    : apiKey
      ? encryptWorkspaceSecret(validateApiKey(apiKey), workspaceId)
      : current?.encryptedApiKey;
  const apiKeyLastFour = input.clearApiKey
    ? undefined
    : apiKey
      ? apiKey.slice(-4)
      : current?.apiKeyLastFour;
  const next: WorkspaceAiConfigurationRecord = {
    workspaceId,
    provider: input.provider,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: normalizeModel(input.model),
    encryptedApiKey,
    apiKeyLastFour,
    updatedAt: new Date().toISOString(),
    updatedByAccountId: accountId
  };

  state.workspaceAiConfigurations = [
    ...state.workspaceAiConfigurations.filter((item) => item.workspaceId !== workspaceId),
    next
  ];
  await saveState(state);
  return toPublicSettings(workspaceId, next, true);
}

export async function getWorkspaceAiRuntimeConfiguration(
  accountId: string,
  workspaceId: string
): Promise<WorkspaceAiRuntimeConfiguration | undefined> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  const settings = state.workspaceAiConfigurations.find(
    (item) => item.workspaceId === workspaceId
  );
  if (!settings?.encryptedApiKey) return undefined;
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: decryptWorkspaceSecret(settings.encryptedApiKey, workspaceId)
  };
}

function toPublicSettings(
  workspaceId: string,
  settings: WorkspaceAiConfigurationRecord | undefined,
  canManage: boolean
): WorkspaceAiSettings {
  return {
    workspaceId,
    provider: settings?.provider ?? "openai-compatible",
    baseUrl: settings?.baseUrl ?? DEFAULT_WORKSPACE_AI_BASE_URL,
    model: settings?.model ?? DEFAULT_WORKSPACE_AI_MODEL,
    configured: Boolean(settings?.encryptedApiKey),
    apiKeyHint: settings?.apiKeyLastFour ? `••••${settings.apiKeyLastFour}` : undefined,
    updatedAt: settings?.updatedAt,
    canManage
  };
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized || normalized.length > 500) throw new Error("AI base URL is invalid.");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("AI base URL must be a valid HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("AI base URL must be an HTTP or HTTPS URL without credentials.");
  }
  if (url.search || url.hash) throw new Error("AI base URL cannot contain a query or fragment.");
  return normalized;
}

function normalizeModel(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || /\s/.test(normalized)) {
    throw new Error("AI model must be a non-empty model identifier without spaces.");
  }
  return normalized;
}

function validateApiKey(value: string): string {
  if (value.length > 8_000) throw new Error("AI API key is too long.");
  return value;
}
