import type { Express } from "express";
import {
  filterCatalog
} from "../../features/skills/index.js";
import {
  getWorkspaceCatalogPath,
  loadState
} from "../../state/index.js";
import { loadOrCreateWorkspaceCatalog, scanAndPersistWorkspace } from "../services/workspace-catalogs.js";
import { hasErrors, readPathList } from "../utils/http.js";

export function registerLegacySkillRoutes(app: Express): void {
  app.get("/api/skills", (req, res) => {
    const workspace = getDemoWorkspace();
    const catalog = loadOrCreateWorkspaceCatalog(workspace);
    const skills = filterCatalog(catalog);

    res.json({
      workspace,
      catalogPath: getWorkspaceCatalogPath(workspace.id),
      generatedAt: catalog.generatedAt,
      skills
    });
  });

  app.post("/api/skills/scan", (req, res) => {
    const workspace = getDemoWorkspace();
    const response = scanAndPersistWorkspace(
      workspace,
      readPathList(req.body?.paths, workspace.defaultScanPaths)
    );
    res.status(hasErrors(response.issues) ? 422 : 200).json(response);
  });
}

function getDemoWorkspace() {
  return loadState().workspaces[0]!;
}
