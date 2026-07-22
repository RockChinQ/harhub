import type { Express, RequestHandler } from "express";
import {
  filterAssets,
  findAsset
} from "../../features/assets/index.js";
import { requireWorkspaceAccess, requireWorkspaceAdminAccess } from "../auth.js";
import {
  deleteAsset,
  deleteWorkspaceAssetBatch
} from "../services/asset-mutations.js";
import {
  handleAssetImportPreview,
  handleAssetUpload
} from "../services/asset-upload.js";
import {
  getWorkspaceAssetVersionArchive,
  rollbackWorkspaceAssetVersion
} from "../services/asset-versions.js";
import { assetListPayload } from "../services/asset-responses.js";
import { loadStoredSkill } from "../services/skill-packages.js";
import {
  validateWorkspaceAsset,
  validateWorkspaceAssetBatch,
  validateWorkspaceAssets
} from "../services/asset-validation.js";
import { loadOrCreateWorkspaceAssetCatalog } from "../services/workspace-catalogs.js";
import { buildAssetPreview } from "../utils/zip-preview.js";
import {
  sendError,
  setPrivateNoStore,
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
    setPrivateNoStore(res);

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

      const { files } = await loadStoredSkill(asset.storage);
      res.json(buildAssetPreview(
        asset,
        files,
        req.query.treeOnly === "true" ? null : stringQuery(req.query.path)
      ));
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

  app.get(
    "/api/workspaces/:workspaceId/assets/:query/versions/:version/download",
    async (req, res) => {
      const context = await requireWorkspaceAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);
      try {
        const archive = await getWorkspaceAssetVersionArchive({
          workspace: context.workspace,
          assetQuery: req.params.query,
          version: readVersion(req.params.version)
        });
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Length", String(archive.buffer.byteLength));
        res.setHeader("Content-Disposition", `attachment; filename="${archive.fileName}"`);
        res.setHeader("ETag", `"sha256-${archive.checksum}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.send(archive.buffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendError(res, error, assetVersionErrorStatus(message, 400));
      }
    }
  );

  registerAssetMutationRoutes(app, upload);
}

function registerAssetMutationRoutes(
  app: Express,
  upload: { single(fieldName: string): RequestHandler }
): void {
  app.post("/api/workspaces/:workspaceId/assets/validate", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;

    try {
      const response = await validateWorkspaceAssets(context.workspace);
      res.json(response);
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.post("/api/workspaces/:workspaceId/assets/bulk", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
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
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    await handleAssetUpload(req, res, context);
  });

  app.post("/api/workspaces/:workspaceId/assets/import/preview", upload.single("file"), async (req, res) => {
    const context = await requireWorkspaceAccess(req, res);
    if (!context) return;
    await handleAssetImportPreview(req, res);
  });

  app.post("/api/workspaces/:workspaceId/assets/:query/validate", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;

    try {
      const response = await validateWorkspaceAsset(context.workspace, req.params.query);
      res.json(response);
    } catch (error) {
      sendError(res, error, 400);
    }
  });

  app.delete("/api/workspaces/:workspaceId/assets/:query", async (req, res) => {
    const context = await requireWorkspaceAdminAccess(req, res);
    if (!context) return;
    await deleteAsset(req, res, context);
  });

  app.post(
    "/api/workspaces/:workspaceId/assets/:query/versions/:version/rollback",
    async (req, res) => {
      const context = await requireWorkspaceAdminAccess(req, res);
      if (!context) return;
      setPrivateNoStore(res);
      try {
        res.json(await rollbackWorkspaceAssetVersion({
          context,
          assetQuery: req.params.query,
          version: readVersion(req.params.version)
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendError(res, error, assetVersionErrorStatus(message, 400));
      }
    }
  );
}

function readVersion(value: string): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Version must be a positive integer.");
  }
  return version;
}

function assetVersionErrorStatus(message: string, fallback: number): number {
  if (message.includes("no longer retained")) return 410;
  if (message === "Asset not found." || message === "Asset version not found.") return 404;
  return fallback;
}

function readAssetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
