import type { Express } from "express";
import {
  createAssetCatalog
} from "../../features/assets/index.js";
import {
  filterCatalog,
  findSkill,
  scanSkills,
  validateSkills
} from "../../features/skills/index.js";
import { getWorkspaceCatalogPath } from "../../state/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import { createSkillAsset } from "../services/skill-factory.js";
import { loadOrCreateWorkspaceCatalog, scanAndPersistWorkspace } from "../services/workspace-catalogs.js";
import { hasErrors, readPathList, sendError, stringQuery } from "../utils/http.js";

export function registerSkillRoutes(app: Express): void {
  app.get("/api/workspaces/:workspaceId/skills", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    const catalog = loadOrCreateWorkspaceCatalog(context.workspace);
    const skills = filterCatalog(catalog, {
      tag: stringQuery(req.query.tag),
      owner: stringQuery(req.query.owner),
      packageName: stringQuery(req.query.package)
    });

    res.json({
      workspace: context.workspace,
      catalogPath: getWorkspaceCatalogPath(context.workspace.id),
      generatedAt: catalog.generatedAt,
      skills
    });
  });

  app.get("/api/workspaces/:workspaceId/skills/:query", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

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

    const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
    const skills = scanSkills({ roots });
    const issues = validateSkills(skills);
    const assetCatalog = createAssetCatalog(skills, issues);

    res.status(hasErrors(issues) ? 422 : 200).json({
      workspace: context.workspace,
      assets: assetCatalog.assets,
      skills,
      issues
    });
  });

  app.post("/api/workspaces/:workspaceId/skills", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;
    createSkillAsset(req, res, context.workspace, context.account.name);
  });
}
