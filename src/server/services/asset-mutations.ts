import type { Request, Response } from "express";
import {
  findAsset,
  removeCatalogAsset
} from "../../features/assets/index.js";
import {
  deleteSkill,
  updateSkillFrontmatter
} from "../../features/skills/index.js";
import { writeWorkspaceAssetCatalog } from "../../state/index.js";
import { deleteStoredObject } from "../../storage/index.js";
import { sendError, unique } from "../utils/http.js";
import { assetListPayload } from "./asset-responses.js";
import {
  loadOrCreateWorkspaceAssetCatalog,
  scanAndPersistWorkspace
} from "./workspace-catalogs.js";
import type { AssetCatalog, SkillRecord } from "../../shared/types.js";
import type { WorkspaceContext } from "../../state/types.js";

export async function patchAsset(
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

    const skill = findCatalogSkillForAsset(catalog, asset.id);
    if (!skill) {
      res.status(400).json({
        error: "Uploaded skill packages are immutable. Update SKILL.md and upload a new zip."
      });
      return;
    }

    updateSkillFrontmatter(skill, readSkillFrontmatterBody(req.body));
    res.json(await rescanWorkspaceAssets(context));
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

    const skill = findCatalogSkillForAsset(catalog, asset.id);
    if (!skill) {
      res.status(400).json({ error: "Asset has no removable storage object." });
      return;
    }

    deleteSkill(skill);
    res.json(await rescanWorkspaceAssets(context));
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

function readSkillFrontmatterBody(body: unknown) {
  const value = body as Record<string, unknown> | undefined;
  return {
    description: typeof value?.description === "string" ? value.description : undefined
  };
}

function findCatalogSkillForAsset(catalog: AssetCatalog, assetId: string): SkillRecord | undefined {
  const skillId = assetId.replace(/^asset:skill:/, "skill:");
  return catalog.skills.find((skill) => skill.id === skillId);
}
