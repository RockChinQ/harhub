import type { Request, Response } from "express";

import {
  createImportedSkillAsset,
  obsoleteAssetStorageObjects,
  upsertAsset
} from "../../features/assets/index.js";
import {
  analyzeMcpConfiguration,
  createImportedMcpAsset,
  MCP_CONFIG_FILE_NAME
} from "../../features/mcp/index.js";
import {
  discoverSkillsInArchive,
  type DiscoveredSkill
} from "../../features/skills/index.js";
import type {
  AssetCatalog,
  AssetProvenance,
  AssetRecord,
  SkillImportCandidate,
  SkillImportPreview,
  StoredObject
} from "../../shared/types.js";
import { slugify } from "../../shared/markdown.js";
import { serializeStateAccess } from "../../state/access.js";
import { writeWorkspaceAssetCatalog } from "../../state/index.js";
import type { WorkspaceContext } from "../../state/types.js";
import { assertWorkspaceAdminContext } from "../authorization.js";
import {
  deleteStoredObject,
  uploadAssetFiles,
  uploadSkillFiles
} from "../../storage/index.js";
import { MCP_CONFIG_CHECKSUM_ALGORITHM } from "../../shared/types.js";
import { sendError } from "../utils/http.js";
import { assetListPayload } from "./asset-responses.js";
import { importSkillsCommand, provenanceUrl } from "./skills-command-import.js";
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

export async function handleSkillsCommandImport(
  req: Request,
  res: Response,
  context: WorkspaceContext
): Promise<void> {
  assertWorkspaceAdminContext(context);
  if (typeof req.body?.command !== "string" || !req.body.command.trim()) {
    res.status(400).json({ error: "An npx skills add command or supported Skill source is required." });
    return;
  }

  try {
    const imported = await importSkillsCommand(req.body.command);
    const importedAt = new Date().toISOString();
    const provenance: AssetProvenance = {
      type: "skills-command",
      source: provenanceUrl(imported.command.source),
      url: provenanceUrl(imported.command.source),
      canonicalUrl: provenanceUrl(imported.source.canonicalSource),
      ...(imported.source.resolvedContentDigest ? { resolvedContentDigest: imported.source.resolvedContentDigest } : {}),
      sourceType: imported.source.type,
      ...(imported.command.skills.length > 0 ? { skills: imported.command.skills } : {}),
      ...(imported.command.fullDepth ? { fullDepth: true } : {}),
      importedAt,
      skillsResolved: imported.resolvedSkills
    };
    await storeSkillCandidates(res, context, imported.candidates, {
      provenance,
      versionSummary: `Imported from ${imported.source.canonicalSource}`,
      allowInvalid: true
    });
  } catch (error) {
    sendError(res, error, 400);
  }
}

export async function handleAssetUpload(
  req: Request,
  res: Response,
  context: WorkspaceContext
): Promise<void> {
  assertWorkspaceAdminContext(context);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "A zip file is required." });
    return;
  }

  try {
    const candidates = await discoverSkillsInArchive(file.buffer);
    const selected = selectCandidates(candidates, req.body?.selectedSkillPaths);
    await storeSkillCandidates(res, context, selected);
  } catch (error) {
    sendError(res, error, 400);
  }
}

