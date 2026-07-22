import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request } from "express";

import {
  claimGitHubWebhookDelivery,
  findProjectRepositoryConnection,
  finishGitHubWebhookDelivery,
  getProjectInventoryStateInternal,
  listProjectRepositoryConnectionsForInstallation,
  recordWorkspaceAuditEvent,
  saveProjectChangeProposal,
  updateProjectRepositoryConnectionStatus,
  updateProjectConnectionRepositoryMetadata,
  updateProjectGitHubRepositoryMetadata
} from "../../state/index.js";
import type { GitHubWebhookDeliveryRecord } from "../../state/types.js";
import { GITHUB_APP_WEBHOOK_SECRET } from "../config.js";
import { queueProjectRepositoryScan } from "../services/project-repository-inventory.js";

export function registerGitHubWebhookRoute(app: Express): void {
  app.post("/api/github/webhooks", express.raw({ type: "application/json", limit: "2mb" }), async (req, res) => {
    const deliveryId = req.header("x-github-delivery")?.trim();
    const event = req.header("x-github-event")?.trim();
    if (!GITHUB_APP_WEBHOOK_SECRET) {
      res.status(503).json({ error: "GitHub webhook integration is not configured." });
      return;
    }
    if (!deliveryId || !event || !Buffer.isBuffer(req.body) || !validSignature(req)) {
      res.status(401).json({ error: "GitHub webhook signature is invalid." });
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(req.body.toString("utf8")) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: "GitHub webhook payload is invalid." });
      return;
    }
    const installationId = nestedId(payload.installation);
    const repositoryId = nestedId(payload.repository);
    const action = typeof payload.action === "string" ? payload.action : undefined;
    const delivery: GitHubWebhookDeliveryRecord = {
      deliveryId,
      event,
      ...(action ? { action } : {}),
      ...(installationId ? { installationId } : {}),
      ...(repositoryId ? { repositoryId } : {}),
      status: "received",
      receivedAt: new Date().toISOString()
    };
    if (!(await claimGitHubWebhookDelivery(delivery))) {
      res.status(202).json({ accepted: true, duplicate: true });
      return;
    }
    res.status(202).json({ accepted: true });
    setImmediate(() => void processDelivery(delivery, payload));
  });
}

