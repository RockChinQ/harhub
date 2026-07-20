import { randomUUID } from "node:crypto";

import type {
  ForgeAiOperationFailure,
  ForgeSessionDetail,
  ForgeSessionListResponse,
  ForgeSessionOperation,
  ForgeSessionSummary,
  ForgeSessionViewState,
  ForgeGenerationProgressStatus,
  ForgeGenerationProgressStep,
  HarnessFollowUpRequest,
  HarnessFollowUpResponse,
  HarnessInterviewAnswer,
  HarnessTemplateResponse
} from "../shared/types.js";
import { requireWorkspaceMembership } from "./records.js";
import { serializeStateAccess } from "./access.js";
import { loadState, saveState } from "./store.js";
import type { AppState, ForgeSessionCacheRecord } from "./types.js";

export const FORGE_SESSION_TTL_DAYS = 30;
export const MAX_FORGE_SESSIONS_PER_ACCOUNT = 12;

const MAX_FORGE_SESSIONS_TOTAL = 200;
const MAX_FORGE_SESSION_BYTES = 1_250_000;
const FORGE_SESSION_TTL_MS = FORGE_SESSION_TTL_DAYS * 24 * 60 * 60 * 1_000;

export function createForgeSession(
  accountId: string,
  workspaceId: string,
  requirement: string
): Promise<ForgeSessionDetail> {
  return serializeStateAccess(() => createForgeSessionImpl(
    accountId,
    workspaceId,
    requirement
  ));
}

export function listForgeSessions(
  accountId: string,
  workspaceId: string
): Promise<ForgeSessionListResponse> {
  return serializeStateAccess(() => listForgeSessionsImpl(accountId, workspaceId));
}

export function getForgeSession(
  accountId: string,
  workspaceId: string,
  sessionId: string
): Promise<ForgeSessionDetail> {
  return serializeStateAccess(() => getForgeSessionImpl(accountId, workspaceId, sessionId));
}

export function deleteForgeSession(
  accountId: string,
  workspaceId: string,
  sessionId: string
): Promise<void> {
  return serializeStateAccess(() => deleteForgeSessionImpl(
    accountId,
    workspaceId,
    sessionId
  ));
}

export function beginForgeSessionOperation(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  operationId: string,
  operation: ForgeSessionOperation["operation"],
  answers?: HarnessInterviewAnswer[]
): Promise<{ input: HarnessFollowUpRequest; session: ForgeSessionDetail }> {
  return serializeStateAccess(() => beginForgeSessionOperationImpl(
    accountId,
    workspaceId,
    sessionId,
    operationId,
    operation,
    answers
  ));
}

export function recordForgeSessionAttempt(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  operationId: string,
  attempt: number,
  maxAttempts?: number
): Promise<void> {
  return serializeStateAccess(() => recordForgeSessionAttemptImpl(
    accountId,
    workspaceId,
    sessionId,
    operationId,
    attempt,
    maxAttempts
  ));
}

export function recordForgeSessionProgress(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  operationId: string,
  step: ForgeGenerationProgressStep,
  status: ForgeGenerationProgressStatus
): Promise<void> {
  return serializeStateAccess(() => recordForgeSessionProgressImpl(
    accountId,
    workspaceId,
    sessionId,
    operationId,
    step,
    status
  ));
}

export function updateForgeSessionViewState(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  viewState: ForgeSessionViewState
): Promise<ForgeSessionDetail> {
  return serializeStateAccess(() => updateForgeSessionViewStateImpl(
    accountId,
    workspaceId,
    sessionId,
    viewState
  ));
}

export function recordForgeSessionFollowUp(
  accountId: string,
  workspaceId: string,
  input: HarnessFollowUpRequest,
  followUp: HarnessFollowUpResponse,
  operationId?: string
): Promise<void> {
  return serializeStateAccess(() => recordForgeSessionFollowUpImpl(
    accountId,
    workspaceId,
    input,
    followUp,
    operationId
  ));
}

export function recordForgeSessionTemplate(
  accountId: string,
  workspaceId: string,
  input: HarnessFollowUpRequest,
  template: HarnessTemplateResponse,
  operationId?: string
): Promise<void> {
  return serializeStateAccess(() => recordForgeSessionTemplateImpl(
    accountId,
    workspaceId,
    input,
    template,
    operationId
  ));
}

export function recordForgeSessionFailure(
  accountId: string,
  workspaceId: string,
  input: HarnessFollowUpRequest,
  failure: ForgeAiOperationFailure,
  operationId?: string
): Promise<void> {
  return serializeStateAccess(() => recordForgeSessionFailureImpl(
    accountId,
    workspaceId,
    input,
    failure,
    operationId
  ));
}

