import JSZip from "jszip";
import { randomUUID } from "node:crypto";

import type {
  AssetCatalog,
  AssetRecord,
  ForgeAiFailureCode,
  ForgeAiOperation,
  ForgeAiOperationFailure,
  HarnessFollowUpComponent,
  HarnessFollowUpQuestion,
  HarnessFollowUpRequest,
  HarnessFollowUpResponse,
  HarnessTemplateFile,
  HarnessTemplateAssetSelection,
  HarnessTemplateProfile,
  HarnessTemplateResponse,
  HarnessWorkspaceAssetSummary,
  WorkspaceAiConnectionTestResult
} from "../../shared/types.js";
import {
  MAX_FORGE_FOLLOW_UP_QUESTIONS,
  MAX_FORGE_INTERVIEW_ANSWERS,
  MIN_FORGE_INTERVIEW_ANSWERS
} from "../../shared/forge.js";
import { loadStoredSkill } from "./skill-packages.js";

const MAX_LIST_ITEMS = 6;
const MAX_SELECTED_ASSETS = 4;
const MAX_ARCHIVE_SKILL_BYTES = 25 * 1024 * 1024;

const FOLLOW_UP_AI_POLICY: ForgeAiOperationPolicy = {
  maxAttempts: 3,
  attemptTimeoutMs: 30_000,
  totalTimeoutMs: 70_000,
  retryDelaysMs: [300, 900]
};

const GENERATE_AI_POLICY: ForgeAiOperationPolicy = {
  maxAttempts: 3,
  attemptTimeoutMs: 60_000,
  totalTimeoutMs: 125_000,
  retryDelaysMs: [500, 1_500]
};

const CONNECTION_TEST_AI_POLICY: ForgeAiOperationPolicy = {
  maxAttempts: 2,
  attemptTimeoutMs: 20_000,
  totalTimeoutMs: 45_000,
  retryDelaysMs: [500]
};

interface ForgeTemplateSpec {
  name: string;
  summary: string;
  targetUsers: string[];
  goals: string[];
  constraints: string[];
  successCriteria: string[];
  stackNotes: string[];
  agentRules: string[];
  selectedAssets: Array<{ assetId: string; reason: string }>;
  workflow: {
    name: string;
    objective: string;
    steps: string[];
    verification: string[];
  };
}

export interface ForgeAiConfiguration {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ForgeAiOperationPolicy {
  maxAttempts: number;
  attemptTimeoutMs: number;
  totalTimeoutMs: number;
  retryDelaysMs: number[];
}

export interface ForgeAiLogEntry {
  timestamp: string;
  event:
    | "forge.ai.attempt.started"
    | "forge.ai.attempt.failed"
    | "forge.ai.retry.scheduled"
    | "forge.ai.operation.succeeded"
    | "forge.ai.operation.failed";
  operationId: string;
  operation: ForgeAiOperation;
  workspaceId?: string;
  sessionId?: string;
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  durationMs?: number;
  delayMs?: number;
  code?: ForgeAiFailureCode;
  retryable?: boolean;
  providerStatus?: number;
}

export type ForgeAiLogLevel = "info" | "warn" | "error";

export interface ForgeAiOperationContext {
  operationId: string;
  operation: ForgeAiOperation;
  workspaceId?: string;
  sessionId?: string;
  model?: string;
  logger?: (level: ForgeAiLogLevel, entry: ForgeAiLogEntry) => void;
  onAttempt?: (attempt: number, maxAttempts: number) => void | Promise<void>;
  onDelta?: (attempt: number, delta: string) => void;
}

interface ForgeAiAttemptContext {
  attempt: number;
  signal: AbortSignal;
  timeoutMs: number;
}

interface ForgeAiRequestErrorOptions {
  code: ForgeAiFailureCode;
  retryable: boolean;
  providerStatus?: number;
  retryAfterMs?: number;
}

export class ForgeAiRequestError extends Error {
  readonly code: ForgeAiFailureCode;
  readonly retryable: boolean;
  readonly providerStatus?: number;
  readonly retryAfterMs?: number;

