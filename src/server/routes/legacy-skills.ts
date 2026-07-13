import type { Express } from "express";
import {
  filterCatalog
} from "../../features/skills/index.js";
import {
  describeWorkspaceCatalogStorage,
  loadState
} from "../../state/index.js";
import { loadOrCreateWorkspaceCatalog } from "../services/workspace-catalogs.js";

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
}

async function getDemoWorkspace() {
  return (await loadState()).workspaces[0]!;
}