async function createForgeSessionImpl(
  accountId: string,
  workspaceId: string,
  requirement: string
): Promise<ForgeSessionDetail> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  pruneForgeSessions(state);

  const now = nextSessionTime(state);
  const normalizedRequirement = requirement.trim();
  const session: ForgeSessionCacheRecord = {
    id: randomUUID(),
    workspaceId,
    accountId,
    title: createSessionTitle(normalizedRequirement),
    status: "interviewing",
    requirement: normalizedRequirement,
    answers: [],
    answerCount: 0,
    viewState: defaultForgeSessionViewState(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expirationFrom(now)
  };
  assertSessionSize(session);
  state.forgeSessions.push(session);
  pruneForgeSessions(state);
  await saveState(state);
  return toDetail(session);
}

async function listForgeSessionsImpl(
  accountId: string,
  workspaceId: string
): Promise<ForgeSessionListResponse> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  const previousCount = state.forgeSessions.length;
  pruneForgeSessions(state);
  if (state.forgeSessions.length !== previousCount) await saveState(state);

  return {
    sessions: state.forgeSessions
      .filter((item) => item.accountId === accountId && item.workspaceId === workspaceId)
      .sort(newestFirst)
      .map(toSummary),
    cache: {
      maxSessions: MAX_FORGE_SESSIONS_PER_ACCOUNT,
      ttlDays: FORGE_SESSION_TTL_DAYS
    }
  };
}

async function getForgeSessionImpl(
  accountId: string,
  workspaceId: string,
  sessionId: string
): Promise<ForgeSessionDetail> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  const previousCount = state.forgeSessions.length;
  pruneForgeSessions(state);
  if (state.forgeSessions.length !== previousCount) await saveState(state);
  const session = findSession(state, accountId, workspaceId, sessionId);
  return toDetail(session);
}

async function deleteForgeSessionImpl(
  accountId: string,
  workspaceId: string,
  sessionId: string
): Promise<void> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  const next = state.forgeSessions.filter(
    (item) => !(
      item.accountId === accountId &&
      item.workspaceId === workspaceId &&
      item.id === sessionId
    )
  );
  if (next.length === state.forgeSessions.length) throw new Error("Forge session not found.");
  state.forgeSessions = next;
  await saveState(state);
}

async function beginForgeSessionOperationImpl(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  operationId: string,
  operation: ForgeSessionOperation["operation"],
  answers?: HarnessInterviewAnswer[]
): Promise<{ input: HarnessFollowUpRequest; session: ForgeSessionDetail }> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  pruneForgeSessions(state);
  const current = findSession(state, accountId, workspaceId, sessionId);
  const next = structuredClone(current);

  if (
    current.status === "working" &&
    current.activeOperation &&
    current.activeOperation.operation !== operation
  ) {
    throw new Error(
      `The interrupted Forge ${current.activeOperation.operation} operation must be resumed first.`
    );
  }
  if (current.status === "working" && current.activeOperation && answers?.length) {
    throw new Error("The interrupted Forge operation already saved its submitted answers.");
  }

  if (answers?.length) {
    const expectedQuestions = currentForgeQuestions(current.followUp);
    const submitted = new Map<string, HarnessInterviewAnswer>();
    for (const answer of answers) {
      const question = answer.question.trim();
      if (submitted.has(question)) throw new Error("Forge answers contain a duplicate question.");
      if (!expectedQuestions.includes(question)) {
        throw new Error("Forge answer does not match the current session questions.");
      }
      submitted.set(question, {
        question,
        answer: answer.answer.trim()
      });
    }
    if (expectedQuestions.some((question) => !submitted.has(question))) {
      throw new Error("Answer every current Forge question before continuing.");
    }
    next.answers.push(...expectedQuestions.flatMap((question) => {
      const answer = submitted.get(question);
      return answer ? [answer] : [];
    }));
    next.answerCount = next.answers.length;
  }

  const now = nextSessionTime(state);
  const recoveryCount = current.status === "working" && current.activeOperation
    ? (current.activeOperation.recoveryCount ?? 0) + 1
    : 0;
  if (current.status === "working" && current.activeOperation) {
    next.lastOperation = structuredClone(current.activeOperation);
  }
  delete next.failure;
  next.status = "working";
  next.viewState.followUpDrafts = [];
  next.activeOperation = {
    operationId,
    operation,
    startedAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    attempt: 0,
    recoveryCount,
    ...(operation === "generate" ? { progress: {} } : {})
  };
  next.updatedAt = now.toISOString();
  next.expiresAt = expirationFrom(now);
  assertSessionSize(next);
  state.forgeSessions = state.forgeSessions.map((item) => (
    item.id === next.id && item.accountId === accountId && item.workspaceId === workspaceId
      ? next
      : item
  ));
  pruneForgeSessions(state);
  await saveState(state);
  return {
    input: {
      requirement: next.requirement,
      answers: structuredClone(next.answers),
      sessionId: next.id
    },
    session: toDetail(next)
  };
}

