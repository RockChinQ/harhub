import path from "node:path";
import type { Request, Response } from "express";
import {
  createUploadedSkillAsset,
  upsertAsset,
  writeAssetCatalog
} from "../../features/assets/index.js";
import { contentHash } from "../../shared/markdown.js";
import type { AssetRecord } from "../../shared/types.js";
import { getWorkspaceAssetCatalogPath } from "../../state/index.js";
import {
  deleteStoredObject,
  uploadSkillZipObject
} from "../../storage/index.js";
import type { requireWorkspaceAccess } from "../auth.js";
import { readOptionalStringList, sendError } from "../utils/http.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";
import { assetListPayload } from "./asset-responses.js";

type WorkspaceContext = NonNullable<ReturnType<typeof requireWorkspaceAccess>>;

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
    const requestedName = requestedAssetName(file.originalname, req.body?.name);
    const checksum = contentHash(file.buffer);
    uploaded = await uploadSkillZipObject({
      workspaceId: context.workspace.id,
      objectName: requestedName,
      originalName: file.originalname,
      body: file.buffer,
      contentType: file.mimetype || "application/zip",
      checksum
    });

    const asset = await createUploadedSkillAsset({
      workspaceId: context.workspace.id,
      fileName: file.originalname,
      buffer: file.buffer,
      storage: uploaded,
      name: requestedName,
      description:
        typeof req.body?.description === "string" ? req.body.description : undefined,
      owner: typeof req.body?.owner === "string" ? req.body.owner : context.account.name,
      tags: readOptionalStringList(req.body?.tags)
    });
    const catalog = upsertAsset(loadOrCreateWorkspaceAssetCatalog(context.workspace), asset);
    writeAssetCatalog(getWorkspaceAssetCatalogPath(context.workspace.id), catalog);

    res.status(201).json({
      ...assetListPayload(context.workspace, catalog.generatedAt, catalog.assets),
      uploaded: asset,
      skills: catalog.skills,
      issues: []
    });
  } catch (error) {
    if (uploaded) await deleteStoredObject(uploaded).catch(() => undefined);
    sendError(res, error, 400);
  }
}

function requestedAssetName(fileName: string, inputName: unknown): string {
  return typeof inputName === "string" && inputName.trim()
    ? inputName.trim()
    : path.basename(fileName, path.extname(fileName));
}
