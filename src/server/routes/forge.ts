import type { Express, Response } from "express";
import type {
  ForgeAiOperationFailure,
  ForgeGenerationProgressStep,
  ForgeGenerationProgressStatus,
  ForgeSessionFollowUpDraft,
  ForgeSessionOperation,
  ForgeSessionViewState,
  HarnessFollowUpRequest,
  HarnessInterviewAnswer
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
  recordForgeSessionProgress,
  recordForgeSessionTemplate,
  updateForgeSessionViewState
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
const MAX_VIEW_PATH_CHARS = 1_024;
const MAX_VIEW_PATHS = 500;
const MAX_VIEW_DRAFTS = 50;
const MAX_DRAFT_OPTIONS = 100;

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

  app.patch(
    "/api/workspaces/:workspaceId/forge/sessions/:sessionId/view-state",
    async (req, res) => {
      const context = await requireWorkspaceAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);

      try {
        res.json(await updateForgeSessionViewState(
          context.account.id,
          context.workspace.id,
          readRequiredString(req.params.sessionId, "sessionId", 128),
          readForgeSessionViewState(req.body)
        ));
      } catch (error) {
        sendForgeError(res, error);
      }
    }
  );

  registerForgeOperationRoute(app, "follow-up");
  registerForgeOperationRoute(app, "generate");

  app.post("/api/workspaces/:workspaceId/forge/archive", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      if (!isRecord(req.body)) throw new Error("Expected a JSON object request body");
      const sessionId = readRequiredString(req.body.sessionId, "sessionId", 128);
      const session = await getForgeSession(
        context.account.id,
        context.workspace.id,
        sessionId
      );
      if (session.status !== "complete" || !session.template) {
        throw new Error("Forge session does not have a completed framework to download.");
      }
      const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
      const archive = await createHarnessTemplateArchive(catalog, {
        name: session.title,
        files: session.template.files,
        selectedAssetIds: session.template.selectedAssets.map((asset) => asset.id)
      });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", archiveContentDisposition(archive.fileName));
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
        const answers = readOptionalAnswers(req.body);
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
            answers,
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
  answers,
  stream
}: {
  accountId: string;
  workspaceId: string;
  workspace: Parameters<typeof loadOrCreateWorkspaceAssetCatalog>[0];
  sessionId: string;
  operation: ForgeSessionOperation["operation"];
  answers?: HarnessInterviewAnswer[];
  stream: ForgeOperationStream;
}): Promise<void> {
  let input: HarnessFollowUpRequest | undefined;
  try {
    const started = await beginForgeSessionOperation(
      accountId,
      workspaceId,
      sessionId,
      stream.operationId,
      operation,
      answers
    );
    input = started.input;
    stream.publish({
      type: "session",
      operationId: stream.operationId,
      operation,
      session: started.session
    });
    if ((started.session.activeOperation?.recoveryCount ?? 0) > 0) {
      console.info(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "forge.ai.session.recovered",
        operationId: stream.operationId,
        operation,
        recoveryCount: started.session.activeOperation?.recoveryCount,
        workspaceId,
        sessionId
      }));
    }
    await publishGenerationProgress(
      stream,
      operation,
      "context",
      "active",
      accountId,
      workspaceId,
      sessionId
    );
    await publishGenerationProgress(
      stream,
      operation,
      "context",
      "complete",
      accountId,
      workspaceId,
      sessionId
    );
    await publishGenerationProgress(
      stream,
      operation,
      "assets",
      "active",
      accountId,
      workspaceId,
      sessionId
    );
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
          attempt,
          maxAttempts
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
    await publishGenerationProgress(
      stream,
      operation,
      "assets",
      "complete",
      accountId,
      workspaceId,
      sessionId
    );
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

    await publishGenerationProgress(
      stream,
      operation,
      "compose",
      "active",
      accountId,
      workspaceId,
      sessionId
    );
    const template = await createHarnessTemplate(input, assets, configuration, observed);
    await publishGenerationProgress(
      stream,
      operation,
      "compose",
      "complete",
      accountId,
      workspaceId,
      sessionId
    );
    await publishGenerationProgress(
      stream,
      operation,
      "save",
      "active",
      accountId,
      workspaceId,
      sessionId
    );
    await recordForgeSessionTemplate(
      accountId,
      workspaceId,
      input,
      template,
      stream.operationId
    );
    await publishGenerationProgress(
      stream,
      operation,
      "save",
      "complete",
      accountId,
      workspaceId,
      sessionId
    );
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

