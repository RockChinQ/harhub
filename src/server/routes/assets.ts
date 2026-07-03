import type { Express, RequestHandler } from "express";
import {
  filterAssets,
  findAsset
} from "../../features/assets/index.js";
import { readStoredObject } from "../../storage/index.js";
import { requireWorkspaceAccess } from "../auth.js";
import { createSkillAsset } from "../services/skill-factory.js";
import {
  deleteAsset,
  deleteWorkspaceAssetBatch,
  patchAsset
} from "../services/asset-mutations.js";
import { handleAssetUpload } from "../services/asset-upload.js";
import { assetListPayload } from "../services/asset-responses.js";
import {
  validateWorkspaceAsset,
  validateWorkspaceAssetBatch,
  validateWorkspaceAssets
} from "../services/asset-validation.js";
import {
  loadOrCreateWorkspaceAssetCatalog,
  scanAndPersistWorkspace
} from "../services/workspace-catalogs.js";
import { buildAssetPreview } from "../utils/zip-preview.js";
import {
  readPathList,
  sendError,
  stringQuery
} from "../utils/http.js";

export function registerAssetRoutes(
  app: Express,
  upload: { single(fieldName: string): RequestHandler }
): void {
  app.get("/api/workspaces/:workspaceId/assets", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const assets = filterAssets(catalog, {
      kind: stringQuery(req.query.kind)
    });

    res.json(assetListPayload(context.workspace, catalog.generatedAt, assets));
  });

  app.get("/api/workspaces/:workspaceId/assets/:query/preview", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
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

  app.get("/api/workspaces/:workspaceId/assets/:query", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    const asset = findAsset(await loadOrCreateWorkspaceAssetCatalog(context.workspace), req.params.query);
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
  app.post("/api/workspaces/:workspaceId/assets/scan", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    const roots = readPathList(req.body?.paths, context.workspace.defaultScanPaths);
    const response = await scanAndPersistWorkspace(context.workspace, roots);
    res.json(response);
  });

  app.post("/api/workspaces/:workspaceId/assets/validate", async (req, res) => {
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

  app.post("/api/workspaces/:workspaceId/assets/bulk", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const assetIds = readAssetIds(req.body?.assetIds);
      if (assetIds.length === 0) {
        res.status(400).json({ error: "assetIds must include at least one asset id." });
        return;
      }

      const action = String(req.body?.action ?? "");
      if (action === "validate") {
        res.json(await validateWorkspaceAssetBatch(context.workspace, assetIds));
        return;
      }

      if (action === "delete") {
        res.json(await deleteWorkspaceAssetBatch(context, assetIds));
        return;
      }

      res.status(400).json({ error: "Bulk action must be validate or delete." });
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/assets/upload", upload.single("file"), async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    await handleAssetUpload(req, res, context);
  });

  app.post("/api/workspaces/:workspaceId/assets", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    if (String(req.body?.kind ?? "skill") !== "skill") {
      res.status(400).json({ error: "Only skill assets are supported in this MVP." });
      return;
    }

    await createSkillAsset(req, res, context.workspace);
  });

  app.patch("/api/workspaces/:workspaceId/assets/:query", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    await patchAsset(req, res, context);
  });

  app.post("/api/workspaces/:workspaceId/assets/:query/validate", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;

    try {
      const response = await validateWorkspaceAsset(context.workspace, req.params.query);
      res.json(response);
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.delete("/api/workspaces/:workspaceId/assets/:query", async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    await deleteAsset(req, res, context);
  });
}

function readAssetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