  constructor(message: string, options: ForgeAiRequestErrorOptions) {
    super(message);
    this.name = "ForgeAiRequestError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.providerStatus = options.providerStatus;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class ForgeAiOperationError extends Error {
  readonly failure: ForgeAiOperationFailure;

  constructor(failure: ForgeAiOperationFailure) {
    super(failure.message);
    this.name = "ForgeAiOperationError";
    this.failure = failure;
  }
}

export function createObservedForgeAiOperation(
  operation: ForgeAiOperation,
  fields: {
    operationId?: string;
    workspaceId?: string;
    sessionId?: string;
    model?: string;
  } = {}
): ForgeAiOperationContext {
  return {
    operationId: fields.operationId ?? randomUUID(),
    operation,
    ...fields,
    logger: (level, entry) => {
      const output = JSON.stringify(entry);
      if (level === "error") console.error(output);
      else if (level === "warn") console.warn(output);
      else console.info(output);
    }
  };
}

export function isForgeAiOperationError(error: unknown): error is ForgeAiOperationError {
  return error instanceof ForgeAiOperationError;
}

export function forgeAiFailureHttpStatus(code: ForgeAiFailureCode): number {
  if (code === "configuration") return 409;
  if (code === "rate_limited") return 429;
  if (code === "timeout") return 504;
  return 502;
}

export async function testForgeAiConnection(
  configuration: ForgeAiConfiguration,
  operationContext?: ForgeAiOperationContext
): Promise<WorkspaceAiConnectionTestResult> {
  const startedAt = Date.now();
  const context = resolveForgeAiOperationContext(
    "connection-test",
    configuration.model,
    operationContext
  );
  await runForgeAiOperation(
    async ({ signal, attempt }) => {
      const payload = await requestJson({
        ...configuration,
        maxTokens: 700,
        system: "This is a connection test. Return only the JSON object {\"ok\":true}.",
        user: "Confirm that this model can complete an OpenAI-compatible JSON chat request.",
        signal,
        onDelta: (delta) => context.onDelta?.(attempt, delta)
      });
      if (payload.ok !== true) {
        throw new ForgeAiRequestError(
          "AI provider responded, but did not follow the required JSON response format.",
          { code: "invalid_response", retryable: true }
        );
      }
    },
    context,
    CONNECTION_TEST_AI_POLICY
  );
  return {
    ok: true,
    model: configuration.model,
    latencyMs: Math.max(0, Date.now() - startedAt)
  };
}

export async function createHarnessFollowUp(
  input: HarnessFollowUpRequest,
  workspaceAssets: HarnessWorkspaceAssetSummary[],
  aiConfiguration?: ForgeAiConfiguration,
  operationContext?: ForgeAiOperationContext
): Promise<HarnessFollowUpResponse> {
  if (input.answers.length >= MAX_FORGE_INTERVIEW_ANSWERS) {
    return { mode: "llm", ready: true };
  }
  const context = resolveForgeAiOperationContext(
    "follow-up",
    aiConfiguration?.model,
    operationContext
  );
  const configuration = requireForgeAiConfiguration(aiConfiguration, context);
  const maxQuestions = Math.min(
    MAX_FORGE_FOLLOW_UP_QUESTIONS,
    MAX_FORGE_INTERVIEW_ANSWERS - input.answers.length
  );

  return runForgeAiOperation(async ({ signal, attempt }) => {
    const payload = await requestJson({
      ...configuration,
      maxTokens: 1_200,
      system: [
        "You run a concise project discovery interview for an agent harness template.",
        "Decide whether the current requirement and answers are sufficient to generate a useful starter framework.",
        `The first ${MIN_FORGE_INTERVIEW_ANSWERS} answered follow-ups are required. Before then, always set ready to false and ask another question.`,
        "Required questions must be essential rather than generic setup questions.",
        "Rank unresolved information by its expected impact on the framework, asset selection, core workflow, constraints, and delivery risk. Put the highest-impact unresolved questions first.",
        `Once at least ${MIN_FORGE_INTERVIEW_ANSWERS} essential answers are recorded, set ready to true as soon as the available context is sufficient. There is no target number beyond that minimum.`,
        `When more context would materially change the result, set ready to false and return a questions array containing between 1 and ${maxQuestions} useful follow-ups in the same language as the user's requirement.`,
        "Choose the question count yourself. Prefer 1 or 2; use 3 only when the questions are independently answerable, essential, and useful to ask together. Do not create a large questionnaire.",
        "Clarify target users, must-work workflow, constraints, success criteria, or technical context.",
        "Do not repeat answered questions, ask for information that is already explicit, or continue merely to reach a question quota.",
        "Return only JSON with ready and, when ready is false, questions. Each questions item contains question and component.",
        "When ready is true, omit questions.",
        "Each component.type is single-select, multi-select, or text.",
        "Use single-select for one mutually exclusive answer, multi-select when several choices may apply, and text when presets would hide important nuance.",
        "Choice components contain 3 to 6 options with short label and optional description, plus allowCustom.",
        "For each multi-select, decide maxSelections from the question's meaning. Include maxSelections only when there is a real maximum; otherwise omit it so every relevant option may be selected. Never use a fixed default such as 3.",
        "Text components contain a useful placeholder and an empty options array."
      ].join(" "),
      user: JSON.stringify({
        ...input,
        workspaceSkills: workspaceAssets.map(assetPromptSummary)
      }, null, 2),
      signal,
      onDelta: (delta) => context.onDelta?.(attempt, delta)
    });
    const ready = input.answers.length >= MIN_FORGE_INTERVIEW_ANSWERS && payload.ready === true;
    const questions = ready
      ? []
      : readFollowUpQuestions(payload.questions, maxQuestions);
    if (!ready && questions.length === 0) {
      const legacyQuestion = readString(payload.question);
      const legacyComponent = readFollowUpComponent(payload.component);
      if (legacyQuestion && legacyComponent) {
        questions.push({ question: legacyQuestion, component: legacyComponent });
      }
    }

    if (!ready && questions.length === 0) {
      throw new Error("AI follow-up did not match the expected shape");
    }

    return {
      mode: "llm",
      ready,
      ...(ready ? {} : { questions })
    };
  }, context, FOLLOW_UP_AI_POLICY);
}

export async function createHarnessTemplate(
  input: HarnessFollowUpRequest,
  workspaceAssets: HarnessWorkspaceAssetSummary[],
  aiConfiguration?: ForgeAiConfiguration,
  operationContext?: ForgeAiOperationContext
): Promise<HarnessTemplateResponse> {
  if (input.answers.length < MIN_FORGE_INTERVIEW_ANSWERS) {
    throw new Error(
      `Answer at least ${MIN_FORGE_INTERVIEW_ANSWERS} essential follow-up questions before generating a framework.`
    );
  }
  const context = resolveForgeAiOperationContext(
    "generate",
    aiConfiguration?.model,
    operationContext
  );
  const configuration = requireForgeAiConfiguration(aiConfiguration, context);
  return runForgeAiOperation(async ({ signal, attempt }) => {
    const payload = await requestJson({
      ...configuration,
      maxTokens: 2400,
      system: [
        "You turn a project discovery interview into a structured project harness brief.",
        "Stay faithful to the user. Put unknown details in constraints or stackNotes instead of inventing facts.",
        "Return only one JSON object with this shape:",
        JSON.stringify({
          name: "Short project name",
          summary: "One paragraph",
          targetUsers: ["user group"],
          goals: ["goal"],
          constraints: ["constraint or open question"],
          successCriteria: ["measurable or observable outcome"],
          stackNotes: ["known technical context or decision still needed"],
          agentRules: ["specific instruction for coding agents"],
          selectedAssets: [{ assetId: "exact workspace asset id", reason: "why it fits" }],
          workflow: {
            name: "Core delivery workflow",
            objective: "workflow objective",
            steps: ["ordered step"],
            verification: ["verification evidence"]
          }
        }),
        "Select at most 4 Skills. Use only exact assetId values from workspaceSkills.",
        "Select a Skill only when its description materially supports the requirement or delivery workflow.",
        "Use the same language as the user's requirement."
      ].join("\n"),
      user: JSON.stringify({
        ...input,
        workspaceSkills: workspaceAssets.map(assetPromptSummary)
      }, null, 2),
      signal,
      onDelta: (delta) => context.onDelta?.(attempt, delta)
    });
    return buildHarnessTemplate(readTemplateSpec(payload, workspaceAssets), workspaceAssets);
  }, context, GENERATE_AI_POLICY);
}

export function buildHarnessTemplate(
  spec: ForgeTemplateSpec,
  workspaceAssets: HarnessWorkspaceAssetSummary[] = []
): HarnessTemplateResponse {
  const slug = slugify(spec.name) || "project-harness";
  const profile: HarnessTemplateProfile = {
    name: spec.name,
    slug,
    summary: spec.summary,
    targetUsers: spec.targetUsers,
    goals: spec.goals,
    constraints: spec.constraints,
    successCriteria: spec.successCriteria,
    stackNotes: spec.stackNotes
  };
  const selectedAssets = resolveSelectedAssets(spec.selectedAssets, workspaceAssets);
  const files: HarnessTemplateFile[] = [
    file("AGENTS.md", agentGuide(spec, selectedAssets)),
    file(".harness/README.md", harnessReadme(spec, selectedAssets)),
    file(".harness/project-brief.md", projectBrief(spec)),
    file(".harness/context/stack.md", stackContext(spec)),
    file(".harness/rules/engineering.md", engineeringRules(spec)),
    file(".harness/workflows/delivery.md", deliveryWorkflow(spec)),
    file(".harness/skills/README.md", selectedSkillsReadme(selectedAssets)),
    file(".harness/catalog/skills.json", `${JSON.stringify({ skills: selectedAssets }, null, 2)}\n`),
    file(
      ".harness/changes/CHANGELOG.md",
      "# Harness Changelog\n\nRecord changes to project instructions, rules, workflows, and reusable assets here.\n"
    )
  ];

  return {
    mode: "llm",
    generatedAt: new Date().toISOString(),
    profile,
    selectedAssets,
    files
  };
}

function readTemplateSpec(
  payload: Record<string, unknown>,
  workspaceAssets: HarnessWorkspaceAssetSummary[]
): ForgeTemplateSpec {
  if (!isRecord(payload.workflow)) throw new Error("AI template workflow is required");
  const workflow = payload.workflow;
  return {
    name: readRequiredAiString(payload.name, "name"),
    summary: readRequiredAiString(payload.summary, "summary"),
    targetUsers: readRequiredAiStringList(payload.targetUsers, "targetUsers"),
    goals: readRequiredAiStringList(payload.goals, "goals"),
    constraints: readAiStringList(payload.constraints, "constraints"),
    successCriteria: readRequiredAiStringList(payload.successCriteria, "successCriteria"),
    stackNotes: readAiStringList(payload.stackNotes, "stackNotes"),
    agentRules: readRequiredAiStringList(payload.agentRules, "agentRules"),
    selectedAssets: readAssetSelections(payload.selectedAssets, workspaceAssets),
    workflow: {
      name: readRequiredAiString(workflow.name, "workflow.name"),
      objective: readRequiredAiString(workflow.objective, "workflow.objective"),
      steps: readRequiredAiStringList(workflow.steps, "workflow.steps"),
      verification: readRequiredAiStringList(workflow.verification, "workflow.verification")
    }
  };
}

function assetPromptSummary(asset: HarnessWorkspaceAssetSummary) {
  return {
    id: asset.id,
    name: asset.name,
    displayName: asset.displayName,
    description: asset.description,
    health: asset.health
  };
}

export function workspaceAssetSummaries(assets: AssetRecord[]): HarnessWorkspaceAssetSummary[] {
  return assets
    .filter((asset) => asset.kind === "skill" && asset.health !== "error" && Boolean(asset.storage))
    .map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      displayName: asset.displayName,
      slug: asset.slug,
      description: asset.description,
      health: asset.health,
      fileCount: asset.storage?.fileCount ?? 0,
      size: asset.storage?.size ?? 0
    }));
}

