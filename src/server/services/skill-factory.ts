import type { Request, Response } from "express";
import { createSkillSkeleton } from "../../features/skills/index.js";
import type { WorkspaceRecord } from "../../shared/types.js";
import { scanAndPersistWorkspace } from "./workspace-catalogs.js";
import { sendError, unique } from "../utils/http.js";

export async function createSkillAsset(
  req: Request,
  res: Response,
  workspace: WorkspaceRecord
): Promise<void> {
  try {
    if (!String(req.body?.name ?? "").trim()) {
      throw new Error("Skill name is required.");
    }

    const skillPath = createSkillSkeleton({
      name: String(req.body.name),
      dir: String(req.body?.dir ?? workspace.skillRoot),
      description:
        typeof req.body?.description === "string" ? req.body.description : undefined
    });

    const response = await scanAndPersistWorkspace(
      workspace,
      unique([workspace.skillRoot, ...workspace.defaultScanPaths])
    );

    res.status(201).json({
      path: skillPath,
      ...response
    });
  } catch (error) {
    sendError(res, error, 400);
  }
}