function currentForgeQuestions(followUp: ForgeSessionDetail["followUp"]): string[] {
  if (!followUp || followUp.ready) return [];
  const questions = followUp.questions
    ?.map((item) => item.question.trim())
    .filter(Boolean) ?? [];
  if (questions.length > 0) return Array.from(new Set(questions));
  const legacyQuestion = followUp.question?.trim();
  return legacyQuestion ? [legacyQuestion] : [];
}

async function recordForgeSessionAttemptImpl(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  operationId: string,
  attempt: number,
  maxAttempts?: number
): Promise<void> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  const session = findSession(state, accountId, workspaceId, sessionId);
  if (session.activeOperation?.operationId !== operationId) return;
  const now = nextSessionTime(state);
  session.activeOperation.attempt = attempt;
  session.activeOperation.maxAttempts = maxAttempts;
  session.activeOperation.lastActivityAt = now.toISOString();
  session.updatedAt = now.toISOString();
  session.expiresAt = expirationFrom(now);
  assertSessionSize(session);
  await saveState(state);
}

async function recordForgeSessionProgressImpl(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  operationId: string,
  step: ForgeGenerationProgressStep,
  status: ForgeGenerationProgressStatus
): Promise<void> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  const session = findSession(state, accountId, workspaceId, sessionId);
  if (
    session.activeOperation?.operationId !== operationId ||
    session.activeOperation.operation !== "generate"
  ) return;
  const now = nextSessionTime(state);
  session.activeOperation.progress ??= {};
  session.activeOperation.progress[step] = status;
  session.activeOperation.lastActivityAt = now.toISOString();
  session.updatedAt = now.toISOString();
  session.expiresAt = expirationFrom(now);
  assertSessionSize(session);
  await saveState(state);
}

async function updateForgeSessionViewStateImpl(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  viewState: ForgeSessionViewState
): Promise<ForgeSessionDetail> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  pruneForgeSessions(state);
  const current = findSession(state, accountId, workspaceId, sessionId);
  if (current.status === "working") {
    throw new Error("Forge view state cannot change while an operation is running.");
  }
  validateForgeSessionViewState(current, viewState);
  const next = structuredClone(current);
  const now = nextSessionTime(state);
  next.viewState = structuredClone(viewState);
  next.updatedAt = now.toISOString();
  next.expiresAt = expirationFrom(now);
  assertSessionSize(next);
  state.forgeSessions = state.forgeSessions.map((item) => (
    item.id === next.id && item.accountId === accountId && item.workspaceId === workspaceId
      ? next
      : item
  ));
  pruneForgeSessions(state);
  await saveState(state);
  return toDetail(next);
}

async function recordForgeSessionFollowUpImpl(
  accountId: string,
  workspaceId: string,
  input: HarnessFollowUpRequest,
  followUp: HarnessFollowUpResponse,
  operationId?: string
): Promise<void> {
  if (!input.sessionId) return;
  await updateForgeSession(accountId, workspaceId, input, (session, now) => {
    assertCurrentForgeOperation(session, operationId);
    const next = structuredClone(session);
    if (next.activeOperation) {
      next.activeOperation.lastActivityAt = now.toISOString();
      next.lastOperation = structuredClone(next.activeOperation);
    }
    delete next.failure;
    delete next.activeOperation;
    next.viewState.followUpDrafts = [];
    return {
      ...next,
      ...(!session.followUp && followUp.sessionTitle
        ? { title: normalizeSessionTitle(followUp.sessionTitle) }
        : {}),
      status: "interviewing",
      answers: input.answers,
      answerCount: input.answers.length,
      followUp,
      updatedAt: now.toISOString(),
      expiresAt: expirationFrom(now)
    };
  });
}

