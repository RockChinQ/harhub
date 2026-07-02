import type { Express } from "express";
import { filterAssets, findAsset } from "../../features/assets/index.js";
import { findSkill } from "../../features/skills/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import { deleteAsset, patchAsset } from "../services/asset-mutations.js";
import { assetListPayload } from "../services/asset-responses.js";
import {
  validateWorkspaceAsset,
  validateWorkspaceAssets
} from "../services/asset-validation.js";
import { createSkillAsset } from "../services/skill-factory.js";
import {
  loadOrCreateWorkspaceAssetCatalog,
  loadOrCreateWorkspaceCatalog,
  scanAndPersistWorkspace
} from "../services/workspace-catalogs.js";
import { readPathList, sendError } from "../utils/http.js";

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

    const skill = findSkill(await loadOrCreateWorkspaceCatalog(context.workspace), req.params.query);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }

    res.json(skill);
  });

  app.post("/api/workspaces/:workspaceId/skills/scan", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
    const response = await scanAndPersistWorkspace(context.workspace, roots);
    res.json(response);
  });

  app.post("/api/workspaces/:workspaceId/skills/validate", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
      const response = await validateWorkspaceAssets(context.workspace, roots);
      res.json(response);
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/skills", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    await createSkillAsset(req, res, context.workspace);
  });

  app.patch("/api/workspaces/:workspaceId/skills/:query", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    await patchAsset(req, res, context);
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
