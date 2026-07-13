import type { Express } from "express";
import { filterAssets, findAsset } from "../../features/assets/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import { deleteAsset } from "../services/asset-mutations.js";
import { assetListPayload } from "../services/asset-responses.js";
import {
  validateWorkspaceAsset,
  validateWorkspaceAssets
} from "../services/asset-validation.js";
import { loadOrCreateWorkspaceAssetCatalog } from "../services/workspace-catalogs.js";
import { sendError } from "../utils/http.js";

export function registerSkillRoutes(app: Express): void {
  app.get("/api/workspaces/:workspaceId/skills", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const assets = filterAssets(catalog, {
      kind: "skill"
    });

    res.json(assetListPayload(context.workspace, catalog.generatedAt, assets));
  });

  app.get("/api/workspaces/:workspaceId/skills/:query", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    const asset = findAsset(await loadOrCreateWorkspaceAssetCatalog(context.workspace), req.params.query);
    if (asset) {
      res.json(asset);
      return;
    }

    res.status(404).json({ error: "Skill not found" });
  });

  app.post("/api/workspaces/:workspaceId/skills/validate", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const response = await validateWorkspaceAssets(context.workspace);
      res.json(response);
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/skills/:query/validate", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const response = await validateWorkspaceAsset(context.workspace, req.params.query);
      res.json(response);
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.delete("/api/workspaces/:workspaceId/skills/:query", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    await deleteAsset(req, res, context);
  });
}
