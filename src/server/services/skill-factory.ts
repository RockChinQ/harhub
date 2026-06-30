import type { Request, Response } from "express";
import { createSkillSkeleton } from "../../features/skills/index.js";
import type { WorkspaceRecord } from "../../shared/types.js";
import { scanAndPersistWorkspace } from "./workspace-catalogs.js";
import { sendError, unique } from "../utils/http.js";

export function createSkillAsset(
  req: Request,
  res: Response,
  workspace: WorkspaceRecord,
  defaultOwner: string
): void {
  try {
    if (!String(req.body?.name ?? "").trim()) {
      throw new Error("Skill name is required.");
    }

    const skillPath = createSkillSkeleton({
      name: String(req.body.name),
      dir: String(req.body?.dir ?? workspace.skillRoot),
      description:
        typeof req.body?.description === "string" ? req.body.description : undefined,
      owner:
        typeof req.body?.owner === "string" && req.body.owner.trim()
          ? req.body.owner
          : defaultOwner,
      tags: Array.isArray(req.body?.tags)
        ? req.body.tags.filter((tag: unknown): tag is string => typeof tag === "string")
        : []
    });

    const response = scanAndPersistWorkspace(
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
