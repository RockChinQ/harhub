import type { Express } from "express";
import {
  filterCatalog
} from "../../features/skills/index.js";
import {
  describeWorkspaceCatalogStorage,
  loadState
} from "../../state/index.js";
import { loadOrCreateWorkspaceCatalog, scanAndPersistWorkspace } from "../services/workspace-catalogs.js";
import { readPathList } from "../utils/http.js";

export function registerLegacySkillRoutes(app: Express): void {
  app.get("/api/skills", async (req, res) => {
    const workspace = await getDemoWorkspace();
    const catalog = await loadOrCreateWorkspaceCatalog(workspace);
    const skills = filterCatalog(catalog);

    res.json({
      workspace,
      catalogStorage: describeWorkspaceCatalogStorage(workspace.id),
      generatedAt: catalog.generatedAt,
      skills
    });
  });

  app.post("/api/skills/scan", async (req, res) => {
    const workspace = await getDemoWorkspace();
    const response = await scanAndPersistWorkspace(
      workspace,
      readPathList(req.body?.paths, workspace.defaultScanPaths)
    );
    res.json(response);
  });
}

async function getDemoWorkspace() {
  return (await loadState()).workspaces[0]!;
}
