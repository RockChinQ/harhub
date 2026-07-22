import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request } from "express";

import {
  claimGitHubWebhookDelivery,
  findProjectRepositoryConnection,
  finishGitHubWebhookDelivery,
  listProjectRepositoryConnectionsForInstallation,
  recordWorkspaceAuditEvent,
  updateProjectRepositoryConnectionStatus
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
      await Promise.all(connections.map((connection) =>
        updateProjectRepositoryConnectionStatus(connection.projectId, "permission-lost").then(() =>
          recordPermissionLost(connection, delivery.deliveryId)
        )
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
