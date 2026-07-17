import type { Express, Response } from "express";
import type {
  ForgeAiOperationFailure,
  ForgeGenerationProgressStep,
  ForgeGenerationProgressStatus,
  ForgeSessionOperation,
  HarnessFollowUpRequest,
  HarnessInterviewAnswer,
  HarnessTemplateFile
} from "../../shared/types.js";
import {
  beginForgeSessionOperation,
  createForgeSession,
  deleteForgeSession,
  getForgeSession,
  getWorkspaceAiRuntimeConfiguration,
  listForgeSessions,
  recordForgeSessionAttempt,
  recordForgeSessionFailure,
  recordForgeSessionFollowUp,
  recordForgeSessionTemplate
} from "../../state/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import {
  createHarnessFollowUp,
  createHarnessTemplate,
  createHarnessTemplateArchive,
  createObservedForgeAiOperation,
  isForgeAiOperationError,
  workspaceAssetSummaries
} from "../services/forge.js";
import {
  type ForgeOperationStream,
  getOrCreateForgeOperationStream
} from "../services/forge-operation-streams.js";
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

  registerForgeOperationRoute(app, "follow-up");
  registerForgeOperationRoute(app, "generate");

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

function registerForgeOperationRoute(
  app: Express,
  operation: ForgeSessionOperation["operation"]
): void {
  app.post(
    `/api/workspaces/:workspaceId/forge/sessions/:sessionId/${operation}`,
    async (req, res) => {
      const context = await requireWorkspaceAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);

      try {
        const sessionId = readRequiredString(req.params.sessionId, "sessionId", 128);
        const answer = readOptionalAnswer(req.body);
        await getForgeSession(context.account.id, context.workspace.id, sessionId);
        const stream = getOrCreateForgeOperationStream(
          {
            accountId: context.account.id,
            workspaceId: context.workspace.id,
            sessionId
          },
          operation,
          (activeStream) => executeForgeOperation({
            accountId: context.account.id,
            workspaceId: context.workspace.id,
            workspace: context.workspace,
            sessionId,
            operation,
            answer,
            stream: activeStream
          })
        );
        streamForgeOperation(res, stream);
      } catch (error) {
        sendForgeError(res, error);
      }
    }
  );
}

