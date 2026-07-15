import type { Express } from "express";

import { readStoredObject } from "../../storage/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import {
  getWorkspaceAssetShare,
  resolvePublicAssetShare,
  shareWorkspaceAsset,
  unshareWorkspaceAsset
} from "../services/asset-shares.js";
import { sendError } from "../utils/http.js";

export function registerShareRoutes(app: Express): void {
  app.get("/api/public/shares/:token", async (req, res) => {
    try {
      const resolved = await resolvePublicAssetShare(req, req.params.token);
      if (!resolved) {
        res.status(404).json({ error: "Share not found or no longer available." });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json(resolved.response);
    } catch (error) {
      sendError(res, error, 500);
    }
  });

  app.get("/api/public/shares/:token/download", async (req, res) => {
    try {
      const resolved = await resolvePublicAssetShare(req, req.params.token);
      if (!resolved?.asset.storage) {
        res.status(404).json({ error: "Share not found or no longer available." });
        return;
      }

      const buffer = await readStoredObject(resolved.asset.storage);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Length", String(buffer.byteLength));
      res.setHeader("Content-Disposition", `attachment; filename="${resolved.response.fileName}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(buffer);
    } catch (error) {
      sendError(res, error, 500);
    }
  });

  app.get("/api/workspaces/:workspaceId/assets/:query/share", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const share = await getWorkspaceAssetShare(req, context, req.params.query);
      if (!share) {
        res.status(404).json({ error: "Asset is not shared." });
        return;
      }
      res.json(share);
    } catch (error) {
      sendError(res, error, 404);
    }
  });

  app.post("/api/workspaces/:workspaceId/assets/:query/share", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      res.status(201).json(await shareWorkspaceAsset(req, context, req.params.query));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.delete("/api/workspaces/:workspaceId/assets/:query/share", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      await unshareWorkspaceAsset(context, req.params.query);
      res.status(204).send();
    } catch (error) {
      sendError(res, error, 400);
    }
  });
}
