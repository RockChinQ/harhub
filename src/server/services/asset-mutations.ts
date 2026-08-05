import type { Request, Response } from "express";
import {
  assetStorageObjects,
  findAsset,
  removeCatalogAsset
} from "../../features/assets/index.js";
import {
  removeAssetShares,
} from "../../state/index.js";
import { deleteStoredObject } from "../../storage/index.js";
import { assertWorkspaceAdminContext } from "../authorization.js";
import { sendError, unique } from "../utils/http.js";
import { assetListPayload } from "./asset-responses.js";
import { mutateWorkspaceAssetCatalog } from "./workspace-catalogs.js";
import type { WorkspaceContext } from "../../state/types.js";

export async function deleteAsset(
  req: Request,
  res: Response,
  context: WorkspaceContext
): Promise<void> {
  try {
    assertWorkspaceAdminContext(context);
    type DeleteResult =
      | { status: 404 }
      | { status: 400 }
      | { status: 200; assetId: string; storageObjects: ReturnType<typeof assetStorageObjects> };
    const { catalog: nextCatalog, value } = await mutateWorkspaceAssetCatalog<DeleteResult>(context.workspace, async (catalog) => {
      const asset = findAsset(catalog, req.params.query);
      if (!asset) return { catalog, value: { status: 404 as const } };
      const storageObjects = assetStorageObjects(asset);
      if (storageObjects.length === 0) return { catalog, value: { status: 400 as const } };
      return { catalog: removeCatalogAsset(catalog, asset.id), value: { status: 200 as const, assetId: asset.id, storageObjects } };
    });
    if (value.status === 404) { res.status(404).json({ error: "Asset not found" }); return; }
    if (value.status === 400) { res.status(400).json({ error: "Asset has no removable storage object." }); return; }
    await Promise.all(value.storageObjects.map((storage) => deleteStoredObject(storage).catch(() => undefined)));
    await removeAssetShares(context.workspace.id, [value.assetId]);
    res.json({ ...assetListPayload(context.workspace, nextCatalog.generatedAt, nextCatalog.assets), issues: [] });
  } catch (error) {
    sendError(res, error, 400);
  }
}

export async function deleteWorkspaceAssetBatch(
  context: WorkspaceContext,
  queries: string[]
) {
  assertWorkspaceAdminContext(context);
  const { catalog, value: { succeeded, failed, storageToDelete } } = await mutateWorkspaceAssetCatalog(context.workspace, async (original) => {
    let catalog = original;
    const succeeded: string[] = [];
    const storageToDelete = [] as ReturnType<typeof assetStorageObjects>;
    const failed: Array<{ id: string; error: string }> = [];
    for (const query of unique(queries.map((item) => item.trim()).filter(Boolean))) {
      const asset = findAsset(catalog, query);
      if (!asset) { failed.push({ id: query, error: "Asset not found." }); continue; }
      const storageObjects = assetStorageObjects(asset);
      if (storageObjects.length === 0) { failed.push({ id: query, error: "Only uploaded skill packages can be bulk deleted." }); continue; }
      catalog = removeCatalogAsset(catalog, asset.id);
      storageToDelete.push(...storageObjects);
      succeeded.push(asset.id);
    }
    return { catalog, value: { succeeded, failed, storageToDelete } };
  });
  if (succeeded.length > 0) {
    await Promise.all(storageToDelete.map((storage) => deleteStoredObject(storage).catch(() => undefined)));
    await removeAssetShares(context.workspace.id, succeeded);
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
