import { randomUUID } from "node:crypto";

import type {
  ForgeAiOperationFailure,
  ForgeSessionDetail,
  ForgeSessionListResponse,
  ForgeSessionOperation,
  ForgeSessionSummary,
  HarnessFollowUpRequest,
  HarnessFollowUpResponse,
  HarnessInterviewAnswer,
  HarnessTemplateResponse
} from "../shared/types.js";
import { MAX_FORGE_INTERVIEW_ANSWERS } from "../shared/forge.js";
import { requireWorkspaceMembership } from "./records.js";
import { loadState, saveState } from "./store.js";
import type { AppState, ForgeSessionCacheRecord } from "./types.js";

export const FORGE_SESSION_TTL_DAYS = 30;
export const MAX_FORGE_SESSIONS_PER_ACCOUNT = 12;

const MAX_FORGE_SESSIONS_TOTAL = 200;
const MAX_FORGE_SESSION_BYTES = 1_250_000;
const FORGE_SESSION_TTL_MS = FORGE_SESSION_TTL_DAYS * 24 * 60 * 60 * 1_000;

export async function createForgeSession(
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

export async function listForgeSessions(
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

export async function getForgeSession(
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

export async function deleteForgeSession(
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

export async function beginForgeSessionOperation(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  operationId: string,
  operation: ForgeSessionOperation["operation"],
  answer?: HarnessInterviewAnswer
): Promise<{ input: HarnessFollowUpRequest; session: ForgeSessionDetail }> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  pruneForgeSessions(state);
  const current = findSession(state, accountId, workspaceId, sessionId);
  const next = structuredClone(current);

  if (answer) {
    if (current.answers.length >= MAX_FORGE_INTERVIEW_ANSWERS) {
      throw new Error(
        `Forge sessions support at most ${MAX_FORGE_INTERVIEW_ANSWERS} interview answers.`
      );
    }
    const expectedQuestion = current.followUp?.ready === false
      ? current.followUp.question
      : undefined;
    if (!expectedQuestion || expectedQuestion !== answer.question.trim()) {
      throw new Error("Forge answer does not match the current session question.");
    }
    next.answers.push({
      question: answer.question.trim(),
      answer: answer.answer.trim()
    });
    next.answerCount = next.answers.length;
  }

  const now = nextSessionTime(state);
  delete next.failure;
  next.status = "working";
  next.activeOperation = {
    operationId,
    operation,
    startedAt: now.toISOString(),
    attempt: 0
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

export async function recordForgeSessionAttempt(
  accountId: string,
  workspaceId: string,
  sessionId: string,
  operationId: string,
  attempt: number
): Promise<void> {
  const state = await loadState();
  requireWorkspaceMembership(state, accountId, workspaceId);
  const session = findSession(state, accountId, workspaceId, sessionId);
  if (session.activeOperation?.operationId !== operationId) return;
  session.activeOperation.attempt = attempt;
  assertSessionSize(session);
  await saveState(state);
}

export async function recordForgeSessionFollowUp(
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
    delete next.failure;
    delete next.activeOperation;
    return {
      ...next,
      status: "interviewing",
      answers: input.answers,
      answerCount: input.answers.length,
      followUp,
      updatedAt: now.toISOString(),
      expiresAt: expirationFrom(now)
    };
  });
}

export async function recordForgeSessionTemplate(
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
    delete next.failure;
    delete next.activeOperation;
    return {
      ...next,
      status: "complete",
      answers: input.answers,
      answerCount: input.answers.length,
      template,
      updatedAt: now.toISOString(),
      expiresAt: expirationFrom(now)
    };
  });
}

export async function recordForgeSessionFailure(
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
  const firstLine = requirement.split(/\r?\n/, 1)[0]?.replace(/\s+/g, " ").trim();
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
    title: session.title,
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
    ...(session.followUp ? { followUp: structuredClone(session.followUp) } : {}),
    ...(session.template ? { template: structuredClone(session.template) } : {}),
    ...(session.failure ? { failure: structuredClone(session.failure) } : {}),
    ...(session.activeOperation
      ? { activeOperation: structuredClone(session.activeOperation) }
      : {})
  };
}
