import type { Request, Response } from "express";
import {
  findAsset,
  removeCatalogAsset,
  updateCatalogAsset,
  writeAssetCatalog
} from "../../features/assets/index.js";
import {
  deleteSkill,
  updateSkillMetadata
} from "../../features/skills/index.js";
import { getWorkspaceAssetCatalogPath } from "../../state/index.js";
import { deleteStoredObject } from "../../storage/index.js";
import type { requireWorkspaceAccess } from "../auth.js";
import { sendError, unique } from "../utils/http.js";
import { assetListPayload } from "./asset-responses.js";
import {
  loadOrCreateWorkspaceAssetCatalog,
  scanAndPersistWorkspace
} from "./workspace-catalogs.js";
import type { AssetCatalog, SkillRecord } from "../../shared/types.js";

type WorkspaceContext = NonNullable<ReturnType<typeof requireWorkspaceAccess>>;

export function patchAsset(
  req: Request,
  res: Response,
  context: WorkspaceContext
): void {
  try {
    const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const asset = findAsset(catalog, req.params.query);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const skill = findCatalogSkillForAsset(catalog, asset.id);
    if (!skill) {
      const nextCatalog = updateCatalogAsset(catalog, asset.id, readAssetMetadataBody(req.body));
      writeAssetCatalog(getWorkspaceAssetCatalogPath(context.workspace.id), nextCatalog);
      res.json({
        ...assetListPayload(context.workspace, nextCatalog.generatedAt, nextCatalog.assets),
        issues: []
      });
      return;
    }

    updateSkillMetadata(skill, readAssetMetadataBody(req.body));
    res.json(rescanWorkspaceAssets(context));
  } catch (error) {
    sendError(res, error, 400);
  }
}

export async function deleteAsset(
  req: Request,
  res: Response,
  context: WorkspaceContext
): Promise<void> {
  try {
    const catalog = loadOrCreateWorkspaceAssetCatalog(context.workspace);
    const asset = findAsset(catalog, req.params.query);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    if (asset.storage) {
      await deleteStoredObject(asset.storage);
      const nextCatalog = removeCatalogAsset(catalog, asset.id);
      writeAssetCatalog(getWorkspaceAssetCatalogPath(context.workspace.id), nextCatalog);
      res.json({
        ...assetListPayload(context.workspace, nextCatalog.generatedAt, nextCatalog.assets),
        issues: []
      });
      return;
    }

    const skill = findCatalogSkillForAsset(catalog, asset.id);
    if (!skill) {
      res.status(400).json({ error: "Asset has no removable storage object." });
      return;
    }

    deleteSkill(skill);
    res.json(rescanWorkspaceAssets(context));
  } catch (error) {
    sendError(res, error, 400);
  }
}

function rescanWorkspaceAssets(context: WorkspaceContext) {
  return scanAndPersistWorkspace(
    context.workspace,
    unique([context.workspace.skillRoot, ...context.workspace.defaultScanPaths])
  );
}

function readAssetMetadataBody(body: unknown) {
  const value = body as Record<string, unknown> | undefined;
  return {
    description: typeof value?.description === "string" ? value.description : undefined
  };
}

function findCatalogSkillForAsset(catalog: AssetCatalog, assetId: string): SkillRecord | undefined {
  const skillId = assetId.replace(/^asset:skill:/, "skill:");
  return catalog.skills.find((skill) => skill.id === skillId);
}