export async function createHarnessTemplateArchive(
  catalog: AssetCatalog,
  input: {
    slug: string;
    files: HarnessTemplateFile[];
    selectedAssetIds: string[];
  }
): Promise<{ buffer: Buffer; fileName: string }> {
  validateFrameworkFiles(input.files);
  const selectedIds = new Set(input.selectedAssetIds.slice(0, MAX_LIST_ITEMS));
  const assets = catalog.assets.filter(
    (asset) => selectedIds.has(asset.id) && asset.kind === "skill" && asset.health !== "error"
  );
  const totalSkillBytes = assets.reduce((total, asset) => total + (asset.storage?.size ?? 0), 0);
  if (totalSkillBytes > MAX_ARCHIVE_SKILL_BYTES) {
    throw new Error("Selected Skills are too large for one generated template");
  }

  const zip = new JSZip();
  input.files.forEach((item) => zip.file(item.path, item.content));
  const skillPackages = await Promise.all(assets.map(async (asset) => {
    if (!asset.storage) throw new Error(`Selected asset ${asset.id} has no stored package`);
    return { asset, files: (await loadStoredSkill(asset.storage)).files };
  }));

  for (const skillPackage of skillPackages) {
    const basePath = `.harness/skills/${skillPackage.asset.slug || slugify(skillPackage.asset.name) || "skill"}`;
    for (const skillFile of skillPackage.files) {
      zip.file(`${basePath}/${safeRelativePath(skillFile.path)}`, skillFile.content);
    }
  }

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    fileName: `${slugify(input.slug) || "project-harness"}-harness.zip`
  };
}

