import type { Express } from "express";

import { summarizeGtmFunnel } from "../../features/gtm/funnel.js";
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

  app.get("/api/workspaces/:workspaceId/gtm/funnel", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    setPrivateNoStore(res);

    try {
      const since = readOptionalDate(req.query.since);
      const allEvents = [];
      let before: string | undefined;
      do {
        const page = await listWorkspaceAuditEvents(
          context.account.id,
          context.workspace.id,
          { limit: 200, ...(before ? { before } : {}) }
        );
        const selected = since
          ? page.events.filter((event) => event.occurredAt >= since)
          : page.events;
        allEvents.push(...selected);
        const reachedReportingWindow = since && page.events.some((event) => event.occurredAt < since);
        before = reachedReportingWindow ? undefined : page.nextBefore;
      } while (before);
      res.json({
        since: since ?? null,
        generatedAt: new Date().toISOString(),
        funnel: summarizeGtmFunnel(allEvents, since ? { since } : {})
      });
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

function readOptionalDate(value: unknown): string | undefined {
  const candidate = readOptionalString(value);
  if (!candidate) return undefined;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) throw new Error("since must be a valid ISO-8601 timestamp.");
  return parsed.toISOString();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