async function recordForgeSessionTemplateImpl(
  accountId: string,
  workspaceId: string,
  input: HarnessFollowUpRequest,
  template: HarnessTemplateResponse,
  operationId?: string
): Promise<void> {
  if (!input.sessionId) return;
  await updateForgeSession(accountId, workspaceId, input, (session, now) => {
    assertCurrentForgeOperation(session, operationId);
    const next = structuredClone(session);
    if (next.activeOperation) {
      next.activeOperation.progress ??= {};
      next.activeOperation.progress.save = "complete";
      next.activeOperation.lastActivityAt = now.toISOString();
      next.lastOperation = structuredClone(next.activeOperation);
    }
    delete next.failure;
    delete next.activeOperation;
    next.viewState.followUpDrafts = [];
    return {
      ...next,
      title: normalizeSessionTitle(template.profile.name),
      status: "complete",
      answers: input.answers,
      answerCount: input.answers.length,
      template,
      updatedAt: now.toISOString(),
      expiresAt: expirationFrom(now)
    };
  });
}

async function recordForgeSessionFailureImpl(
  accountId: string,
  workspaceId: string,
  input: HarnessFollowUpRequest,
  failure: ForgeAiOperationFailure,
  operationId?: string
): Promise<void> {
  if (!input.sessionId) return;
  await updateForgeSession(accountId, workspaceId, input, (session, now) => {
    assertCurrentForgeOperation(session, operationId);
    const next = structuredClone(session);
    if (next.activeOperation) {
      next.activeOperation.lastActivityAt = now.toISOString();
      next.lastOperation = structuredClone(next.activeOperation);
    }
    delete next.activeOperation;
    return {
      ...next,
      status: "failed",
      answers: input.answers,
      answerCount: input.answers.length,
      failure: structuredClone(failure),
      updatedAt: now.toISOString(),
      expiresAt: expirationFrom(now)
    };
  });
}

async function updateForgeSession(
  accountId: string,
  workspaceId: string,
  input: HarnessFollowUpRequest,
  update: (session: ForgeSessionCacheRecord, now: Date) => ForgeSessionCacheRecord
): Promise<void> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  pruneForgeSessions(state);
  const current = findSession(state, accountId, workspaceId, input.sessionId ?? "");
  if (current.requirement !== input.requirement.trim()) {
    throw new Error("Forge session does not match this requirement.");
  }

  const next = update(structuredClone(current), nextSessionTime(state));
  assertSessionSize(next);
  state.forgeSessions = state.forgeSessions.map((item) => (
    item.id === next.id && item.accountId === accountId && item.workspaceId === workspaceId
      ? next
      : item
  ));
  pruneForgeSessions(state);
  await saveState(state);
}

function findSession(
  state: AppState,
  accountId: string,
  workspaceId: string,
  sessionId: string
): ForgeSessionCacheRecord {
  const session = state.forgeSessions.find(
    (item) => item.id === sessionId && item.accountId === accountId && item.workspaceId === workspaceId
  );
  if (!session) throw new Error("Forge session not found.");
  return session;
}

function assertCurrentForgeOperation(
  session: ForgeSessionCacheRecord,
  operationId: string | undefined
): void {
  if (operationId && session.activeOperation?.operationId !== operationId) {
    throw new Error("Forge operation was superseded by a newer session operation.");
  }
}

function pruneForgeSessions(state: AppState): void {
  const now = Date.now();
  const active = state.forgeSessions.filter((item) => Date.parse(item.expiresAt) > now);
  const retainedIds = new Set<string>();
  const ownerWorkspaceGroups = new Map<string, ForgeSessionCacheRecord[]>();

  for (const session of active) {
    const key = `${session.accountId}\u0000${session.workspaceId}`;
    const group = ownerWorkspaceGroups.get(key) ?? [];
    group.push(session);
    ownerWorkspaceGroups.set(key, group);
  }
  for (const group of ownerWorkspaceGroups.values()) {
    group.sort(newestFirst)
      .slice(0, MAX_FORGE_SESSIONS_PER_ACCOUNT)
      .forEach((item) => retainedIds.add(item.id));
  }

  state.forgeSessions = active
    .filter((item) => retainedIds.has(item.id))
    .sort(newestFirst)
    .slice(0, MAX_FORGE_SESSIONS_TOTAL);
}

function createSessionTitle(requirement: string): string {
  const firstLine = requirement.split(/\r?\n/, 1)[0];
  return normalizeSessionTitle(firstLine || "Untitled Forge session");
}

function normalizeSessionTitle(value: string): string {
  const firstLine = value.split(/\r?\n/, 1)[0]?.replace(/\s+/g, " ").trim();
  if (!firstLine) return "Untitled Forge session";
  return firstLine.length <= 72 ? firstLine : `${firstLine.slice(0, 69).trimEnd()}…`;
}