async function executeForgeOperation({
  accountId,
  workspaceId,
  workspace,
  sessionId,
  operation,
  answer,
  stream
}: {
  accountId: string;
  workspaceId: string;
  workspace: Parameters<typeof loadOrCreateWorkspaceAssetCatalog>[0];
  sessionId: string;
  operation: ForgeSessionOperation["operation"];
  answer?: HarnessInterviewAnswer;
  stream: ForgeOperationStream;
}): Promise<void> {
  let input: HarnessFollowUpRequest | undefined;
  try {
    publishGenerationProgress(stream, operation, "context", "active");
    const started = await beginForgeSessionOperation(
      accountId,
      workspaceId,
      sessionId,
      stream.operationId,
      operation,
      answer
    );
    input = started.input;
    stream.publish({
      type: "session",
      operationId: stream.operationId,
      operation,
      session: started.session
    });
    publishGenerationProgress(stream, operation, "context", "complete");
    publishGenerationProgress(stream, operation, "assets", "active");
    const configuration = await getWorkspaceAiRuntimeConfiguration(accountId, workspaceId);
    const observed = createObservedForgeAiOperation(operation, {
      operationId: stream.operationId,
      workspaceId,
      sessionId,
      model: configuration?.model
    });
    observed.onAttempt = async (attempt, maxAttempts) => {
      stream.publish({
        type: "attempt",
        operationId: stream.operationId,
        operation,
        attempt,
        maxAttempts
      });
      try {
        await recordForgeSessionAttempt(
          accountId,
          workspaceId,
          sessionId,
          stream.operationId,
          attempt
        );
      } catch (error) {
        logForgeStateWriteError(
          error,
          stream.operationId,
          operation,
          workspaceId,
          sessionId
        );
      }
    };
    observed.onDelta = (attempt, delta) => stream.publish({
      type: "delta",
      operationId: stream.operationId,
      operation,
      attempt,
      delta
    });

    const catalog = await loadOrCreateWorkspaceAssetCatalog(workspace);
    const assets = workspaceAssetSummaries(catalog.assets);
    publishGenerationProgress(stream, operation, "assets", "complete");
    if (operation === "follow-up") {
      const followUp = await createHarnessFollowUp(input, assets, configuration, observed);
      await recordForgeSessionFollowUp(
        accountId,
        workspaceId,
        input,
        followUp,
        stream.operationId
      );
      stream.publish({
        type: "complete",
        operationId: stream.operationId,
        operation,
        followUp,
        session: await getForgeSession(accountId, workspaceId, sessionId)
      });
      return;
    }

    publishGenerationProgress(stream, operation, "compose", "active");
    const template = await createHarnessTemplate(input, assets, configuration, observed);
    publishGenerationProgress(stream, operation, "compose", "complete");
    publishGenerationProgress(stream, operation, "save", "active");
    await recordForgeSessionTemplate(
      accountId,
      workspaceId,
      input,
      template,
      stream.operationId
    );
    publishGenerationProgress(stream, operation, "save", "complete");
    stream.publish({
      type: "complete",
      operationId: stream.operationId,
      operation,
      template,
      session: await getForgeSession(accountId, workspaceId, sessionId)
    });
  } catch (error) {
    const failure = forgeOperationFailure(error, stream.operationId, operation);
    let session;
    if (input) {
      try {
        await recordForgeSessionFailure(
          accountId,
          workspaceId,
          input,
          failure,
          stream.operationId
        );
      } catch (stateError) {
        logForgeStateWriteError(
          stateError,
          stream.operationId,
          operation,
          workspaceId,
          sessionId
        );
      }
    }
    try {
      session = await getForgeSession(accountId, workspaceId, sessionId);
    } catch {
      session = undefined;
    }
    stream.publish({
      type: "error",
      operationId: stream.operationId,
      operation,
      failure,
      ...(session ? { session } : {})
    });
  }
}

function publishGenerationProgress(
  stream: ForgeOperationStream,
  operation: ForgeSessionOperation["operation"],
  step: ForgeGenerationProgressStep,
  status: ForgeGenerationProgressStatus
): void {
  if (operation !== "generate") return;
  stream.publish({
    type: "progress",
    operationId: stream.operationId,
    operation,
    step,
    status
  });
}

function streamForgeOperation(res: Response, stream: ForgeOperationStream): void {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Harhub-Operation-Id", stream.operationId);
  res.flushHeaders();

  const unsubscribe = stream.subscribe((event) => {
    if (res.writableEnded) return;
    res.write(`${JSON.stringify(event)}\n`);
    if (event.type === "complete" || event.type === "error") res.end();
  });
  res.on("close", unsubscribe);
  if (stream.done && !res.writableEnded) res.end();
}

function readOptionalAnswer(value: unknown): HarnessInterviewAnswer | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error("Expected a JSON object request body");
  return value.answer === undefined ? undefined : readAnswer(value.answer);
}

function forgeOperationFailure(
  error: unknown,
  operationId: string,
  operation: ForgeSessionOperation["operation"]
): ForgeAiOperationFailure {
  if (isForgeAiOperationError(error)) return error.failure;
  return {
    operationId,
    operation,
    code: "unknown",
    message: error instanceof Error ? error.message : "Forge AI operation failed.",
    retryable: false,
    attempts: 0,
    durationMs: 0,
    occurredAt: new Date().toISOString()
  };
}

function logForgeStateWriteError(
  error: unknown,
  operationId: string,
  operation: ForgeSessionOperation["operation"],
  workspaceId: string,
  sessionId: string
): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "forge.ai.session.write.failed",
    operationId,
    operation,
    workspaceId,
    sessionId,
    message: (error instanceof Error ? error.message : String(error)).slice(0, 300)
  }));
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
