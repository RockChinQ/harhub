import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

import {
  createWorkspaceAssetShare,
  downloadPublicAssetShare,
  getHarhubSession,
  getPublicAssetShare,
  revokeWorkspaceAssetShare,
  uploadSkillZip
} from "../cli/api.js";
import {
  HarhubWorkspaceClient,
  type RemoteContext
} from "../cli/remote.js";
import {
  extractSkillArchive,
  installSkillDirectory
} from "../cli/skills-installer.js";
import {
  discoverSkillsInArchive,
  packageSkillDirectory,
  scanSkills,
  validateSkills
} from "../features/skills/index.js";
import type { AssetRecord } from "../shared/types.js";
import { AllowedPaths } from "./paths.js";

export interface ForgeAnswer {
  question: string;
  answer: string;
  lens?: string;
  gap?: string;
  intent?: string;
}

export class HarhubMcpClient {
  readonly workspace: HarhubWorkspaceClient;

  constructor(
    readonly context: RemoteContext,
    readonly paths = new AllowedPaths()
  ) {
    this.workspace = new HarhubWorkspaceClient(context);
  }

  session(): Promise<Awaited<ReturnType<typeof getHarhubSession>>> {
    return getHarhubSession(this.context.apiUrl, this.context.token);
  }

  json<T = unknown>(
    requestPath: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    return this.workspace.json<T>(requestPath, options);
  }

  async downloadAsset(input: {
    asset: string;
    version?: number;
    output?: string;
    overwrite?: boolean;
  }): Promise<Record<string, unknown>> {
    const asset = await this.json<AssetRecord>(`/assets/${encodeURIComponent(input.asset)}`);
    const version = input.version ?? asset.version;
    if (!Number.isSafeInteger(version) || Number(version) < 1) {
      throw new Error("The asset version must be a positive integer.");
    }
    const fallbackName = `${asset.slug ?? asset.name ?? input.asset}-v${version}.zip`;
    const downloaded = await this.workspace.download(
      `/assets/${encodeURIComponent(input.asset)}/versions/${version}/download`,
      fallbackName
    );
    const destination = this.paths.output(input.output, downloaded.fileName);
    if (existsSync(destination) && !input.overwrite) {
      throw new Error(`${destination} already exists. Set overwrite to true to replace it.`);
    }
    writeFileSync(destination, downloaded.buffer);
    return {
      asset,
      version,
      path: destination,
      fileName: downloaded.fileName,
      bytes: downloaded.buffer.byteLength
    };
  }

  async uploadArchive(input: {
    archive: string;
    share?: boolean;
  }): Promise<Record<string, unknown>> {
    const archive = this.paths.readable(input.archive);
    const result = await uploadSkillZip({
      ...this.context,
      fileName: path.basename(archive),
      buffer: readFileSync(archive)
    });
    const uploaded = Array.isArray(result.uploaded) ? result.uploaded : [];
    if (uploaded.length === 0) throw new Error("Harhub did not import any Skills from this zip.");
    const shares = input.share
      ? await Promise.all(uploaded.map((asset) => createWorkspaceAssetShare({
          ...this.context,
          assetQuery: String(asset.id)
        })))
      : undefined;
    return { ...result, ...(shares ? { shares } : {}) };
  }

  async uploadSkillPaths(input: {
    paths: string[];
    share?: boolean;
  }): Promise<Record<string, unknown>> {
    const roots = input.paths.map((value) => this.paths.readable(value));
    const skills = scanSkills({ roots });
    const issues = validateSkills(skills);
    const errors = issues.filter((issue) => issue.severity === "error");
    if (skills.length === 0) throw new Error("No Skills were found in the supplied paths.");
    if (errors.length > 0) {
      throw new Error(`Refusing to upload invalid Skills: ${errors.map((issue) => issue.message).join("; ")}`);
    }

    const uploaded: Array<Record<string, unknown>> = [];
    for (const skill of skills) {
      const packaged = await packageSkillDirectory(skill);
      const response = await uploadSkillZip({
        ...this.context,
        fileName: packaged.fileName,
        buffer: packaged.buffer
      });
      const asset = response.uploaded?.[0];
      if (!asset) throw new Error(`Harhub did not import ${skill.name}.`);
      const share = input.share
        ? await createWorkspaceAssetShare({
            ...this.context,
            assetQuery: String(asset.id)
          })
        : undefined;
      uploaded.push({
        skill: skill.name,
        fileName: packaged.fileName,
        asset,
        ...(share ? { share } : {})
      });
    }
    return { uploaded, issues };
  }