function assertSessionSize(session: ForgeSessionCacheRecord): void {
  if (Buffer.byteLength(JSON.stringify(session), "utf8") > MAX_FORGE_SESSION_BYTES) {
    throw new Error("Forge session is too large to keep in history.");
  }
}

function expirationFrom(now: Date): string {
  return new Date(now.getTime() + FORGE_SESSION_TTL_MS).toISOString();
}

function nextSessionTime(state: AppState): Date {
  const latestTimestamp = state.forgeSessions.reduce(
    (latest, item) => Math.max(latest, Date.parse(item.updatedAt) || 0),
    0
  );
  return new Date(Math.max(Date.now(), latestTimestamp + 1));
}

function newestFirst(left: ForgeSessionCacheRecord, right: ForgeSessionCacheRecord): number {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function toSummary(session: ForgeSessionCacheRecord): ForgeSessionSummary {
  return {
    id: session.id,
    title: normalizeSessionTitle(session.template?.profile.name ?? session.title),
    status: session.status,
    answerCount: session.answerCount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt
  };
}

function toDetail(session: ForgeSessionCacheRecord): ForgeSessionDetail {
  return {
    ...toSummary(session),
    requirement: session.requirement,
    answers: structuredClone(session.answers),
    viewState: structuredClone(session.viewState ?? defaultForgeSessionViewState()),
    ...(session.followUp ? { followUp: structuredClone(session.followUp) } : {}),
    ...(session.template ? { template: structuredClone(session.template) } : {}),
    ...(session.failure ? { failure: structuredClone(session.failure) } : {}),
    ...(session.activeOperation
      ? { activeOperation: structuredClone(session.activeOperation) }
      : {}),
    ...(session.lastOperation
      ? { lastOperation: structuredClone(session.lastOperation) }
      : {}),
    ...(session.frozenProject
      ? { frozenProject: structuredClone(session.frozenProject) }
      : {})
  };
}

function defaultForgeSessionViewState(): ForgeSessionViewState {
  return {
    followUpDrafts: [],
    markdownView: "preview"
  };
}

function validateForgeSessionViewState(
  session: ForgeSessionCacheRecord,
  viewState: ForgeSessionViewState
): void {
  const currentQuestions = new Map(
    session.followUp?.questions?.map((item) => [item.question.trim(), item.component]) ?? []
  );
  if (currentQuestions.size === 0 && session.followUp?.question && session.followUp.component) {
    currentQuestions.set(session.followUp.question.trim(), session.followUp.component);
  }
  const draftQuestions = new Set<string>();
  for (const draft of viewState.followUpDrafts) {
    const component = currentQuestions.get(draft.question);
    if (!component) {
      throw new Error("Forge draft does not match the current session questions.");
    }
    if (draftQuestions.has(draft.question)) {
      throw new Error("Forge drafts contain a duplicate question.");
    }
    draftQuestions.add(draft.question);
    if (new Set(draft.selectedOptions).size !== draft.selectedOptions.length) {
      throw new Error("Forge draft contains a duplicate selected option.");
    }
    const allowedOptions = new Set(component.options.map((option) => option.label));
    if (draft.selectedOptions.some((option) => !allowedOptions.has(option))) {
      throw new Error("Forge draft contains an option that is not available.");
    }
    const maxSelections = component.type === "single-select"
      ? 1
      : component.type === "multi-select"
        ? component.maxSelections ?? component.options.length
        : 0;
    if (draft.selectedOptions.length > maxSelections) {
      throw new Error("Forge draft exceeds the question selection limit.");
    }
    if (component.type !== "text" && !component.allowCustom && draft.customAnswer) {
      throw new Error("Forge draft does not allow a custom answer.");
    }
  }
  if (viewState.selectedPath && !session.template) {
    throw new Error("Forge preview selection requires a completed framework.");
  }
  if (viewState.selectedPath && session.template) {
    const isGeneratedFile = session.template.files.some(
      (file) => file.path === viewState.selectedPath
    );
    const isSelectedSkillFile = session.template.selectedAssets.some(
      (asset) => viewState.selectedPath?.startsWith(`${asset.installPath}/`)
    );
    if (!isGeneratedFile && !isSelectedSkillFile) {
      throw new Error("Forge preview selection is not part of this framework.");
    }
  }
  if (viewState.projectDraft) {
    if (!session.template) {
      throw new Error("A Project draft requires a completed framework.");
    }
    if (viewState.projectDraft.name.length > 120) {
      throw new Error("Forge Project draft name is too long.");
    }
  }
}
