import type { Express } from "express";

import { listWorkspaceAuditEvents } from "../../state/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import { sendError, setPrivateNoStore } from "../utils/http.js";

export function registerAuditEventRoutes(app: Express): void {
  app.get("/api/workspaces/:workspaceId/events", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      res.json(await listWorkspaceAuditEvents(
        context.account.id,
        context.workspace.id,
        {
          limit: readOptionalLimit(req.query.limit),
          before: readOptionalString(req.query.before)
        }
      ));
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}

function readOptionalLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
