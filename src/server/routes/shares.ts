import type { Express } from "express";

import { requireWorkspaceAccess } from "../auth.js";
import {
  buildAgentSkillsDiscoveryIndex,
  getWorkspaceAssetShare,
  resolvePublicAssetShare,
  resolvePublicAssetShareArchive,
  shareWorkspaceAsset,
  unshareWorkspaceAsset
} from "../services/asset-shares.js";
import { loadStoredSkill } from "../services/skill-packages.js";
import { buildAssetContentPreview } from "../utils/zip-preview.js";
import { sendError, stringQuery } from "../utils/http.js";

export function registerShareRoutes(app: Express): void {
  app.get("/s/:token/.well-known/agent-skills/index.json", async (req, res) => {
    try {
      const resolved = await resolvePublicAssetShareArchive(req, req.params.token);
      if (!resolved) {
        res.status(404).json({ error: "Share not found or no longer available." });
        return;
      }

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(buildAgentSkillsDiscoveryIndex(
        resolved.response,
        resolved.asset,
        resolved.checksum
      ));
    } catch (error) {
      sendError(res, error, 500);
    }
  });

  app.get("/api/public/shares/:token", async (req, res) => {
    try {
      const resolved = await resolvePublicAssetShare(req, req.params.token);
      if (!resolved) {
        res.status(404).json({ error: "Share not found or no longer available." });
        return;
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.json(resolved.response);
    } catch (error) {
      sendError(res, error, 500);
    }
  });

  app.get("/api/public/shares/:token/preview", async (req, res) => {
    try {
      const resolved = await resolvePublicAssetShare(req, req.params.token);
      if (!resolved?.asset.storage) {
        res.status(404).json({ error: "Share not found or no longer available." });
        return;
      }

      const { files } = await loadStoredSkill(resolved.asset.storage);
      res.setHeader("Cache-Control", "private, no-store");
      res.json(buildAssetContentPreview(files, stringQuery(req.query.path)));
    } catch (error) {
      sendError(res, error, 500);
    }
  });

  app.get("/api/public/shares/:token/download", async (req, res) => {
    try {
      const resolved = await resolvePublicAssetShareArchive(req, req.params.token);
      if (!resolved) {
        res.status(404).json({ error: "Share not found or no longer available." });
        return;
      }

      const etag = `"sha256-${resolved.checksum}"`;
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Length", String(resolved.buffer.byteLength));
      res.setHeader("Content-Disposition", `attachment; filename="${resolved.response.fileName}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(resolved.buffer);
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