async function storeSkillCandidates(
  res: Response,
  context: WorkspaceContext,
  selected: DiscoveredSkill[],
  metadata: {
    provenance?: AssetProvenance;
    versionSummary?: string;
    allowInvalid?: boolean;
  } = {}
): Promise<void> {
  if (metadata.allowInvalid) validateCandidateNames(selected);
  else validateSelectedCandidates(selected);

  const storedAssets: AssetRecord[] = [];
  const newStorage: StoredObject[] = [];
  try {
    const { catalog, obsoleteStorage } = await serializeStateAccess(async () => {
      const originalCatalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
      let catalog: AssetCatalog = originalCatalog;
      const obsoleteStorage: StoredObject[] = [];

      for (const skill of selected) {
        const assetId = `asset:skill:${context.workspace.id}:${skill.name}`;
        const previous = originalCatalog.assets.find((item) => item.id === assetId);
        const hasSamePackage = previous?.storage?.checksum === skill.checksum;
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
          rejectInvalid: metadata.allowInvalid ? false : undefined,
          createdByAccountId: context.account.id,
          ...(metadata.provenance ? { provenance: metadata.provenance } : {}),
          ...(metadata.versionSummary ? { versionSummary: metadata.versionSummary } : {})
        });
        if (previous) {
          obsoleteStorage.push(...obsoleteAssetStorageObjects([previous], [asset]));
        }
        storedAssets.push(asset);
        catalog = upsertAsset(catalog, asset);
      }

      await writeWorkspaceAssetCatalog(context.workspace.id, catalog);
      return { catalog, obsoleteStorage };
    });
    await Promise.all(obsoleteStorage.map((storage) =>
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

export async function handleMcpAssetUpload(
  req: Request,
  res: Response,
  context: WorkspaceContext
): Promise<void> {
  assertWorkspaceAdminContext(context);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "An MCP JSON configuration file is required." });
    return;
  }

  const displayName = requiredText(req.body?.name, "name", 120);
  const name = slugify(displayName);
  if (!name) {
    res.status(400).json({ error: "MCP name must contain letters or numbers." });
    return;
  }
  const description = requiredText(req.body?.description, "description", 1_000);
  let storage: StoredObject | undefined;
  try {
    const analyzed = analyzeMcpConfiguration(file.buffer);
    if (analyzed.validation.errors > 0) {
      throw new Error(
        analyzed.validationIssues.find((issue) => issue.severity === "error")?.message ??
        "MCP configuration validation failed."
      );
    }
    const { catalog, asset, obsoleteStorage } = await serializeStateAccess(async () => {
      const originalCatalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace);
      const assetId = `asset:mcp:${context.workspace.id}:${name}`;
      const previous = originalCatalog.assets.find((item) => item.id === assetId);
      const hasSameConfig = previous?.storage?.checksum === analyzed.checksum;
      storage = hasSameConfig && previous.storage
        ? previous.storage
        : await uploadAssetFiles({
            workspaceId: context.workspace.id,
            kind: "mcp",
            assetName: name,
            files: [{ path: MCP_CONFIG_FILE_NAME, content: analyzed.content }],
            checksum: analyzed.checksum,
            checksumAlgorithm: MCP_CONFIG_CHECKSUM_ALGORITHM
          });
      const asset = createImportedMcpAsset({
        workspaceId: context.workspace.id,
        name,
        displayName,
        description,
        analyzed,
        storage,
        previous,
        createdByAccountId: context.account.id
      });
      const catalog = upsertAsset(originalCatalog, asset);
      await writeWorkspaceAssetCatalog(context.workspace.id, catalog);
      return {
        catalog,
        asset,
        obsoleteStorage: obsoleteAssetStorageObjects(previous ? [previous] : [], [asset])
      };
    });
    await Promise.all(obsoleteStorage.map((candidate) =>
      deleteStoredObject(candidate).catch(() => undefined)
    ));
    res.status(201).json({
      ...assetListPayload(context.workspace, catalog.generatedAt, catalog.assets),
      uploaded: [asset],
      issues: asset.validationIssues ?? []
    });
  } catch (error) {
    if (storage) {
      const catalog = await loadOrCreateWorkspaceAssetCatalog(context.workspace).catch(() => undefined);
      const retained = catalog?.assets.some((asset) =>
        asset.storage?.bucket === storage?.bucket && asset.storage?.key === storage?.key
      );
      if (!retained) await deleteStoredObject(storage).catch(() => undefined);
    }
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

  validateCandidateNames(candidates);
}

function validateCandidateNames(candidates: DiscoveredSkill[]): void {
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

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return text;
}