function readAssetSelections(
  value: unknown,
  workspaceAssets: HarnessWorkspaceAssetSummary[]
): Array<{ assetId: string; reason: string }> {
  if (!Array.isArray(value)) throw new Error("AI template selectedAssets must be an array");
  const availableIds = new Set(workspaceAssets.map((item) => item.id));
  const seen = new Set<string>();
  return value.slice(0, MAX_SELECTED_ASSETS).map((item, index) => {
    if (!isRecord(item)) throw new Error(`AI template selectedAssets[${index}] is invalid`);
    const assetId = readRequiredAiString(item.assetId, `selectedAssets[${index}].assetId`);
    const reason = readRequiredAiString(item.reason, `selectedAssets[${index}].reason`);
    if (!availableIds.has(assetId)) {
      throw new Error(`AI template selected unknown workspace asset ${assetId}`);
    }
    if (seen.has(assetId)) throw new Error(`AI template selected asset ${assetId} more than once`);
    seen.add(assetId);
    return { assetId, reason };
  });
}

function resolveSelectedAssets(
  selections: Array<{ assetId: string; reason: string }>,
  availableAssets: HarnessWorkspaceAssetSummary[]
): HarnessTemplateAssetSelection[] {
  const available = new Map(availableAssets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  return selections.flatMap((selection) => {
    const asset = available.get(selection.assetId);
    if (!asset || seen.has(asset.id)) return [];
    seen.add(asset.id);
    return [{
      ...asset,
      reason: selection.reason,
      installPath: `.harness/skills/${asset.slug || slugify(asset.name) || "skill"}`
    }];
  });
}

async function requestJson({
  apiKey,
  baseUrl,
  model,
  maxTokens,
  system,
  user,
  signal,
  onDelta
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  system: string;
  user: string;
  signal: AbortSignal;
  onDelta?: (delta: string) => void;
}): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      stream: true,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    }),
    signal
  });

  if (!response.ok) {
    const detail = await readProviderError(response);
    const classification = classifyProviderStatus(response.status);
    throw new ForgeAiRequestError(
      `AI provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      {
        ...classification,
        providerStatus: response.status,
        retryAfterMs: readRetryAfterMs(response.headers.get("retry-after"))
      }
    );
  }
  const content = await readStreamingResponseContent(response, onDelta);
  if (!content) {
    throw new ForgeAiRequestError("AI response did not contain JSON text.", {
      code: "invalid_response",
      retryable: true
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content)) as unknown;
  } catch {
    throw new ForgeAiRequestError("AI response JSON could not be parsed.", {
      code: "invalid_response",
      retryable: true
    });
  }
  if (!isRecord(parsed)) {
    throw new ForgeAiRequestError("AI response was not a JSON object.", {
      code: "invalid_response",
      retryable: true
    });
  }
  return parsed;
}

function requireForgeAiConfiguration(
  configuration: ForgeAiConfiguration | undefined,
  context: ForgeAiOperationContext
): ForgeAiConfiguration {
  if (!configuration) {
    const error = new ForgeAiRequestError(
      "Forge AI is not configured for this workspace. Configure and test it in Workspace Settings, then retry.",
      { code: "configuration", retryable: false }
    );
    const operationError = operationFailureFromRequestError(error, context, 0, 0);
    logForgeAiEvent(context, "error", "forge.ai.operation.failed", {
      durationMs: 0,
      code: error.code,
      retryable: error.retryable
    });
    throw operationError;
  }
  return configuration;
}

export async function runForgeAiOperation<T>(
  request: (context: ForgeAiAttemptContext) => Promise<T>,
  operation: ForgeAiOperationContext,
  policy: ForgeAiOperationPolicy
): Promise<T> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: ForgeAiRequestError | undefined;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const remainingMs = policy.totalTimeoutMs - elapsedMs;
    if (remainingMs <= 0) break;
    const timeoutMs = Math.max(1, Math.min(policy.attemptTimeoutMs, remainingMs));
    attempts = attempt;
    try {
      await operation.onAttempt?.(attempt, policy.maxAttempts);
    } catch {
      // A disconnected observer must not cancel the server-side operation.
    }
    logForgeAiEvent(operation, "info", "forge.ai.attempt.started", {
      attempt,
      maxAttempts: policy.maxAttempts,
      timeoutMs
    });

    try {
      const result = await request({
        attempt,
        timeoutMs,
        signal: AbortSignal.timeout(timeoutMs)
      });
      logForgeAiEvent(operation, "info", "forge.ai.operation.succeeded", {
        attempt,
        maxAttempts: policy.maxAttempts,
        durationMs: Math.max(0, Date.now() - startedAt)
      });
      return result;
    } catch (caught) {
      lastError = normalizeForgeAiRequestError(caught);
      logForgeAiEvent(operation, "warn", "forge.ai.attempt.failed", {
        attempt,
        maxAttempts: policy.maxAttempts,
        durationMs: Math.max(0, Date.now() - startedAt),
        code: lastError.code,
        retryable: lastError.retryable,
        providerStatus: lastError.providerStatus
      });
      if (!lastError.retryable || attempt >= policy.maxAttempts) break;

      const configuredDelay = policy.retryDelaysMs[attempt - 1] ?? 0;
      const delayMs = Math.max(configuredDelay, lastError.retryAfterMs ?? 0);
      const remainingAfterAttempt = policy.totalTimeoutMs - Math.max(0, Date.now() - startedAt);
      if (delayMs >= remainingAfterAttempt) break;
      logForgeAiEvent(operation, "info", "forge.ai.retry.scheduled", {
        attempt,
        maxAttempts: policy.maxAttempts,
        delayMs,
        code: lastError.code,
        retryable: true
      });
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const finalError = lastError ?? new ForgeAiRequestError(
    "AI operation exceeded its total time limit.",
    { code: "timeout", retryable: true }
  );
  const durationMs = Math.max(0, Date.now() - startedAt);
  const operationError = operationFailureFromRequestError(
    finalError,
    operation,
    attempts,
    durationMs
  );
  logForgeAiEvent(operation, "error", "forge.ai.operation.failed", {
    maxAttempts: policy.maxAttempts,
    durationMs,
    code: finalError.code,
    retryable: finalError.retryable,
    providerStatus: finalError.providerStatus
  });
  throw operationError;
}

function resolveForgeAiOperationContext(
  operation: ForgeAiOperation,
  model: string | undefined,
  context: ForgeAiOperationContext | undefined
): ForgeAiOperationContext {
  return {
    operationId: context?.operationId ?? randomUUID(),
    operation,
    workspaceId: context?.workspaceId,
    sessionId: context?.sessionId,
    model: context?.model ?? model,
    logger: context?.logger,
    onAttempt: context?.onAttempt,
    onDelta: context?.onDelta
  };
}

function normalizeForgeAiRequestError(error: unknown): ForgeAiRequestError {
  if (error instanceof ForgeAiRequestError) return error;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new ForgeAiRequestError("The AI provider did not respond before the request timed out.", {
      code: "timeout",
      retryable: true
    });
  }
  if (error instanceof TypeError) {
    return new ForgeAiRequestError(
      "Could not connect to the AI provider. Check the Base URL and server network access.",
      { code: "network", retryable: true }
    );
  }
  return new ForgeAiRequestError(
    error instanceof Error ? error.message : "AI provider returned an unusable response.",
    { code: "invalid_response", retryable: true }
  );
}

function operationFailureFromRequestError(
  error: ForgeAiRequestError,
  context: ForgeAiOperationContext,
  attempts: number,
  durationMs: number
): ForgeAiOperationError {
  return new ForgeAiOperationError({
    operationId: context.operationId,
    operation: context.operation,
    code: error.code,
    message: forgeAiFailureMessage(error, attempts),
    retryable: error.retryable,
    attempts,
    durationMs,
    occurredAt: new Date().toISOString()
  });
}

function forgeAiFailureMessage(error: ForgeAiRequestError, attempts: number): string {
  const attemptText = attempts === 1 ? "1 attempt" : `${attempts} attempts`;
  if (error.code === "configuration") return error.message;
  if (error.code === "timeout") {
    return `The AI provider timed out after ${attemptText}. Retry the operation or review the provider settings.`;
  }
  if (error.code === "network") {
    return `Could not reach the AI provider after ${attemptText}. Check provider availability and network access.`;
  }
  if (error.code === "rate_limited") {
    return `The AI provider is rate limiting Forge after ${attemptText}. Wait briefly, then retry.`;
  }
  if (error.code === "provider_auth") {
    return "The AI provider rejected the workspace credentials. Check the API key and provider permissions.";
  }
  if (error.code === "provider_rejected") {
    return `The AI provider rejected this request: ${error.message}`;
  }
  if (error.code === "provider_unavailable") {
    return `The AI provider remained unavailable after ${attemptText}. Retry when the provider recovers.`;
  }
  if (error.code === "invalid_response") {
    return `The AI provider returned an unusable response after ${attemptText}. Retry or try another model.`;
  }
  return `Forge AI failed after ${attemptText}: ${error.message}`;
}

function classifyProviderStatus(status: number): {
  code: ForgeAiFailureCode;
  retryable: boolean;
} {
  if (status === 401 || status === 403) return { code: "provider_auth", retryable: false };
  if (status === 429) return { code: "rate_limited", retryable: true };
  if (status === 408 || status === 425 || status >= 500) {
    return { code: "provider_unavailable", retryable: true };
  }
  return { code: "provider_rejected", retryable: false };
}

function readRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.max(0, timestamp - Date.now());
}

function logForgeAiEvent(
  context: ForgeAiOperationContext,
  level: ForgeAiLogLevel,
  event: ForgeAiLogEntry["event"],
  fields: Omit<
    ForgeAiLogEntry,
    "timestamp" | "event" | "operationId" | "operation" | "workspaceId" | "sessionId" | "model"
  >
): void {
  if (!context.logger) return;
  try {
    context.logger(level, {
      timestamp: new Date().toISOString(),
      event,
      operationId: context.operationId,
      operation: context.operation,
      workspaceId: context.workspaceId,
      sessionId: context.sessionId,
      model: context.model,
      ...fields
    });
  } catch {
    // Observability must never break the user operation.
  }
}

async function readStreamingResponseContent(
  response: Response,
  onDelta?: (delta: string) => void
): Promise<string> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => undefined) as unknown;
    const content = extractMessageContent(body);
    if (content) emitForgeAiDelta(onDelta, content);
    return content ?? "";
  }
  if (!response.body) {
    throw new ForgeAiRequestError("AI provider did not return a response stream.", {
      code: "invalid_response",
      retryable: true
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let dataLines: string[] = [];
  let content = "";

  const dispatchEvent = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") return;

    let payload: unknown;
    try {
      payload = JSON.parse(data) as unknown;
    } catch {
      throw new ForgeAiRequestError("AI provider emitted an invalid stream event.", {
        code: "invalid_response",
        retryable: true
      });
    }
    if (isRecord(payload) && payload.error) {
      const providerError = isRecord(payload.error) ? payload.error : payload;
      throw new ForgeAiRequestError(
        readString(providerError.message) ?? "AI provider reported a streaming error.",
        { code: "provider_unavailable", retryable: true }
      );
    }
    const delta = extractStreamDeltaContent(payload);
    if (!delta) return;
    content += delta;
    emitForgeAiDelta(onDelta, delta);
  };

  const processLines = (flush = false) => {
    const lines = pending.split("\n");
    pending = flush ? "" : (lines.pop() ?? "");
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "");
      if (!line) {
        dispatchEvent();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (flush) dispatchEvent();
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    processLines();
  }
  pending += decoder.decode();
  if (pending) pending += "\n";
  processLines(true);
  return content;
}

function extractStreamDeltaContent(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined;
  const choice = value.choices[0];
  if (!isRecord(choice)) return undefined;
  if (isRecord(choice.delta) && typeof choice.delta.content === "string") {
    return choice.delta.content || undefined;
  }
  if (isRecord(choice.message) && typeof choice.message.content === "string") {
    return choice.message.content || undefined;
  }
  return undefined;
}

function emitForgeAiDelta(onDelta: ((delta: string) => void) | undefined, delta: string): void {
  if (!onDelta) return;
  try {
    onDelta(delta);
  } catch {
    // A disconnected observer must not cancel the server-side operation.
  }
}

async function readProviderError(response: Response): Promise<string | undefined> {
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    const payload = JSON.parse(text) as unknown;
    if (isRecord(payload)) {
      const error = isRecord(payload.error) ? payload.error : payload;
      const message = readString(error.message);
      if (message) return message.replace(/\s+/g, " ").slice(0, 300);
    }
  } catch {
    // Fall through to a bounded plain-text provider error.
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 300) || undefined;
}

function extractMessageContent(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
  const content = choice.message.content;
  return typeof content === "string" && content.trim() ? content.slice(0, 200_000) : undefined;
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 4_000) : undefined;
}

function readFollowUpComponent(value: unknown): HarnessFollowUpComponent | undefined {
  if (!isRecord(value)) return undefined;
  const type = value.type;
  if (type !== "single-select" && type !== "multi-select" && type !== "text") {
    return undefined;
  }

  if (type === "text") {
    return {
      type,
      options: [],
      placeholder: readString(value.placeholder)?.slice(0, 240)
    };
  }

  const rawOptions = Array.isArray(value.options) ? value.options : [];
  const seen = new Set<string>();
  const options = rawOptions.flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = readString(item.label)?.slice(0, 120);
    if (!label || seen.has(label)) return [];
    seen.add(label);
    const description = readString(item.description)?.slice(0, 240);
    return [{ label, ...(description ? { description } : {}) }];
  }).slice(0, MAX_LIST_ITEMS);
  if (options.length < 2) return undefined;

  const maxSelections = type === "multi-select" && typeof value.maxSelections === "number"
    ? Math.max(1, Math.min(options.length, Math.floor(value.maxSelections)))
    : undefined;
  return {
    type,
    options,
    allowCustom: value.allowCustom !== false,
    ...(maxSelections ? { maxSelections } : {})
  };
}

function readFollowUpQuestions(
  value: unknown,
  maxQuestions: number
): HarnessFollowUpQuestion[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const questions: HarnessFollowUpQuestion[] = [];
  for (const item of value) {
    if (questions.length >= maxQuestions) break;
    if (!isRecord(item)) continue;
    const question = readString(item.question);
    const component = readFollowUpComponent(item.component);
    if (!question || !component || seen.has(question)) continue;
    seen.add(question);
    questions.push({ question, component });
  }
  return questions;
}

function readRequiredAiString(value: unknown, label: string): string {
  const result = readString(value);
  if (!result) throw new Error(`AI template ${label} is required`);
  return result;
}

function readAiStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`AI template ${label} must be an array`);
  const items = value.slice(0, MAX_LIST_ITEMS).map((item, index) => {
    const result = readString(item);
    if (!result) throw new Error(`AI template ${label}[${index}] must be a non-empty string`);
    return result;
  });
  return Array.from(new Set(items));
}

function readRequiredAiStringList(value: unknown, label: string): string[] {
  const items = readAiStringList(value, label);
  if (items.length === 0) throw new Error(`AI template ${label} cannot be empty`);
  return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function validateFrameworkFiles(files: HarnessTemplateFile[]): void {
  if (files.length === 0 || files.length > 20) throw new Error("Invalid generated file set");
  const allowedPaths = new Set([
    "AGENTS.md",
    ".harness/README.md",
    ".harness/project-brief.md",
    ".harness/context/stack.md",
    ".harness/rules/engineering.md",
    ".harness/workflows/delivery.md",
    ".harness/skills/README.md",
    ".harness/catalog/skills.json",
    ".harness/changes/CHANGELOG.md"
  ]);
  let totalChars = 0;
  for (const item of files) {
    const filePath = safeRelativePath(item.path);
    if (!allowedPaths.has(filePath)) {
      throw new Error("Generated file path is not part of the harness template");
    }
    if (typeof item.content !== "string" || item.content.length > 200_000) {
      throw new Error("Generated file is too large");
    }
    totalChars += item.content.length;
  }
  if (totalChars > 800_000) throw new Error("Generated template is too large");
}

function safeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("Invalid generated file path");
  }
  return normalized;
}

function file(path: string, content: string): HarnessTemplateFile {
  return { path, content: content.trimEnd() + "\n" };
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function numbered(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function agentGuide(
  spec: ForgeTemplateSpec,
  selectedAssets: HarnessTemplateAssetSelection[]
): string {
  return `# ${spec.name} Agent Guide

## Read First

Before changing the project, read:

1. \`.harness/README.md\`
2. \`.harness/project-brief.md\`
3. \`.harness/context/stack.md\`
4. \`.harness/rules/engineering.md\`
5. \`.harness/workflows/delivery.md\`
6. \`.harness/skills/README.md\`

## Working Contract

${bullets(spec.agentRules)}

## Workspace Skills

${selectedAssets.length
    ? "Use the selected workspace Skills when their descriptions match the current task. Each complete Skill package is included under `.harness/skills/` in the downloaded template."
    : "No workspace Skill was selected. Revisit the Harhub workspace catalog before adopting this baseline."}

## Change Record

Summarize material harness changes in \`.harness/changes/CHANGELOG.md\`, including what changed, why, verification evidence, and remaining risk.`;
}

function harnessReadme(
  spec: ForgeTemplateSpec,
  selectedAssets: HarnessTemplateAssetSelection[]
): string {
  return `# ${spec.name} Harness

${spec.summary}

This directory is a reviewable project harness template. It contains project context, standing rules, a delivery workflow, and a durable change record. Adapt it with the team before treating assumptions as policy.

## Contents

- \`project-brief.md\`: users, goals, constraints, and success criteria.
- \`context/stack.md\`: known technical context and decisions still needed.
- \`rules/engineering.md\`: standing instructions for agents.
- \`workflows/delivery.md\`: the first delivery workflow and verification gates.
- \`skills/\`: ${selectedAssets.length} selected Skill package${selectedAssets.length === 1 ? "" : "s"} from the current Harhub workspace.
- \`changes/CHANGELOG.md\`: the history of harness changes.`;
}

function selectedSkillsReadme(selectedAssets: HarnessTemplateAssetSelection[]): string {
  if (selectedAssets.length === 0) {
    return `# Selected Workspace Skills

No Skill matched this generated baseline. Add or refine Skills in the Harhub workspace, then regenerate the template.`;
  }

  return `# Selected Workspace Skills

These standard Agent Skill packages were selected from the current Harhub workspace and are copied into this directory when the template ZIP is downloaded.

${selectedAssets.map((asset) => [
    `## ${asset.displayName}`,
    "",
    asset.description,
    "",
    `- Source asset: \`${asset.id}\``,
    `- Install path: \`${asset.installPath}\``,
    `- Selection reason: ${asset.reason}`
  ].join("\n")).join("\n\n")}`;
}

function projectBrief(spec: ForgeTemplateSpec): string {
  return `# Project Brief

