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
import { hasErrors, readPathList, sendError, stringQuery } from "../utils/http.js";

export function registerSkillRoutes(app: Express): void {
  app.get("/api/workspaces/:workspaceId/skills", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const assets = filterAssets(catalog, {
      kind: "skill",
      tag: stringQuery(req.query.tag),
      owner: stringQuery(req.query.owner),
      packageName: stringQuery(req.query.package)
    });

    res.json(assetListPayload(context.workspace, catalog.generatedAt, assets));
  });

  app.get("/api/workspaces/:workspaceId/skills/:query", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    const asset = findAsset(loadOrCreateWorkspaceAssetCatalog(context.workspace), req.params.query);
    if (asset) {
      res.json(asset);
      return;
    }

    const skill = findSkill(loadOrCreateWorkspaceCatalog(context.workspace), req.params.query);
    if (!skill) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }

    res.json(skill);
  });

  app.post("/api/workspaces/:workspaceId/skills/scan", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
    const response = scanAndPersistWorkspace(context.workspace, roots);
    res.status(hasErrors(response.issues) ? 422 : 200).json(response);
  });

  app.post("/api/workspaces/:workspaceId/skills/validate", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    void (async () => {
      try {
        const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
        const response = await validateWorkspaceAssets(context.workspace, roots);
        res.status(hasErrors(response.issues) ? 422 : 200).json(response);
      } catch (error) {
        sendError(res, error, 400);
      }
    })();
  });

  app.post("/api/workspaces/:workspaceId/skills", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;
    createSkillAsset(req, res, context.workspace, context.account.name);
  });

  app.patch("/api/workspaces/:workspaceId/skills/:query", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;
    patchAsset(req, res, context);
  });

  app.post("/api/workspaces/:workspaceId/skills/:query/validate", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    void (async () => {
      try {
        const response = await validateWorkspaceAsset(context.workspace, req.params.query);
        res.status(hasErrors(response.validatedIssues ?? []) ? 422 : 200).json(response);
      } catch (error) {
        sendError(res, error, 400);
      }
    })();
  });

  app.delete("/api/workspaces/:workspaceId/skills/:query", async (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;
    await deleteAsset(req, res, context);
  });
}
