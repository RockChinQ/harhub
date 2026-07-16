import path from "node:path";
import type { Request, Response } from "express";
import {
  createUploadedSkillAsset,
  upsertAsset,
  validateUploadedSkillZip
} from "../../features/assets/index.js";
import { validateSkillArchive } from "../../features/skills/index.js";
import type { AssetRecord } from "../../shared/types.js";
import { writeWorkspaceAssetCatalog } from "../../state/index.js";
import {
  deleteStoredObject,
  uploadSkillZipObject
} from "../../storage/index.js";
import { sendError } from "../utils/http.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";
import { assetListPayload } from "./asset-responses.js";
import type { WorkspaceContext } from "../../state/types.js";

export async function handleAssetUpload(
  req: Request,
  res: Response,
  context: WorkspaceContext
): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "A zip file is required." });
    return;
  }

  let uploaded: AssetRecord["storage"] | undefined;
  try {
    const requestedName = requestedAssetName(file.originalname);
    const archive = await validateSkillArchive(file.buffer);
    const checksum = archive.checksum;
    await validateUploadedSkillZip({
      workspaceId: context.workspace.id,
      fileName: file.originalname,
      buffer: archive.buffer,
      name: requestedName
    });

    uploaded = await uploadSkillZipObject({
      workspaceId: context.workspace.id,
      objectName: requestedName,
      originalName: file.originalname,
      body: archive.buffer,
      contentType: file.mimetype || "application/zip",
      checksum
    });

    const asset = await createUploadedSkillAsset({
      workspaceId: context.workspace.id,
      fileName: file.originalname,
      buffer: archive.buffer,
      storage: uploaded,
      name: requestedName
    });
    const catalog = upsertAsset(await loadOrCreateWorkspaceAssetCatalog(context.workspace), asset);
    await writeWorkspaceAssetCatalog(context.workspace.id, catalog);

    res.status(201).json({
      ...assetListPayload(context.workspace, catalog.generatedAt, catalog.assets),
      uploaded: asset,
      issues: []
    });
  } catch (error) {
    if (uploaded) await deleteStoredObject(uploaded).catch(() => undefined);
    sendError(res, error, 400);
  }
}

function requestedAssetName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName));
}
