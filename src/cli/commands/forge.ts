import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hasBooleanOption, optionString, optionStrings } from "../args.js";
import {
  downloadWorkspaceFile,
  requestWorkspaceJson,
  requestWorkspaceResponse
} from "../remote.js";
import type { ParsedArgs } from "../types.js";

interface ForgeAnswer {
  question: string;
  answer: string;
  lens?: string;
  gap?: string;
  intent?: string;
}

export async function runForgeCommand(subcommand: string, parsed: ParsedArgs): Promise<number> {
  try {
    switch (subcommand) {
      case "list":
        return output(parsed, await requestWorkspaceJson(parsed, "/forge/sessions"), "Forge sessions");
      case "show":
        return output(parsed, await requestWorkspaceJson(parsed, sessionPath(parsed)), "Forge session");
      case "create":
        return createSession(parsed);
      case "delete":
        requireYes(parsed, "delete this Forge session");
        await requestWorkspaceJson(parsed, sessionPath(parsed), { method: "DELETE" });
        return output(parsed, undefined, "Deleted Forge session");
      case "follow-up":
      case "generate":
        return streamOperation(parsed, subcommand);
      case "download":
      case "archive":
        return downloadArchive(parsed);
      case "freeze":
        return freezeSession(parsed);
      default:
        throw new Error(`Unknown forge command: ${subcommand}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function createSession(parsed: ParsedArgs): Promise<number> {
  const requirementFile = optionString(parsed, "requirement-file");
  const requirement = optionString(parsed, "requirement")
    ?? (requirementFile ? readFileSync(path.resolve(process.cwd(), requirementFile), "utf8") : undefined)
    ?? parsed.positionals.join(" ");
  if (!requirement.trim()) {
    throw new Error("Usage: harhub forge create <requirement> [--requirement-file <path>]");
  }
  return output(parsed, await requestWorkspaceJson(parsed, "/forge/sessions", {
    method: "POST",
    body: { requirement }
  }), "Created Forge session");
}

async function streamOperation(
  parsed: ParsedArgs,
  operation: "follow-up" | "generate"
): Promise<number> {
  const sessionId = requirePositional(parsed, 0, "session-id");
  const answers = readAnswers(parsed);
  const response = await requestWorkspaceResponse(
    parsed,
    `/forge/sessions/${encodeURIComponent(sessionId)}/${operation}`,
    { method: "POST", body: answers.length > 0 ? { answers } : {} }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throw new Error(isRecord(data) && typeof data.error === "string"
      ? data.error
      : `Forge operation failed with ${response.status}.`);
  }
  if (!response.body) throw new Error("Forge operation did not return a response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let terminal = false;
  let failed = false;
  let wroteDelta = false;

  const consume = (flush = false): void => {
    const lines = pending.split("\n");
    pending = flush ? "" : (lines.pop() ?? "");
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const event = JSON.parse(line) as Record<string, unknown>;
      if (hasBooleanOption(parsed, "json")) {
        console.log(JSON.stringify(event));
      } else if (event.type === "delta" && typeof event.delta === "string") {
        process.stdout.write(event.delta);
        wroteDelta = true;
      } else if (event.type === "progress") {
        console.error(`${event.step}: ${event.status}`);
      } else if (event.type === "attempt") {
        console.error(`Attempt ${event.attempt}/${event.maxAttempts}`);
      } else if (event.type === "complete") {
        if (wroteDelta) process.stdout.write("\n");
        console.log(`Forge ${operation} complete.`);
      } else if (event.type === "error") {
        if (wroteDelta) process.stdout.write("\n");
        const failure = isRecord(event.failure) ? event.failure.message : undefined;
        console.error(typeof failure === "string" ? failure : `Forge ${operation} failed.`);
      }
      if (event.type === "complete" || event.type === "error") terminal = true;
      if (event.type === "error") failed = true;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    if (pending.length > 1_000_000) throw new Error("Forge operation returned an oversized stream event.");
    consume();
  }
  pending += decoder.decode();
  if (pending) pending += "\n";
  consume(true);
  if (!terminal) throw new Error("Forge operation stream ended before a terminal event.");
  return failed ? 1 : 0;
}

async function downloadArchive(parsed: ParsedArgs): Promise<number> {
  const sessionId = requirePositional(parsed, 0, "session-id");
  const downloaded = await downloadWorkspaceFile(
    parsed,
    "/forge/archive",
    `forge-${sessionId}.zip`,
    { method: "POST", body: { sessionId } }
  );
  const destination = resolveOutputPath(optionString(parsed, "output"), downloaded.fileName);
  if (existsSync(destination) && !hasBooleanOption(parsed, "yes") && !hasBooleanOption(parsed, "force")) {
    throw new Error(`${destination} already exists. Pass --yes to overwrite it.`);
  }
  writeFileSync(destination, downloaded.buffer);
  return output(parsed, {
    sessionId,
    path: destination,
    fileName: downloaded.fileName,
    bytes: downloaded.buffer.byteLength
  }, `Downloaded Forge archive to ${destination}`);
}

async function freezeSession(parsed: ParsedArgs): Promise<number> {
  const sessionId = requirePositional(parsed, 0, "session-id");
  const name = parsed.positionals[1] ?? optionString(parsed, "name");
  if (!name) throw new Error("Usage: harhub forge freeze <session-id> <project-name> [--description text]");
  return output(parsed, await requestWorkspaceJson(
    parsed,
    `/forge/sessions/${encodeURIComponent(sessionId)}/freeze`,
    {
      method: "POST",
      body: compact({ name, description: optionString(parsed, "description") })
    }
  ), `Froze Forge session as project ${name}`);
}

function readAnswers(parsed: ParsedArgs): ForgeAnswer[] {
  const file = optionString(parsed, "answers-file");
  const fromFile = file ? JSON.parse(readFileSync(path.resolve(process.cwd(), file), "utf8")) : [];
  if (!Array.isArray(fromFile)) throw new Error("--answers-file must contain a JSON array.");
  const answers = fromFile.map(validateAnswer);
  for (const value of optionStrings(parsed, "answer")) {
    const separator = value.indexOf("=");
    if (separator <= 0) throw new Error("--answer must use question=answer format.");
    answers.push({ question: value.slice(0, separator), answer: value.slice(separator + 1) });
  }
  return answers;
}

function validateAnswer(value: unknown): ForgeAnswer {
  if (!isRecord(value) || typeof value.question !== "string" || typeof value.answer !== "string") {
    throw new Error("Each Forge answer must contain string question and answer fields.");
  }
  return value as unknown as ForgeAnswer;
}

function sessionPath(parsed: ParsedArgs): string {
  return `/forge/sessions/${encodeURIComponent(requirePositional(parsed, 0, "session-id"))}`;
}

function requirePositional(parsed: ParsedArgs, index: number, label: string): string {
  const value = parsed.positionals[index];
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}

function requireYes(parsed: ParsedArgs, action: string): void {
  if (!hasBooleanOption(parsed, "yes")) throw new Error(`Pass --yes to ${action}.`);
}

function resolveOutputPath(value: string | undefined, fileName: string): string {
  const candidate = path.resolve(process.cwd(), value ?? fileName);
  return existsSync(candidate) && statSync(candidate).isDirectory()
    ? path.join(candidate, fileName)
    : candidate;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function output(parsed: ParsedArgs, value: unknown, label: string): number {
  if (hasBooleanOption(parsed, "json")) {
    console.log(JSON.stringify(value ?? { ok: true }, null, 2));
    return 0;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) console.log("No Forge sessions found.");
    else for (const session of value) console.log(sessionLine(session));
    return 0;
  }
  if (isRecord(value)) {
    const sessions = Array.isArray(value.sessions) ? value.sessions : undefined;
    if (sessions) {
      if (sessions.length === 0) console.log("No Forge sessions found.");
      else for (const session of sessions) console.log(sessionLine(session));
      return 0;
    }
    const session = isRecord(value.session) ? value.session : value;
    const title = typeof session.title === "string" ? session.title : undefined;
    const id = typeof session.id === "string" ? session.id : undefined;
    if (title || id) {
      console.log(`${label}: ${title ?? id}${title && id ? ` (${id})` : ""}`);
      return 0;
    }
  }
  console.log(label);
  return 0;
}

function sessionLine(value: unknown): string {
  if (!isRecord(value)) return String(value);
  return [value.id, value.title, value.status, value.updatedAt]
    .filter((item) => typeof item === "string" && item)
    .join("\t");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