  async editSkillFile(input: {
    asset: string;
    file: string;
    content: string;
  }): Promise<Record<string, unknown>> {
    const asset = await this.json<AssetRecord>(`/assets/${encodeURIComponent(input.asset)}`);
    const version = asset.version;
    if (!Number.isSafeInteger(version) || Number(version) < 1) {
      throw new Error("The remote Skill does not have a downloadable version.");
    }
    const file = safeSkillFilePath(input.file);
    const downloaded = await this.workspace.download(
      `/assets/${encodeURIComponent(input.asset)}/versions/${version}/download`,
      `${asset.slug ?? asset.name ?? input.asset}-v${version}.zip`
    );
    const zip = await JSZip.loadAsync(downloaded.buffer, { checkCRC32: true });
    if (!zip.file(file)) throw new Error(`File not found in Skill package: ${file}`);
    zip.file(file, input.content);
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      platform: "UNIX"
    });
    const candidates = await discoverSkillsInArchive(buffer);
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    if (!candidate || candidate.skillPath !== "SKILL.md" || candidate.rootPath !== ".") {
      throw new Error("Edited package must contain exactly one SKILL.md at its root.");
    }
    const errors = candidate.validationIssues.filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      throw new Error(`Edited Skill is invalid: ${errors.map((issue) => issue.message).join("; ")}`);
    }
    if (candidate.name !== asset.name) {
      throw new Error(`Editing a remote Skill cannot change its name from ${asset.name} to ${candidate.name}.`);
    }
    const response = await uploadSkillZip({
      ...this.context,
      fileName: downloaded.fileName,
      buffer
    });
    const uploaded = response.uploaded?.[0];
    if (!uploaded) throw new Error("Harhub did not return the edited Skill version.");
    return { asset: uploaded, file };
  }

  shareAsset(assetQuery: string) {
    return createWorkspaceAssetShare({ ...this.context, assetQuery });
  }

  async unshareAsset(assetQuery: string): Promise<Record<string, unknown>> {
    await revokeWorkspaceAssetShare({ ...this.context, assetQuery });
    return { unshared: assetQuery };
  }

  async installPublicSkill(input: {
    reference: string;
    agents?: string[];
    global?: boolean;
    copy?: boolean;
  }): Promise<Record<string, unknown>> {
    const target = resolveShareReference(input.reference, this.context.apiUrl);
    const share = await getPublicAssetShare(target.apiUrl, target.token);
    const buffer = await downloadPublicAssetShare(share.downloadUrl);
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "harhub-mcp-install-"));
    try {
      await extractSkillArchive(buffer, temporaryDirectory);
      const result = await installSkillDirectory(temporaryDirectory, {
        agents: input.agents,
        global: input.global,
        copy: input.copy,
        yes: true,
        all: true,
        json: true
      });
      if (result.exitCode !== 0) {
        throw new Error(
          result.stderr.trim() || result.stdout.trim() || `skills installer exited with code ${result.exitCode}.`
        );
      }
      return {
        share,
        installed: true,
        installer: "skills",
        output: result.stdout.trim()
      };
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async streamForgeOperation(
    sessionId: string,
    operation: "follow-up" | "generate",
    answers: ForgeAnswer[]
  ): Promise<Record<string, unknown>> {
    const response = await this.workspace.response(
      `/forge/sessions/${encodeURIComponent(sessionId)}/${operation}`,
      { method: "POST", body: answers.length > 0 ? { answers } : {} }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => undefined);
      throw new Error(
        isRecord(data) && typeof data.error === "string"
          ? data.error
          : `Forge operation failed with ${response.status}.`
      );
    }
    if (!response.body) throw new Error("Forge operation did not return a response stream.");

    const events: Array<Record<string, unknown>> = [];
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let terminal = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      if (pending.length > 1_000_000) {
        throw new Error("Forge operation returned an oversized stream event.");
      }
      pending = consumeNdjson(pending, events, false);
      terminal ||= hasTerminalEvent(events);
    }
    pending += decoder.decode();
    consumeNdjson(pending, events, true);
    terminal ||= hasTerminalEvent(events);
    if (!terminal) throw new Error("Forge operation stream ended before a terminal event.");
    const failure = events.find((event) => event.type === "error");
    if (failure) {
      const detail = isRecord(failure.failure) ? failure.failure.message : undefined;
      throw new Error(typeof detail === "string" ? detail : `Forge ${operation} failed.`);
    }
    return {
      sessionId,
      operation,
      events,
      text: events
        .filter((event) => event.type === "delta" && typeof event.delta === "string")
        .map((event) => event.delta)
        .join("")
    };
  }

  async downloadForgeArchive(input: {
    sessionId: string;
    output?: string;
    overwrite?: boolean;
  }): Promise<Record<string, unknown>> {
    const downloaded = await this.workspace.download(
      "/forge/archive",
      `forge-${input.sessionId}.zip`,
      { method: "POST", body: { sessionId: input.sessionId } }
    );
    const destination = this.paths.output(input.output, downloaded.fileName);
    if (existsSync(destination) && !input.overwrite) {
      throw new Error(`${destination} already exists. Set overwrite to true to replace it.`);
    }
    writeFileSync(destination, downloaded.buffer);
    return {
      sessionId: input.sessionId,
      path: destination,
      fileName: downloaded.fileName,
      bytes: downloaded.buffer.byteLength
    };
  }
}

function safeSkillFilePath(value: string): string {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid Skill file path: ${value}`);
  }
  return normalized;
}

function resolveShareReference(
  reference: string,
  fallbackApiUrl: string
): { apiUrl: string; token: string } {
  if (/^https?:\/\//i.test(reference)) {
    const url = new URL(reference);
    const match = url.pathname.match(/\/(?:s|api\/public\/shares)\/([^/]+)(?:\/download)?\/?$/);
    if (!match) throw new Error("The URL is not a Harhub share URL.");
    return { apiUrl: url.origin, token: decodeURIComponent(match[1]) };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(reference)) throw new Error("The share token is invalid.");
  return { apiUrl: fallbackApiUrl.replace(/\/+$/g, ""), token: reference };
}

function consumeNdjson(
  value: string,
  events: Array<Record<string, unknown>>,
  flush: boolean
): string {
  const lines = value.split("\n");
  const pending = flush ? "" : (lines.pop() ?? "");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const event = JSON.parse(line);
    if (!isRecord(event)) throw new Error("Forge returned an invalid stream event.");
    events.push(event);
  }
  if (flush && pending.trim()) {
    const event = JSON.parse(pending);
    if (!isRecord(event)) throw new Error("Forge returned an invalid stream event.");
    events.push(event);
  }
  return pending;
}

function hasTerminalEvent(events: Array<Record<string, unknown>>): boolean {
  return events.some((event) => event.type === "complete" || event.type === "error");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
