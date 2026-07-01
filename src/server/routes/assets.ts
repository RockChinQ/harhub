import type { Express, RequestHandler } from "express";
import {
  filterAssets,
  findAsset
} from "../../features/assets/index.js";
import { readStoredObject } from "../../storage/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import { createSkillAsset } from "../services/skill-factory.js";
import { deleteAsset, patchAsset } from "../services/asset-mutations.js";
import { handleAssetUpload } from "../services/asset-upload.js";
import { assetListPayload } from "../services/asset-responses.js";
import {
  validateWorkspaceAsset,
  validateWorkspaceAssets
} from "../services/asset-validation.js";
import {
  loadOrCreateWorkspaceAssetCatalog,
  scanAndPersistWorkspace
} from "../services/workspace-catalogs.js";
import { buildAssetPreview } from "../utils/zip-preview.js";
import {
  hasErrors,
  readPathList,
  sendError,
  stringQuery
} from "../utils/http.js";

export function registerAssetRoutes(
  app: Express,
  upload: { single(fieldName: string): RequestHandler }
): void {
  app.get("/api/workspaces/:workspaceId/assets", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const assets = filterAssets(catalog, {
      kind: stringQuery(req.query.kind),
      tag: stringQuery(req.query.tag),
      owner: stringQuery(req.query.owner),
      packageName: stringQuery(req.query.package)
    });

    res.json(assetListPayload(context.workspace, catalog.generatedAt, assets));
  });

  app.get("/api/workspaces/:workspaceId/assets/:query/preview", async (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
      const asset = findAsset(catalog, req.params.query);
      if (!asset) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }

      if (!asset.storage) {
        res.status(400).json({ error: "Asset has no stored zip to preview." });
        return;
      }

      const buffer = await readStoredObject(asset.storage);
      res.json(await buildAssetPreview(asset, buffer, stringQuery(req.query.path)));
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.get("/api/workspaces/:workspaceId/assets/:query", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    const asset = findAsset(loadOrCreateWorkspaceAssetCatalog(context.workspace), req.params.query);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    res.json(asset);
  });

  registerAssetMutationRoutes(app, upload);
}

function registerAssetMutationRoutes(
  app: Express,
  upload: { single(fieldName: string): RequestHandler }
): void {
  app.post("/api/workspaces/:workspaceId/assets/scan", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
    const response = scanAndPersistWorkspace(context.workspace, roots);
    res.status(hasErrors(response.issues) ? 422 : 200).json(response);
  });

  app.post("/api/workspaces/:workspaceId/assets/validate", (req, res) => {
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

  app.post("/api/workspaces/:workspaceId/assets/upload", upload.single("file"), async (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;
    await handleAssetUpload(req, res, context);
  });

  app.post("/api/workspaces/:workspaceId/assets", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;

    if (String(req.body?.kind ?? "skill") !== "skill") {
      res.status(400).json({ error: "Only skill assets are supported in this MVP." });
      return;
    }

    createSkillAsset(req, res, context.workspace, context.account.name);
  });

  app.patch("/api/workspaces/:workspaceId/assets/:query", (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;
    patchAsset(req, res, context);
  });

  app.post("/api/workspaces/:workspaceId/assets/:query/validate", (req, res) => {
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

  app.delete("/api/workspaces/:workspaceId/assets/:query", async (req, res) => {
    const context = requireWorkspaceAccess(req, res);
    if (!context) return;
    await deleteAsset(req, res, context);
  });
}
