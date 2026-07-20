import type {
  ForgeOperationStreamEvent,
  ForgeSessionDetail,
  ForgeSessionListResponse,
  ForgeSessionViewState,
  HarnessInterviewAnswer
} from "../../../../shared/types";
import { ApiRequestError, JSON_HEADERS, request } from "./request";

export function listForgeSessions(
  token: string,
  workspaceId: string
): Promise<ForgeSessionListResponse> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions`, {
    cache: "no-store",
    token
  });
}

export function createForgeSession(
  token: string,
  workspaceId: string,
  requirement: string
): Promise<ForgeSessionDetail> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ requirement }),
    cache: "no-store",
    token
  });
}

export function getForgeSession(
  token: string,
  workspaceId: string,
  sessionId: string
): Promise<ForgeSessionDetail> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions/${encodeURIComponent(sessionId)}`,
    { cache: "no-store", token }
  );
}

export function deleteForgeSession(
  token: string,
  workspaceId: string,
  sessionId: string
): Promise<void> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", cache: "no-store", token }
  );
}

export function updateForgeSessionViewState(
  token: string,
  workspaceId: string,
  sessionId: string,
  viewState: ForgeSessionViewState,
  keepalive = false
): Promise<ForgeSessionDetail> {
  return request(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions/${encodeURIComponent(sessionId)}/view-state`,
    {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(viewState),
      cache: "no-store",
      keepalive,
      token
    }
  );
}

export async function streamForgeOperation(
  token: string,
  workspaceId: string,
  sessionId: string,
  operation: "follow-up" | "generate",
  answers: HarnessInterviewAnswer[] | undefined,
  onEvent: (event: ForgeOperationStreamEvent) => void
): Promise<void> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/sessions/${encodeURIComponent(sessionId)}/${operation}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...JSON_HEADERS
      },
      body: JSON.stringify(answers?.length ? { answers } : {}),
      cache: "no-store"
    }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new ApiRequestError(
      typeof data?.error === "string"
        ? data.error
        : `Forge operation failed with ${response.status}`,
      response.status,
      data
    );
  }
  if (!response.body) throw new Error("Forge operation did not return a response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let terminal = false;

  const processLines = (flush = false) => {
    const lines = pending.split("\n");
    pending = flush ? "" : (lines.pop() ?? "");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const event = JSON.parse(line) as ForgeOperationStreamEvent;
      onEvent(event);
      if (event.type === "complete" || event.type === "error") terminal = true;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    if (pending.length > 1_000_000) {
      throw new Error("Forge operation returned an oversized stream event.");
    }
    processLines();
  }
  pending += decoder.decode();
  if (pending) pending += "\n";
  processLines(true);
  if (!terminal) throw new Error("Forge operation stream ended before a final result was saved.");
}

export async function downloadForgeTemplate(
  token: string,
  workspaceId: string,
  sessionId: string
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/forge/archive`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...JSON_HEADERS
      },
      cache: "no-store",
      body: JSON.stringify({ sessionId })
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new Error(
      typeof data?.error === "string" ? data.error : `Download failed with ${response.status}`
    );
  }

  return {
    blob: await response.blob(),
    fileName: forgeArchiveFileName(response.headers.get("content-disposition"))
  };
}

export function forgeArchiveFileName(contentDisposition: string | null): string {
  const encoded = contentDisposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return safeDownloadName(decodeURIComponent(encoded));
    } catch {
      // Use the basic filename when an intermediary returns malformed encoding.
    }
  }
  const basic = contentDisposition?.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  return safeDownloadName(basic ?? "project-harness.zip");
}

function safeDownloadName(value: string): string {
  return value.split(/[\\/]/).pop()?.trim() || "project-harness.zip";
}