async function processDelivery(
  delivery: GitHubWebhookDeliveryRecord,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    if (!delivery.installationId) {
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "ignored" });
      return;
    }
    if (delivery.event === "installation" && ["deleted", "suspend"].includes(delivery.action ?? "")) {
      const connections = await listProjectRepositoryConnectionsForInstallation(delivery.installationId);
      const status = delivery.action === "deleted" ? "disconnected" as const : "permission-lost" as const;
      await Promise.all(connections.map((connection) =>
        updateProjectRepositoryConnectionStatus(connection.projectId, status).then(() =>
          recordPermissionLost(connection, delivery.deliveryId)
        )
      ));
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "processed" });
      return;
    }
    if (delivery.event === "installation" && delivery.action === "unsuspend") {
      const connections = await listProjectRepositoryConnectionsForInstallation(delivery.installationId);
      await Promise.all(connections.map((connection) =>
        updateProjectRepositoryConnectionStatus(connection.projectId, "active")
      ));
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "processed" });
      return;
    }
    if (delivery.event === "installation_repositories" && delivery.action === "removed") {
      const removed = Array.isArray(payload.repositories_removed) ? payload.repositories_removed : [];
      for (const repository of removed) {
        const repositoryId = nestedId(repository);
        if (!repositoryId) continue;
        const connection = await findProjectRepositoryConnection(delivery.installationId, repositoryId);
        if (connection) {
          await updateProjectRepositoryConnectionStatus(connection.projectId, "permission-lost");
          await recordPermissionLost(connection, delivery.deliveryId);
        }
      }
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "processed" });
      return;
    }
    if (delivery.event === "installation_repositories" && delivery.action === "added") {
      const added = new Set(
        (Array.isArray(payload.repositories_added) ? payload.repositories_added : [])
          .map(nestedId)
          .filter((id): id is string => Boolean(id))
      );
      const connections = await listProjectRepositoryConnectionsForInstallation(delivery.installationId);
      await Promise.all(connections
        .filter((connection) => added.has(connection.repositoryId))
        .map((connection) => updateProjectRepositoryConnectionStatus(connection.projectId, "active"))
      );
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "processed" });
      return;
    }
    if (!delivery.repositoryId) {
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "ignored" });
      return;
    }
    const connection = await findProjectRepositoryConnection(delivery.installationId, delivery.repositoryId);
    if (!connection) {
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "ignored" });
      return;
    }
    if (delivery.event === "push") {
      await updateConnectionFromPayload(connection, payload.repository);
      const ref = typeof payload.ref === "string" ? payload.ref : "";
      const deleted = payload.deleted === true;
      if (deleted || ref !== `refs/heads/${connection.defaultBranch}`) {
        await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "ignored" });
        return;
      }
      const after = typeof payload.after === "string" ? payload.after : undefined;
      await queueProjectRepositoryScan({
        workspaceId: connection.workspaceId,
        projectId: connection.projectId,
        trigger: "push",
        ...(after ? { requestedSha: after } : {})
      });
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "processed" });
      return;
    }
    if (delivery.event === "repository") {
      if (delivery.action === "deleted" || delivery.action === "archived") {
        await updateProjectRepositoryConnectionStatus(connection.projectId, "disconnected");
      } else {
        await updateConnectionFromPayload(connection, payload.repository);
      }
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "processed" });
      return;
    }
    if (delivery.event === "pull_request" && delivery.action === "closed") {
      const pullRequest = payload.pull_request && typeof payload.pull_request === "object" && !Array.isArray(payload.pull_request)
        ? payload.pull_request as Record<string, unknown>
        : undefined;
      const pullNumber = typeof pullRequest?.number === "number" ? pullRequest.number : undefined;
      const inventory = await getProjectInventoryStateInternal(connection.workspaceId, connection.projectId);
      const proposal = pullNumber
        ? inventory.proposals.find((candidate) => candidate.pullNumber === pullNumber)
        : undefined;
      if (!proposal) {
        await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "ignored" });
        return;
      }
      const merged = pullRequest?.merged === true;
      const updated = {
        ...proposal,
        status: merged ? "merged" as const : "closed" as const,
        updatedAt: new Date().toISOString(),
        ...(merged ? { mergedAt: new Date().toISOString() } : {})
      };
      await saveProjectChangeProposal(updated);
      await recordWorkspaceAuditEvent({
        workspaceId: connection.workspaceId,
        eventType: merged ? "project.proposal.merged" : "project.proposal.closed",
        entityType: "project",
        entityId: connection.projectId,
        source: "github-app",
        metadata: { proposalId: proposal.id, pullNumber, deliveryId: delivery.deliveryId },
        deduplicationKey: `project-proposal-${merged ? "merged" : "closed"}:${proposal.id}`
      });
      await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "processed" });
      return;
    }
    await finishGitHubWebhookDelivery(delivery.deliveryId, { status: "ignored" });
  } catch (error) {
    await finishGitHubWebhookDelivery(delivery.deliveryId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function validSignature(req: Request): boolean {
  const supplied = req.header("x-hub-signature-256");
  if (!supplied?.startsWith("sha256=") || !Buffer.isBuffer(req.body)) return false;
  const expected = `sha256=${createHmac("sha256", GITHUB_APP_WEBHOOK_SECRET!).update(req.body).digest("hex")}`;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function nestedId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "number" || typeof id === "string" ? String(id) : undefined;
}

async function updateConnectionFromPayload(
  connection: { workspaceId: string; projectId: string; repositoryId: string },
  value: unknown
): Promise<void> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const repository = value as Record<string, unknown>;
  const owner = repository.owner && typeof repository.owner === "object" && !Array.isArray(repository.owner)
    ? (repository.owner as Record<string, unknown>).login
    : undefined;
  const metadata = {
    ...(typeof owner === "string" ? { owner } : {}),
    ...(typeof repository.name === "string" ? { name: repository.name } : {}),
    ...(typeof repository.default_branch === "string" ? { defaultBranch: repository.default_branch } : {})
  };
  await updateProjectConnectionRepositoryMetadata(connection.projectId, metadata);
  await updateProjectGitHubRepositoryMetadata(
    connection.workspaceId,
    connection.projectId,
    connection.repositoryId,
    {
      ...metadata,
      ...(typeof repository.html_url === "string" ? { url: repository.html_url } : {})
    }
  );
}

async function recordPermissionLost(
  connection: { workspaceId: string; projectId: string; repositoryId: string },
  deliveryId: string
): Promise<void> {
  await recordWorkspaceAuditEvent({
    workspaceId: connection.workspaceId,
    eventType: "project.repository.permission_lost",
    entityType: "project",
    entityId: connection.projectId,
    source: "github-app",
    metadata: { repositoryId: connection.repositoryId, deliveryId },
    deduplicationKey: `project-repository-permission-lost:${deliveryId}:${connection.projectId}`
  });
}
