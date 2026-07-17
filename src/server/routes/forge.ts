import type { Express, Response } from "express";
import type {
  HarnessFollowUpRequest,
  HarnessInterviewAnswer,
  HarnessTemplateFile
} from "../../shared/types.js";
import {
  createForgeSession,
  deleteForgeSession,
  getForgeSession,
  getWorkspaceAiRuntimeConfiguration,
  listForgeSessions,
  recordForgeSessionFollowUp,
  recordForgeSessionTemplate
} from "../../state/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import {
  createHarnessFollowUp,
  createHarnessTemplate,
  createHarnessTemplateArchive,
  MAX_FORGE_INTERVIEW_ANSWERS,
  workspaceAssetSummaries
} from "../services/forge.js";
import { loadOrCreateWorkspaceAssetCatalog } from "../services/workspace-catalogs.js";
import { sendError, setPrivateNoStore } from "../utils/http.js";

const MAX_REQUIREMENT_CHARS = 6_000;
const MAX_ANSWER_CHARS = 2_000;

export function registerForgeRoutes(app: Express): void {
  app.get("/api/workspaces/:workspaceId/forge/sessions", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      res.json(await listForgeSessions(context.account.id, context.workspace.id));
    } catch (error) {
      sendForgeError(res, error);
    }
  });

  app.post("/api/workspaces/:workspaceId/forge/sessions", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      if (!isRecord(req.body)) throw new Error("Expected a JSON object request body");
      const requirement = readRequiredString(
        req.body.requirement,
        "requirement",
        MAX_REQUIREMENT_CHARS
      );
      res.status(201).json(await createForgeSession(
        context.account.id,
        context.workspace.id,
        requirement
      ));
    } catch (error) {
      sendForgeError(res, error);
    }
  });

  app.get("/api/workspaces/:workspaceId/forge/sessions/:sessionId", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      res.json(await getForgeSession(
        context.account.id,
        context.workspace.id,
        readRequiredString(req.params.sessionId, "sessionId", 128)
      ));
    } catch (error) {
      sendForgeError(res, error);
    }
  });

  app.delete("/api/workspaces/:workspaceId/forge/sessions/:sessionId", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      await deleteForgeSession(
        context.account.id,
        context.workspace.id,
        readRequiredString(req.params.sessionId, "sessionId", 128)
      );
      res.status(204).end();
    } catch (error) {
      sendForgeError(res, error);
    }
  });

  app.post("/api/workspaces/:workspaceId/forge/follow-up", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      const input = readInput(req.body);
      const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
      const response = await createHarnessFollowUp(
        input,
        workspaceAssetSummaries(catalog.assets),
        await getWorkspaceAiRuntimeConfiguration(context.account.id, context.workspace.id)
      );
      await recordForgeSessionFollowUp(
        context.account.id,
        context.workspace.id,
        input,
        response
      );
      res.json(response);
    } catch (error) {
      sendForgeOperationError(res, error);
    }
  });

  app.post("/api/workspaces/:workspaceId/forge/generate", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      const input = readInput(req.body);
      const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
      const template = await createHarnessTemplate(
        input,
        workspaceAssetSummaries(catalog.assets),
        await getWorkspaceAiRuntimeConfiguration(context.account.id, context.workspace.id)
      );
      await recordForgeSessionTemplate(
        context.account.id,
        context.workspace.id,
        input,
        template
      );
      res.json(template);
    } catch (error) {
      sendForgeOperationError(res, error);
    }
  });

  app.post("/api/workspaces/:workspaceId/forge/archive", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
      const archive = await createHarnessTemplateArchive(catalog, readArchiveInput(req.body));
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${archive.fileName}"`);
      res.send(archive.buffer);
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}

function readInput(value: unknown): HarnessFollowUpRequest {
  if (!isRecord(value)) throw new Error("Expected a JSON object request body");
  const requirement = readRequiredString(value.requirement, "requirement", MAX_REQUIREMENT_CHARS);
  const rawAnswers = Array.isArray(value.answers) ? value.answers : [];
  if (rawAnswers.length > MAX_FORGE_INTERVIEW_ANSWERS) {
    throw new Error(`answers must contain at most ${MAX_FORGE_INTERVIEW_ANSWERS} items`);
  }
  const answers = rawAnswers.map(readAnswer);
  const sessionId = value.sessionId === undefined
    ? undefined
    : readRequiredString(value.sessionId, "sessionId", 128);
  return { requirement, answers, ...(sessionId ? { sessionId } : {}) };
}

function readArchiveInput(value: unknown): {
  slug: string;
  files: HarnessTemplateFile[];
  selectedAssetIds: string[];
} {
  if (!isRecord(value)) throw new Error("Expected a JSON object request body");
  const files = Array.isArray(value.files) ? value.files.map(readTemplateFile) : [];
  const selectedAssetIds = Array.isArray(value.selectedAssetIds)
    ? value.selectedAssetIds.filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim())
    )
    : [];
  return {
    slug: readRequiredString(value.slug, "slug", 128),
    files,
    selectedAssetIds
  };
}

function readTemplateFile(value: unknown): HarnessTemplateFile {
  if (!isRecord(value)) throw new Error("Invalid generated file");
  return {
    path: readRequiredString(value.path, "path", 256),
    content: typeof value.content === "string" ? value.content : ""
  };
}

function readAnswer(value: unknown): HarnessInterviewAnswer {
  if (!isRecord(value)) throw new Error("Invalid interview answer");
  return {
    question: readRequiredString(value.question, "question", MAX_ANSWER_CHARS),
    answer: readRequiredString(value.answer, "answer", MAX_ANSWER_CHARS)
  };
}

function readRequiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${label} is too long`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sendForgeError(
  res: Response,
  error: unknown
): void {
  const status = error instanceof Error && error.message === "Forge session not found."
    ? 404
    : 400;
  sendError(res, error, status);
}

function sendForgeOperationError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.startsWith("AI request failed after ")
    ? 502
    : message.startsWith("Forge AI is not configured")
      ? 409
      : 400;
  sendError(res, error, status);
}