async function publishGenerationProgress(
  stream: ForgeOperationStream,
  operation: ForgeSessionOperation["operation"],
  step: ForgeGenerationProgressStep,
  status: ForgeGenerationProgressStatus,
  accountId: string,
  workspaceId: string,
  sessionId: string
): Promise<void> {
  if (operation !== "generate") return;
  stream.publish({
    type: "progress",
    operationId: stream.operationId,
    operation,
    step,
    status
  });
  try {
    await recordForgeSessionProgress(
      accountId,
      workspaceId,
      sessionId,
      stream.operationId,
      step,
      status
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

function readOptionalAnswers(value: unknown): HarnessInterviewAnswer[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error("Expected a JSON object request body");
  if (value.answers !== undefined) {
    if (!Array.isArray(value.answers)) throw new Error("answers must be an array");
    return value.answers.map(readAnswer);
  }
  return value.answer === undefined ? undefined : [readAnswer(value.answer)];
}

function readForgeSessionViewState(value: unknown): ForgeSessionViewState {
  if (!isRecord(value)) throw new Error("Expected a JSON object request body");
  if (!Array.isArray(value.followUpDrafts)) {
    throw new Error("followUpDrafts must be an array");
  }
  if (value.followUpDrafts.length > MAX_VIEW_DRAFTS) {
    throw new Error("Too many Forge follow-up drafts");
  }
  const markdownView = value.markdownView;
  if (markdownView !== "preview" && markdownView !== "code") {
    throw new Error("markdownView must be preview or code");
  }
  return {
    followUpDrafts: value.followUpDrafts.map(readForgeSessionDraft),
    markdownView,
    ...(value.selectedPath === undefined
      ? {}
      : { selectedPath: readRequiredString(value.selectedPath, "selectedPath", MAX_VIEW_PATH_CHARS) }),
    ...(value.collapsedTreePaths === undefined
      ? {}
      : { collapsedTreePaths: readViewPaths(value.collapsedTreePaths) })
  };
}

function readForgeSessionDraft(value: unknown): ForgeSessionFollowUpDraft {
  if (!isRecord(value)) throw new Error("Invalid Forge follow-up draft");
  if (!Array.isArray(value.selectedOptions)) {
    throw new Error("selectedOptions must be an array");
  }
  if (value.selectedOptions.length > MAX_DRAFT_OPTIONS) {
    throw new Error("Too many selected Forge options");
  }
  if (typeof value.customAnswer !== "string" || value.customAnswer.length > MAX_ANSWER_CHARS) {
    throw new Error("customAnswer is too long");
  }
  return {
    question: readRequiredString(value.question, "question", MAX_ANSWER_CHARS),
    selectedOptions: value.selectedOptions.map((option) => (
      readRequiredString(option, "selected option", MAX_ANSWER_CHARS)
    )),
    customAnswer: value.customAnswer
  };
}

function readViewPaths(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("collapsedTreePaths must be an array");
  if (value.length > MAX_VIEW_PATHS) throw new Error("Too many collapsed Forge paths");
  return Array.from(new Set(value.map((item) => (
    readRequiredString(item, "collapsed path", MAX_VIEW_PATH_CHARS)
  ))));
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

function archiveContentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `attachment; filename="project-harness.zip"; filename*=UTF-8''${encoded}`;
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
