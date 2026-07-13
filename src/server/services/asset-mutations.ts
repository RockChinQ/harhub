import type { Request, Response } from "express";
import {
  findAsset,
  removeCatalogAsset
} from "../../features/assets/index.js";
import { writeWorkspaceAssetCatalog } from "../../state/index.js";
import { deleteStoredObject } from "../../storage/index.js";
import { sendError, unique } from "../utils/http.js";
import { assetListPayload } from "./asset-responses.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";
import type { WorkspaceContext } from "../../state/types.js";

export async function deleteAsset(
  req: Request,
  res: Response,
  context: WorkspaceContext
): Promise<void> {
  try {
    const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const asset = findAsset(catalog, req.params.query);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    if (asset.storage) {
      await deleteStoredObject(asset.storage);
      const nextCatalog = removeCatalogAsset(catalog, asset.id);
      await writeWorkspaceAssetCatalog(context.workspace.id, nextCatalog);
      res.json({
        ...assetListPayload(context.workspace, nextCatalog.generatedAt, nextCatalog.assets),
        issues: []
      });
      return;
    }

    res.status(400).json({ error: "Asset has no removable storage object." });
  } catch (error) {
    sendError(res, error, 400);
  }
}

export async function deleteWorkspaceAssetBatch(
  context: WorkspaceContext,
  queries: string[]
) {
  let catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const query of unique(queries.map((item) => item.trim()).filter(Boolean))) {
    const asset = findAsset(catalog, query);
    if (!asset) {
      failed.push({ id: query, error: "Asset not found." });
      continue;
    }

    if (!asset.storage) {
      failed.push({ id: query, error: "Only uploaded skill packages can be bulk deleted." });
      continue;
    }

    try {
      await deleteStoredObject(asset.storage);
      catalog = removeCatalogAsset(catalog, asset.id);
      succeeded.push(asset.id);
    } catch (error) {
      failed.push({
        id: asset.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (succeeded.length > 0) {
    await writeWorkspaceAssetCatalog(context.workspace.id, catalog);
  }

  return {
    ...assetListPayload(context.workspace, catalog.generatedAt, catalog.assets),
    issues: [],
    bulk: {
      action: "delete" as const,
      requested: queries.length,
      succeeded,
      failed
    }
  };
}
