import type { Express } from "express";
import type {
  HarnessFollowUpRequest,
  HarnessInterviewAnswer,
  HarnessTemplateFile
} from "../../shared/types.js";
import { getWorkspaceAiRuntimeConfiguration } from "../../state/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import {
  createHarnessFollowUp,
  createHarnessTemplate,
  createHarnessTemplateArchive,
  workspaceAssetSummaries
} from "../services/forge.js";
import { loadOrCreateWorkspaceAssetCatalog } from "../services/workspace-catalogs.js";
import { sendError } from "../utils/http.js";

const MAX_REQUIREMENT_CHARS = 6_000;
const MAX_ANSWER_CHARS = 2_000;

export function registerForgeRoutes(app: Express): void {
  app.post("/api/workspaces/:workspaceId/forge/follow-up", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
      res.json(await createHarnessFollowUp(
        readInput(req.body),
        workspaceAssetSummaries(catalog.assets),
        await getWorkspaceAiRuntimeConfiguration(context.account.id, context.workspace.id)
      ));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/forge/generate", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
      res.json(await createHarnessTemplate(
        readInput(req.body),
        workspaceAssetSummaries(catalog.assets),
        await getWorkspaceAiRuntimeConfiguration(context.account.id, context.workspace.id)
      ));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/forge/archive", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

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
  const answers = Array.isArray(value.answers)
    ? value.answers.slice(0, 3).map(readAnswer)
    : [];
  return { requirement, answers };
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
