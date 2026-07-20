import type { Request, Response } from "express";

import {
  createImportedSkillAsset,
  upsertAsset
} from "../../features/assets/index.js";
import {
  discoverSkillsInArchive,
  type DiscoveredSkill
} from "../../features/skills/index.js";
import type {
  AssetCatalog,
  AssetRecord,
  SkillImportCandidate,
  SkillImportPreview,
  StoredObject
} from "../../shared/types.js";
import { writeWorkspaceAssetCatalog } from "../../state/index.js";
import type { WorkspaceContext } from "../../state/types.js";
import {
  deleteStoredObject,
  uploadSkillFiles
} from "../../storage/index.js";
import { sendError } from "../utils/http.js";
import { assetListPayload } from "./asset-responses.js";
import { loadOrCreateWorkspaceAssetCatalog } from "./workspace-catalogs.js";

export async function handleAssetImportPreview(
  req: Request,
  res: Response
): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "A zip file is required." });
    return;
  }

  try {
    const candidates = await discoverSkillsInArchive(file.buffer);
    const response: SkillImportPreview = {
      fileName: file.originalname,
      fileSize: file.size,
      candidates: candidates.map(toImportCandidate)
    };
    res.json(response);
  } catch (error) {
    sendError(res, error, 400);
  }
}

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

  const storedAssets: AssetRecord[] = [];
  const newStorage: StoredObject[] = [];
  try {
    const candidates = await discoverSkillsInArchive(file.buffer);
    const selected = selectCandidates(candidates, req.body?.selectedSkillPaths);
    validateSelectedCandidates(selected);

    const originalCatalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
    let catalog: AssetCatalog = originalCatalog;
    const replacedStorage: StoredObject[] = [];

    for (const skill of selected) {
      const assetId = `asset:skill:${context.workspace.id}:${skill.name}`;
      const previous = originalCatalog.assets.find((item) => item.id === assetId);
      const hasSamePackage =
        previous?.storage?.checksum === skill.checksum;
      const storage = hasSamePackage && previous.storage
        ? previous.storage
        : await uploadSkillFiles({
            workspaceId: context.workspace.id,
            skillName: skill.name,
            files: skill.files,
            checksum: skill.checksum
          });
      if (!hasSamePackage) newStorage.push(storage);
      const asset = createImportedSkillAsset({
        workspaceId: context.workspace.id,
        skill,
        storage,
        previous,
        createdByAccountId: context.account.id
      });
      if (!hasSamePackage && previous?.storage) replacedStorage.push(previous.storage);
      storedAssets.push(asset);
      catalog = upsertAsset(catalog, asset);
    }

    await writeWorkspaceAssetCatalog(context.workspace.id, catalog);
    await Promise.all(replacedStorage.map((storage) =>
      deleteStoredObject(storage).catch(() => undefined)
    ));

    res.status(201).json({
      ...assetListPayload(context.workspace, catalog.generatedAt, catalog.assets),
      uploaded: storedAssets,
      issues: storedAssets.flatMap((asset) => asset.validationIssues ?? [])
    });
  } catch (error) {
    await Promise.all(newStorage.map((storage) =>
      deleteStoredObject(storage).catch(() => undefined)
    ));
    sendError(res, error, 400);
  }
}

function selectCandidates(
  candidates: DiscoveredSkill[],
  rawSelection: unknown
): DiscoveredSkill[] {
  const selectedPaths = readSelectedPaths(rawSelection);
  if (selectedPaths === undefined) {
    const valid = candidates.filter((candidate) => candidate.validation.errors === 0);
    if (valid.length === 0) throw new Error("This zip contains no valid Skills to import.");
    return valid;
  }
  if (selectedPaths.length === 0) throw new Error("Select at least one Skill to import.");

  const byPath = new Map(candidates.map((candidate) => [candidate.skillPath, candidate]));
  return selectedPaths.map((skillPath) => {
    const candidate = byPath.get(skillPath);
    if (!candidate) throw new Error(`Selected SKILL.md was not found: ${skillPath}`);
    return candidate;
  });
}

function readSelectedPaths(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("selectedSkillPaths must be a JSON array of SKILL.md paths.");
    }
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("selectedSkillPaths must be a JSON array of SKILL.md paths.");
  }
  return Array.from(new Set(parsed.map((item) => item.trim()).filter(Boolean)));
}

function validateSelectedCandidates(candidates: DiscoveredSkill[]): void {
  const invalid = candidates.find((candidate) => candidate.validation.errors > 0);
  if (invalid) {
    const firstError = invalid.validationIssues.find((issue) => issue.severity === "error");
    throw new Error(
      `Cannot import ${invalid.skillPath}: ${firstError?.message ?? "Skill validation failed."}`
    );
  }

  const names = new Set<string>();
  for (const candidate of candidates) {
    if (names.has(candidate.name)) {
      throw new Error(`The selected Skills contain duplicate name "${candidate.name}".`);
    }
    names.add(candidate.name);
  }
}

function toImportCandidate(skill: DiscoveredSkill): SkillImportCandidate {
  return {
    skillPath: skill.skillPath,
    rootPath: skill.rootPath,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    health: skill.health,
    validation: skill.validation,
    validationIssues: skill.validationIssues,
    fileCount: skill.fileCount,
    size: skill.size
  };
}
