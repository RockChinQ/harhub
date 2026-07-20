import { randomUUID } from "node:crypto";

import type {
  ForgeOperationStreamEvent,
  ForgeSessionOperation
} from "../../shared/types.js";

const MAX_REPLAY_EVENTS = 1_000;
const MAX_REPLAY_BYTES = 512 * 1_024;
const COMPLETED_STREAM_TTL_MS = 60_000;

type ForgeStreamSubscriber = (event: ForgeOperationStreamEvent) => void;

export interface ForgeOperationStreamIdentity {
  accountId: string;
  workspaceId: string;
  sessionId: string;
}

export class ForgeOperationStream {
  readonly operationId = randomUUID();
  readonly operation: ForgeSessionOperation["operation"];
  readonly signal: AbortSignal;

  private readonly abortController = new AbortController();
  private readonly startedAt = Date.now();
  private readonly subscribers = new Set<ForgeStreamSubscriber>();
  private readonly replayEvents: Array<{
    event: ForgeOperationStreamEvent;
    bytes: number;
  }> = [];
  private replayBytes = 0;
  private terminal = false;

  constructor(operation: ForgeSessionOperation["operation"]) {
    this.operation = operation;
    this.signal = this.abortController.signal;
    this.publish({
      type: "operation",
      operationId: this.operationId,
      operation
    });
  }

  get done(): boolean {
    return this.terminal;
  }

  get cancelled(): boolean {
    return this.signal.aborted;
  }

  cancel(message = "Forge session was deleted."): boolean {
    if (this.terminal) return false;
    this.abortController.abort(new DOMException(message, "AbortError"));
    this.publish({
      type: "error",
      operationId: this.operationId,
      operation: this.operation,
      failure: {
        operationId: this.operationId,
        operation: this.operation,
        code: "cancelled",
        message,
        retryable: false,
        attempts: 0,
        durationMs: Math.max(0, Date.now() - this.startedAt),
        occurredAt: new Date().toISOString()
      }
    });
    return true;
  }

  throwIfCancelled(): void {
    if (this.signal.aborted) throw this.signal.reason;
  }

  publish(event: ForgeOperationStreamEvent): void {
    if (this.terminal) return;
    const bytes = Buffer.byteLength(JSON.stringify(event), "utf8") + 1;
    this.replayEvents.push({ event, bytes });
    this.replayBytes += bytes;
    this.trimReplayBuffer();

    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch {
        this.subscribers.delete(subscriber);
      }
    }

    if (event.type === "complete" || event.type === "error") {
      this.terminal = true;
      this.subscribers.clear();
    }
  }

  subscribe(subscriber: ForgeStreamSubscriber): () => void {
    for (const item of this.replayEvents) subscriber(item.event);
    if (!this.terminal) this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  private trimReplayBuffer(): void {
    while (
      this.replayEvents.length > MAX_REPLAY_EVENTS ||
      this.replayBytes > MAX_REPLAY_BYTES
    ) {
      const removed = this.replayEvents.shift();
      if (!removed) break;
      this.replayBytes -= removed.bytes;
    }
  }
}

const activeStreams = new Map<string, ForgeOperationStream>();

export function cancelForgeOperationStreams(
  identity: ForgeOperationStreamIdentity
): number {
  const key = streamKey(identity);
  const stream = activeStreams.get(key);
  if (!stream) return 0;
  activeStreams.delete(key);
  if (!stream.cancel()) return 0;
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "forge.ai.operation.cancelled",
    operationId: stream.operationId,
    operation: stream.operation,
    workspaceId: identity.workspaceId,
    sessionId: identity.sessionId
  }));
  return 1;
}

export function getOrCreateForgeOperationStream(
  identity: ForgeOperationStreamIdentity,
  operation: ForgeSessionOperation["operation"],
  execute: (stream: ForgeOperationStream) => Promise<void>
): ForgeOperationStream {
  const key = streamKey(identity);
  const existing = activeStreams.get(key);
  if (existing && !existing.done) {
    if (existing.operation !== operation) {
      throw new Error(
        `A Forge ${existing.operation} operation is already running for this session.`
      );
    }
    return existing;
  }

  const stream = new ForgeOperationStream(operation);
  activeStreams.set(key, stream);
  void Promise.resolve()
    .then(() => execute(stream))
    .catch((error: unknown) => {
      if (!stream.done) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "forge.ai.stream.executor.failed",
          operationId: stream.operationId,
          operation,
          workspaceId: identity.workspaceId,
          sessionId: identity.sessionId,
          message: message.slice(0, 300)
        }));
      }
    })
    .finally(() => scheduleStreamRemoval(key, stream));
  return stream;
}

function scheduleStreamRemoval(key: string, stream: ForgeOperationStream): void {
  const timeout = setTimeout(() => {
    if (activeStreams.get(key) === stream) activeStreams.delete(key);
  }, COMPLETED_STREAM_TTL_MS);
  timeout.unref();
}

function streamKey(identity: ForgeOperationStreamIdentity): string {
  return `${identity.accountId}\u0000${identity.workspaceId}\u0000${identity.sessionId}`;
}