## Summary

${spec.summary}

## Target Users

${bullets(spec.targetUsers)}

## Goals

${bullets(spec.goals)}

## Constraints and Open Questions

${bullets(spec.constraints)}

## Success Criteria

${bullets(spec.successCriteria)}`;
}

function stackContext(spec: ForgeTemplateSpec): string {
  return `# Technical Context

Capture confirmed stack decisions and authoritative documentation here. Do not guess library versions or deployment constraints.

## Current Notes

${bullets(spec.stackNotes)}

## Before Implementation

- Confirm runtime, framework, persistence, deployment, and supported agent tools.
- Link primary documentation for each selected dependency.
- Record security, data, and environment boundaries.`;
}

function engineeringRules(spec: ForgeTemplateSpec): string {
  return `# Engineering Rules

These are standing project instructions. Review them with the team before adoption.

${bullets(spec.agentRules)}

## Default Quality Bar

- Keep changes scoped to the current goal.
- Preserve repository conventions and tenant or security boundaries.
- Add focused tests for behavioral changes.
- Verify the user-visible path, not only isolated implementation details.
- Report skipped checks and unresolved risks explicitly.`;
}

function deliveryWorkflow(spec: ForgeTemplateSpec): string {
  return `# ${spec.workflow.name}

## Objective

${spec.workflow.objective}

## Steps

${numbered(spec.workflow.steps)}

## Completion Evidence

${bullets(spec.workflow.verification)}`;
}
